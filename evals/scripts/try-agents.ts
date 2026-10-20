import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV_FILE = fileURLToPath(new URL('../../.env.local', import.meta.url));
const KEY_NAMES = ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'] as const;

const readEnvFile = (path: string): Record<string, string> => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const vars: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, name, value] = match;
    if (name === undefined || value === undefined) continue;
    vars[name] = value.replace(/^(["'])(.*)\1$/, '$2');
  }
  return vars;
};

const resolveKey = (): string | undefined => {
  const fromFile = readEnvFile(ENV_FILE);
  for (const name of KEY_NAMES) {
    const value = process.env[name] || fromFile[name];
    if (value) return value;
  }
  return undefined;
};

const key = resolveKey();
if (!key) {
  console.error(`No Gemini key found. Set ${KEY_NAMES.join(' or ')} in the environment or in ${ENV_FILE}.`);
  process.exit(2);
}
process.env.GEMINI_API_KEY = key;

const app = await import('../app/src/index.ts');
const { REFUNDS } = await import('../app/src/db.ts');

type Turn = Awaited<ReturnType<typeof app.supportTurn>>;

const show = (label: string, turn: Turn) => {
  const interrupts = turn.interrupts.map((i) => `${i.name}(${JSON.stringify(i.input)})`).join(', ') || '-';
  console.log(
    `${label}\n  finishReason=${turn.finishReason} messageCount=${turn.messageCount} session=${turn.sessionId.slice(0, 8)}\n` +
      `  toolCalls=[${turn.toolCalls.join(', ')}] interrupts=${interrupts}\n  text=${JSON.stringify(turn.text.slice(0, 160))}` +
      `${turn.error ? `\n  error=${turn.error}` : ''}\n`,
  );
};

const REFUND_MESSAGE = 'I want a refund for order A-1001, it arrived broken.';
const failures: string[] = [];
const expect = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${what}`);
};

const scenario = async (name: string, run: () => Promise<void>) => {
  console.log(`== ${name}`);
  try {
    await run();
  } catch (error) {
    failures.push(`${name} threw`);
    console.error(`  FAIL threw\n${error instanceof Error ? error.stack : String(error)}`);
  }
  console.log();
};

await scenario('supportTurn: order question delegates to orderAgent and reports the ETA', async () => {
  const turn = await app.supportTurn({ message: 'Where is order A-1001?' });
  show('turn', turn);
  expect(turn.toolCalls.includes('delegate_to_orderAgent'), 'toolCalls includes delegate_to_orderAgent');
  expect(/shipped/i.test(turn.text), 'text mentions shipped');
  expect(turn.text.includes('2026-10-22'), 'text gives the ETA 2026-10-22');
});

let refundSession = '';
await scenario('refundTurn: refund request pauses for approval', async () => {
  const turn = await app.refundTurn({ message: REFUND_MESSAGE });
  show('turn', turn);
  refundSession = turn.sessionId;
  expect(turn.finishReason === 'interrupted', 'finishReason is interrupted');
  expect(
    turn.interrupts.some((i) => i.name === 'approveRefund'),
    'interrupt named approveRefund',
  );
  expect(!turn.toolCalls.includes('issueRefund'), 'issueRefund not called yet');
});

await scenario('refundTurn: resume with approval issues the refund', async () => {
  const before = Object.keys(REFUNDS).length;
  const turn = await app.refundTurn({ sessionId: refundSession, respond: { approved: true } });
  show('turn', turn);
  expect(turn.toolCalls.includes('issueRefund'), 'toolCalls includes issueRefund');
  expect(turn.finishReason === 'stop', 'finishReason is stop');
  expect(Object.keys(REFUNDS).length === before + 1, 'REFUNDS gained a row');
});

await scenario('refundTurn: resume with a declined approval issues nothing', async () => {
  const asked = await app.refundTurn({ message: REFUND_MESSAGE });
  show('turn 1', asked);
  expect(asked.finishReason === 'interrupted', 'finishReason is interrupted');
  const before = Object.keys(REFUNDS).length;
  const turn = await app.refundTurn({ sessionId: asked.sessionId, respond: { approved: false, note: 'duplicate claim' } });
  show('turn 2', turn);
  expect(!turn.toolCalls.includes('issueRefund'), 'issueRefund not called');
  expect(!/\bR-\d+/.test(turn.text), 'text quotes no refund id');
  expect(turn.finishReason === 'stop', 'finishReason is stop');
  expect(Object.keys(REFUNDS).length === before, 'REFUNDS unchanged');
});

await scenario('supportTurn: two turns share one session', async () => {
  const first = await app.supportTurn({ message: 'My order is A-1001.' });
  show('turn 1', first);
  const second = await app.supportTurn({ sessionId: first.sessionId, message: 'What is its status?' });
  show('turn 2', second);
  expect(second.sessionId === first.sessionId, 'same sessionId');
  expect(second.messageCount > first.messageCount, 'messageCount grew');
  expect(/shipped/i.test(second.text), 'text mentions shipped');
});

await scenario('supportTurn: refund request through triage (reports what a delegated interrupt becomes)', async () => {
  const turn = await app.supportTurn({ message: REFUND_MESSAGE });
  show('turn', turn);
  console.log(
    `  FINDING sub-agent interrupt is ${turn.interrupts.length > 0 ? 'propagated to supportTurn' : 'not propagated (finishReason=' + turn.finishReason + ')'}`,
  );
  expect(turn.toolCalls.includes('delegate_to_refundAgent'), 'toolCalls includes delegate_to_refundAgent');
});

console.log(failures.length === 0 ? 'all scenarios passed' : `${failures.length} checks failed:\n- ${failures.join('\n- ')}`);
process.exit(failures.length === 0 ? 0 : 1);
