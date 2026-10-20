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

const runs: Record<string, () => Promise<unknown>> = {
  summarizeTicket: () =>
    app.summarizeTicket({
      text: 'My order A-1002 arrived with a cracked monitor and the box was soaked. I need a replacement before Monday for a client demo.',
    }),
  orderStatus: () => app.orderStatus({ question: 'Where is order A-1001?' }),
  orderStatusLowercaseId: () => app.orderStatus({ question: 'where is order a-1001?' }),
  greet: () => app.greet({ customerName: 'Ada' }),
  draftReply: () =>
    app.draftReply({
      ticket:
        'Hi, I ordered three boxes of A4 paper two weeks ago (order A-1002) and the tracking page still says processing. Can you tell me what is going on and when it will ship?',
    }),
  chat: () =>
    app.chat({
      history: [
        { role: 'user', text: 'Hi, my name is Ada.' },
        { role: 'model', text: 'Hello Ada, how can I help you today?' },
      ],
      message: 'What is my name?',
    }),
};

let failed = 0;
for (const [name, run] of Object.entries(runs)) {
  try {
    const result = await run();
    console.log(`PASS ${name}\n${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n${error instanceof Error ? error.stack : String(error)}\n`);
  }
}

console.log(`${Object.keys(runs).length - failed}/${Object.keys(runs).length} flows passed`);
process.exit(failed === 0 ? 0 : 1);
