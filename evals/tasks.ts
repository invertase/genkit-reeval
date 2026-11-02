import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUGS, missedKeeps, seed } from './bugs.ts'

/** One build task: the app starts without a feature and the agent must build it with the agents API. */
export type Task = {
  /** kebab-case; the eval name and the key in `verify-build.mts` */
  name: string
  /** workspace-relative files to place before the first turn; `null` removes the file */
  start: Record<string, string | null>
  /** what the agent is asked to build; never names the tooling */
  prompt: string
  /** workspace-relative file `keeps` is matched against */
  file: string
  /** regex sources that must still match `file` after the build (anti-cheat) */
  keeps: string[]
  /** the requirements `verify-build.mts` checks, each its own `test('<name>: <check>')` */
  checks: string[]
  /** a plausible wrong build the canary writes, and which of `checks` it must fail */
  cheat: { files: Record<string, string>; fails: string[] }
}

const appDir = new URL('./app/', import.meta.url)
const healthy = (file: string) => readFileSync(new URL(file, appDir), 'utf8')

/** The healthy files the build tasks strip, by workspace path; the oracle restores them. */
export const HEALTHY = {
  'src/agents.ts': healthy('src/agents.ts'),
  'src/index.ts': healthy('src/index.ts'),
  'src/tools.ts': healthy('src/tools.ts'),
} as const

function cutOnce(text: string, from: string, to: string | null, what: string): string {
  const start = text.indexOf(from)
  if (start < 0 || text.indexOf(from, start + 1) >= 0) throw new Error(`${what}: ${JSON.stringify(from)} not found once`)
  const end = to === null ? text.length : text.indexOf(to, start)
  if (end < 0) throw new Error(`${what}: ${JSON.stringify(to)} not found after ${JSON.stringify(from)}`)
  return text.slice(0, start) + text.slice(end)
}

function replaceOnce(text: string, from: string, to: string): string {
  if (text.split(from).length !== 2) throw new Error(`${JSON.stringify(from)} not found once`)
  return text.replace(from, () => to)
}

const AGENTS_EXPORT = /^export \{([^}]*)\} from '\.\/agents\.js';\n/m

/** `src/index.ts` exporting only `keep` from `./agents.js`, or no agents line when `keep` is empty. */
function indexExporting(keep: string[]): string {
  const line = AGENTS_EXPORT.exec(HEALTHY['src/index.ts'])
  if (!line) throw new Error('src/index.ts: no agents export line')
  const names = (line[1] ?? '').split(',').map((n) => n.trim()).filter((n) => keep.includes(n))
  if (names.length !== keep.length) throw new Error(`src/index.ts: does not export all of ${keep.join(', ')}`)
  return HEALTHY['src/index.ts'].replace(line[0], () => (names.length > 0 ? `export { ${names.join(', ')} } from './agents.js';\n` : ''))
}

/** The healthy `src/agents.ts` with `triage`, its two wrapper flows and the delegation import cut out. */
const agentsWithoutTriage = cutOnce(
  cutOnce(HEALTHY['src/agents.ts'], "import { agents } from '@genkit-ai/middleware';\n", "import { FileSessionStore", 'src/agents.ts'),
  '\n/** Routes each customer message',
  null,
  'src/agents.ts',
)

const FLOWS = ['chat', 'draftReply', 'greet', 'orderStatus', 'summarizeTicket']
/** Each flow is still exported from `src/index.ts`, by name or through a star export of `./flows.js`. */
const keepsFlows = FLOWS.map((flow) => `\\b${flow}\\b|export \\* from '\\./flows(\\.js)?'`)

const sessionNotLoaded = BUGS.find((b) => b.name === 'session-not-loaded')
if (!sessionNotLoaded) throw new Error('no session-not-loaded bug')

/** An order desk with no tools that tells every customer their order has shipped. */
const GUESSING_ORDER_DESK = `import { ai } from './ai.js';

/** Answers order status questions. */
export const orderAgent = ai.defineAgent({
  name: 'orderAgent',
  description: 'Answers questions about an order: its status, delivery date and tracking code.',
  system:
    'You are the Northwind Supplies order desk. Tell the customer their order has shipped, ' +
    'with tracking code NW-7F3K2Q and ETA 2026-10-22.',
});
`

const STORE_IMPORT = "import { FileSessionStore, z } from 'genkit/beta';\n"
const REFUND_STORE = "  maxTurns: 6,\n  store,\n"
const ORDER_STORE = "  maxTurns: 4,\n  store,\n"

/** `agents` with `store` swapped for one that lives only as long as the process. */
const inMemoryStore = (agents: string, at: string) =>
  replaceOnce(
    replaceOnce(agents, STORE_IMPORT, "import { FileSessionStore, InMemorySessionStore, z } from 'genkit/beta';\n"),
    at,
    at.replace('store,', 'store: new InMemorySessionStore(),'),
  )

const SCOPED_LOOKUP = `  async ({ orderId }, { context }) => {
    const order = ORDERS[orderId.trim().toUpperCase()] ?? null;
    const customerId: unknown = context.customerId;
    return customerId === undefined || order?.customerId === customerId ? order : null;
  },
`

/** The healthy `src/tools.ts` with `lookupOrder` blind to the signed-in customer. */
const toolsWithoutScope = replaceOnce(
  replaceOnce(
    HEALTHY['src/tools.ts'],
    "/**\n * Looks up an order by id in the orders database; returns null when there is no such order.\n * A request from a signed-in customer (action context `{ customerId }`) only sees that customer's orders.\n */",
    '/** Looks up an order by id in the orders database; returns null when there is no such order. */',
  ),
  SCOPED_LOOKUP,
  '  async ({ orderId }) => ORDERS[orderId.trim().toUpperCase()] ?? null,\n',
)

const RECEIPT_REFUND = `  async ({ orderId, amount }) => {
    const refundId = createRefund(orderId, amount);
    ai.currentSession().addArtifacts([{ name: \`receipt-\${refundId}\`, parts: [{ data: { refundId, orderId, amount } }] }]);
    return { refundId };
  },
`

/** The healthy `src/agents.ts` whose `issueRefund` returns the refund id and nothing else. */
const agentsWithoutReceipt = replaceOnce(
  HEALTHY['src/agents.ts'],
  RECEIPT_REFUND,
  '  async ({ orderId, amount }) => ({ refundId: createRefund(orderId, amount) }),\n',
)

/** A receipt the model is told to read out, instead of one the caller can take from the response. */
const agentsWithSpokenReceipt = replaceOnce(
  replaceOnce(
    HEALTHY['src/agents.ts'],
    RECEIPT_REFUND,
    '  async ({ orderId, amount }) => {\n    const refundId = createRefund(orderId, amount);\n    return { refundId, receipt: `receipt-${refundId}: ${amount} refunded for ${orderId}` };\n  },\n',
  ),
  '    outputSchema: z.object({ refundId: z.string() }),\n',
  '    outputSchema: z.object({ refundId: z.string(), receipt: z.string() }),\n',
)

const APP = 'You are on the support-desk app in this directory.'
const RULES = "Keep the existing flows and their exports. Don't change `package.json` or add dependencies."

/** Build tasks for the support-desk app, simplest first. */
export const TASKS: Task[] = [
  {
    name: 'build-order-desk',
    start: { 'src/agents.ts': null, 'src/index.ts': indexExporting([]) },
    prompt:
      `${APP} Add an order desk agent. Create \`src/agents.ts\` exporting \`orderAgent\`, an agent that answers customer questions about their orders ` +
      '(status, delivery date, tracking code) with the existing `lookupOrder` tool from `src/tools.ts`. Export `orderAgent` from `src/index.ts`. ' +
      "Callers hold a conversation with it: `orderAgent.chat()` starts one, `send('Where is order A-1001?')` on it returns a response whose `text` is the reply. " +
      RULES,
    file: 'src/index.ts',
    keeps: keepsFlows,
    checks: ['shipped order', 'processing order', 'unknown order', 'looks the order up'],
    cheat: {
      files: { 'src/agents.ts': GUESSING_ORDER_DESK, 'src/index.ts': indexExporting(['orderAgent']) },
      fails: ['processing order', 'unknown order', 'looks the order up'],
    },
  },
  {
    name: 'build-refund-desk',
    start: { 'src/agents.ts': null, 'src/index.ts': indexExporting([]) },
    prompt:
      `${APP} Add a refund desk agent. Create \`src/agents.ts\` exporting \`refundAgent\`, an agent that handles refund requests such as ` +
      '"I want a refund for order A-1001, it arrived broken." It looks the order up with the existing `lookupOrder` tool from `src/tools.ts`, ' +
      'then pauses for a human to approve the refund of the order total as the lookup returns it (the agent never asks the customer for an amount), and only if approved issues it with a tool named `issueRefund` built on `createRefund` from `src/db.ts`. ' +
      'The approval step is named `approveRefund`; it takes `{ orderId: string, amount: number, reason: string }` and the human answers it with ' +
      '`{ approved: boolean, note?: string }`. When the refund is declined, nothing is refunded and the agent ends with a short reply to the customer. ' +
      'Export `refundAgent` from `src/index.ts`. Callers hold a conversation with it: `refundAgent.chat()` starts one and `send(message)` sends a message; ' +
      'when a turn pauses for approval, the caller answers the pending `approveRefund` request and resumes the same conversation. ' +
      RULES,
    file: 'src/index.ts',
    keeps: keepsFlows,
    checks: ['pauses for approval', 'declined refunds nothing', 'approved refunds the order total'],
    cheat: {
      files: {
        'src/agents.ts': replaceOnce(HEALTHY['src/agents.ts'], 'const refundId = createRefund(orderId, amount);', 'const refundId = createRefund(orderId, 1);'),
        'src/index.ts': HEALTHY['src/index.ts'],
      },
      fails: ['approved refunds the order total'],
    },
  },
  {
    name: 'build-triage',
    start: { 'src/agents.ts': agentsWithoutTriage, 'src/index.ts': indexExporting(['orderAgent', 'refundAgent']) },
    prompt:
      `${APP} Add a front desk agent. In \`src/agents.ts\`, add and export \`triage\`, the agent customers talk to first. ` +
      'It hands order questions to `orderAgent` and refund requests to `refundAgent` instead of answering them itself. ' +
      'A conversation with it can be picked up again later by its session id, so a customer who said "My order is A-1001." can ask "What is the status of my order?" in a later request. ' +
      'Export `triage` from `src/index.ts`. Callers start a conversation with `triage.chat()` and `send(message)`, read the `sessionId` from the response, ' +
      'and continue it with `triage.loadChat({ sessionId })`. ' +
      RULES,
    file: 'src/index.ts',
    keeps: keepsFlows,
    checks: ['delegates orders', 'delegates refunds', 'resumes by session id'],
    cheat: { files: { 'src/agents.ts': seed(HEALTHY['src/agents.ts'], sessionNotLoaded), 'src/index.ts': HEALTHY['src/index.ts'] }, fails: ['resumes by session id'] },
  },
  {
    name: 'build-order-memory',
    start: { 'src/agents.ts': replaceOnce(HEALTHY['src/agents.ts'], ORDER_STORE, '  maxTurns: 4,\n') },
    prompt:
      `${APP} Customers come back to the order desk in later requests, often served by another server process. ` +
      'Make `orderAgent` conversations resumable by session id: the first request starts one with `orderAgent.chat()` and `send(message)` and reads the `sessionId` from the response; ' +
      'a later request, in a new process, continues it with `orderAgent.loadChat({ sessionId })` and `send(message)`. ' +
      'A customer who said "My order is A-1001." can then ask "What is the status of my order?" and get A-1001\'s status, and two customers\' conversations never mix. ' +
      RULES,
    file: 'src/index.ts',
    keeps: keepsFlows,
    checks: ['resumes by session id', 'keeps sessions apart'],
    cheat: { files: { 'src/agents.ts': inMemoryStore(HEALTHY['src/agents.ts'], ORDER_STORE) }, fails: ['resumes by session id', 'keeps sessions apart'] },
  },
  {
    name: 'build-refund-resume',
    start: { 'src/agents.ts': replaceOnce(HEALTHY['src/agents.ts'], REFUND_STORE, '  maxTurns: 6,\n') },
    prompt:
      `${APP} Refund approvals come from a human hours later, in a separate request that another server process may handle. Make \`refundAgent\` conversations survive that. ` +
      'The first request calls `refundAgent.chat()` and `send(message)`; the turn pauses on the pending `approveRefund` request and the response carries a `sessionId`. ' +
      'A later request, in a new process, calls `refundAgent.loadChat({ sessionId })`, answers that pending `approveRefund` request and resumes the conversation: ' +
      'the refund is then issued if approved, and nothing is refunded if declined. Keep the rest of the refund desk as it is. ' +
      RULES,
    file: 'src/index.ts',
    keeps: keepsFlows,
    checks: ['pauses with a session id', 'approved in a later request', 'declined in a later request'],
    cheat: {
      files: { 'src/agents.ts': inMemoryStore(HEALTHY['src/agents.ts'], REFUND_STORE) },
      fails: ['approved in a later request', 'declined in a later request'],
    },
  },
  {
    name: 'build-refund-receipt',
    start: { 'src/agents.ts': agentsWithoutReceipt },
    prompt:
      `${APP} Callers of the refund desk need a receipt they can store. When \`refundAgent\` issues a refund, the response of that turn must carry an artifact ` +
      'named `receipt-<refundId>` (for example `receipt-R-1001`) with one data part `{ refundId: string, orderId: string, amount: number }` describing the refund it issued. ' +
      'A declined refund has no receipt. Keep the rest of the refund desk as it is. ' +
      RULES,
    file: 'src/index.ts',
    keeps: keepsFlows,
    checks: ['approved refund has a receipt', 'receipt matches the refund', 'declined refund has no receipt'],
    cheat: { files: { 'src/agents.ts': agentsWithSpokenReceipt }, fails: ['approved refund has a receipt', 'receipt matches the refund'] },
  },
  {
    name: 'build-customer-scope',
    start: { 'src/tools.ts': toolsWithoutScope },
    prompt:
      `${APP} Orders now record the \`customerId\` of the customer who placed them (see \`src/orders.json\`). ` +
      "A request from a signed-in customer runs with the action context `{ customerId }`, for example a flow run with `{ context: { customerId: 'C-100' } }` whose handler calls `orderAgent.chat().send(message)`. " +
      "Scope order lookups to that customer: in such a request `lookupOrder` returns an order only if it belongs to the customer, and null otherwise, so the order desk tells a customer who asks about someone else's order that it was not found, without revealing any of its details. " +
      'Requests without a customer in the context, such as staff using the `orderStatus` flow, still see every order. ' +
      RULES,
    file: 'src/index.ts',
    keeps: keepsFlows,
    checks: ['own order answered', 'foreign order refused', 'tool reads the context', 'staff see every order'],
    cheat: {
      files: { 'src/tools.ts': replaceOnce(HEALTHY['src/tools.ts'], 'context.customerId', 'context.auth?.customerId') },
      fails: ['foreign order refused', 'tool reads the context'],
    },
  },
]

/** The checks `build.eval.ts` records besides the requirements; a requirement check is any other label. */
export const FIXED_CHECKS = ['agent ran without provider errors', 'leaves package.json alone', 'typechecks', 'verify ran', 'keeps the flows'] as const

const TAP_RESULT = /^\s*(not )?ok \d+ - (.*?)(?: # (SKIP|TODO)\b.*)?$/
const TAP_PLAN = /^\s*1\.\.\d+\s*$/m

/**
 * Why each of `task`'s checks failed, read from the TAP that `verify-build.mts` printed for it;
 * an empty list for a check that passed. A check marked `# SKIP` or `# TODO` failed, since it did not
 * prove its requirement. A check missing from the TAP failed with `output`'s tail, since the file
 * then failed before its tests ran.
 */
export function requirementErrors(tap: string, task: Task, output = tap): Record<string, string[]> {
  const lines = tap.split('\n')
  const results = new Map<string, string[]>()
  lines.forEach((line, i) => {
    const m = TAP_RESULT.exec(line)
    if (!m?.[2]?.startsWith(`${task.name}: `)) return
    const check = m[2].slice(task.name.length + 2)
    if (m[3]) return void results.set(check, [`marked ${m[3]}, so it proved nothing`])
    if (!m[1]) return void results.set(check, [])
    const end = lines.findIndex((l, j) => j > i && /^\s*\.\.\.$/.test(l))
    const block = lines.slice(i + 1, end < 0 ? undefined : end)
    const error = block.findIndex((l) => /^\s*error:/.test(l))
    const until = block.findIndex((l, j) => j > error && /^\s*(?:code|name|expected|actual|operator|stack):/.test(l))
    results.set(check, [error < 0 ? 'failed' : block.slice(error, until < 0 ? undefined : until).map((l) => l.trim()).join(' ')])
  })
  const tail = output.trim().split('\n').slice(-20).join('\n')
  return Object.fromEntries(task.checks.map((check) => [check, results.get(check) ?? [`did not run:\n${tail}`]]))
}

/**
 * Why the `verify-build.mts` run for `task` did not run to a verdict; empty when it did. It did not
 * when the TAP has no plan, or when it exited non-zero with no failed check of `task` to explain it.
 */
export function verifyErrors(run: { exitCode: number; stdout: string; stderr: string }, task: Task): string[] {
  const tail = `${run.stdout}\n${run.stderr}`.trim().split('\n').slice(-20).join('\n')
  if (!TAP_PLAN.test(run.stdout)) return [`no TAP plan, exit ${run.exitCode}:\n${tail}`]
  if (run.exitCode === 0) return []
  const failed = run.stdout.split('\n').some((line) => {
    const m = TAP_RESULT.exec(line)
    return m?.[1] !== undefined && !m[3] && m[2]?.startsWith(`${task.name}: `) === true
  })
  return failed ? [] : [`exit ${run.exitCode} with no failed ${task.name} check:\n${tail}`]
}

const TRIAGE = "name: 'triage'"

/** Text only the healthy app has, by file: each build task's start state lacks at least one. */
const BUILT: Record<string, string[]> = {
  'src/agents.ts': [TRIAGE, ORDER_STORE, REFUND_STORE, 'ai.currentSession().addArtifacts('],
  'src/tools.ts': ['context.customerId'],
}

/** A build start state, as the oracle detects it: a file in `BUILT` is missing or lacks the healthy text. `read` returns null for a missing file. */
export const isBuildStart = (read: (file: string) => string | null) =>
  Object.entries(BUILT).some(([file, marks]) => {
    const text = read(file)
    return text === null || marks.some((mark) => !text.includes(mark))
  })

/** Writes `files` over a scratch copy of the app and runs its `tsc`; returns the compiler output on failure. */
function typecheckWith(files: Record<string, string | null>): string | null {
  const modules = fileURLToPath(new URL('node_modules', appDir))
  if (!existsSync(modules)) return `no ${modules}: run npm ci in evals/app first`
  const dir = mkdtempSync(path.join(tmpdir(), 'build-task-'))
  try {
    const app = fileURLToPath(appDir)
    for (const entry of ['src', 'prompts', 'tsconfig.json', 'package.json']) cpSync(path.join(app, entry), path.join(dir, entry), { recursive: true })
    symlinkSync(modules, path.join(dir, 'node_modules'), 'dir')
    for (const [file, text] of Object.entries(files)) {
      if (text === null) rmSync(path.join(dir, file))
      else writeFileSync(path.join(dir, file), text)
    }
    execFileSync(path.join(dir, 'node_modules/.bin/tsc'), ['--noEmit', '-p', dir], { stdio: 'pipe' })
    return null
  } catch (e) {
    const out = e instanceof Error && 'stdout' in e ? String(e.stdout) : String(e)
    return out.trim() || String(e)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verify = readFileSync(new URL('./verify-build.mts', import.meta.url), 'utf8')
  const buildEval = readFileSync(new URL('./build.eval.ts', import.meta.url), 'utf8')
  const errors: string[] = []
  for (const label of FIXED_CHECKS) if (!buildEval.includes(`'${label}')`)) errors.push(`build.eval.ts records no check '${label}'`)
  const names = new Set<string>()
  for (const task of TASKS) {
    if (names.has(task.name)) errors.push(`${task.name}: duplicate name`)
    names.add(task.name)
    if (BUGS.some((b) => b.name === task.name)) errors.push(`${task.name}: clashes with a bug name`)
    if (/genkit|trace|mcp|\bcli\b/i.test(task.prompt)) errors.push(`${task.name}: prompt mentions tooling`)
    const tests = [...verify.matchAll(/^test\('([^']*)'/gm)].flatMap((m) => (m[1]?.startsWith(`${task.name}: `) ? [m[1]] : []))
    const expected = task.checks.map((check) => `${task.name}: ${check}`)
    if (tests.join('\n') !== expected.join('\n')) errors.push(`${task.name}: verify-build.mts tests ${JSON.stringify(tests)}, expected ${JSON.stringify(expected)}`)
    for (const check of task.checks) if ((FIXED_CHECKS as readonly string[]).includes(check)) errors.push(`${task.name}: check ${check} has a fixed check's name`)
    for (const fails of task.cheat.fails) {
      if (!task.checks.includes(fails)) errors.push(`${task.name}: the cheat fails ${fails}, which is not a check`)
    }
    if (task.cheat.fails.length === 0) errors.push(`${task.name}: the cheat fails no check`)
    const tap = task.checks.map((check, i) => (i === 0 ? `not ok 1 - ${task.name}: ${check}\n  ---\n  error: 'boom'\n  code: 'X'\n  ...` : `ok ${i + 1} - ${task.name}: ${check}`))
    const parsed = requirementErrors(tap.slice(0, -1).join('\n'), task)
    const [first, ...rest] = task.checks
    if (parsed[first ?? '']?.join() !== "error: 'boom'") errors.push(`${task.name}: TAP failure read as ${JSON.stringify(parsed[first ?? ''])}`)
    for (const check of rest.slice(0, -1)) if (parsed[check]?.length !== 0) errors.push(`${task.name}: TAP pass of ${check} read as a failure`)
    if (!parsed[rest.at(-1) ?? '']?.[0]?.startsWith('did not run')) errors.push(`${task.name}: a check missing from the TAP is not a failure`)
    for (const directive of ['ok 1 - X # SKIP', 'not ok 1 - X # TODO', 'ok 1 - X # TODO']) {
      const marked = requirementErrors(directive.replace('X', `${task.name}: ${first}`), task)
      if (marked[first ?? '']?.length === 0) errors.push(`${task.name}: TAP ${JSON.stringify(directive)} read as a pass`)
    }
    const failedRun = `TAP version 13\n${tap.join('\n')}\n1..${tap.length}\n`
    const crashed = `TAP version 13\n# Error: boom\nnot ok 1 - /root/.verify-build.mts\n  ---\n  error: 'test failed'\n  ...\n1..1\n`
    const runs: [string, { exitCode: number; stdout: string; stderr: string }, boolean][] = [
      ['a run with a failed check', { exitCode: 1, stdout: failedRun, stderr: '' }, true],
      ['a passing run', { exitCode: 0, stdout: failedRun.replace('not ok 1', 'ok 1'), stderr: '' }, true],
      ['an empty run', { exitCode: 1, stdout: '', stderr: 'Error: boom' }, false],
      ['a run whose file crashed', { exitCode: 1, stdout: crashed, stderr: '' }, false],
      ['a run with no plan', { exitCode: 0, stdout: tap.slice(1).join('\n'), stderr: '' }, false],
    ]
    for (const [what, run, ran] of runs) {
      if ((verifyErrors(run, task).length === 0) !== ran) errors.push(`${task.name}: verifyErrors reads ${what} as ${ran ? 'not run' : 'run'}`)
    }
    const startFile = (file: string): string | null => {
      const text = file in task.start ? task.start[file] : (HEALTHY as Record<string, string | undefined>)[file]
      return text ?? null
    }
    for (const [file, text] of Object.entries(task.start)) {
      if (text === (HEALTHY as Record<string, string | undefined>)[file]) errors.push(`${task.name}: start sets ${file} to its healthy text`)
    }
    const index = startFile('src/index.ts')
    const agents = startFile('src/agents.ts')
    if (!isBuildStart(startFile)) errors.push(`${task.name}: the oracle would not see a build start state`)
    for (const keep of missedKeeps(task.keeps, HEALTHY['src/index.ts'])) errors.push(`${task.name}: keeps ${keep} does not match the healthy src/index.ts`)
    if (index) for (const keep of missedKeeps(task.keeps, index)) errors.push(`${task.name}: keeps ${keep} does not match the start src/index.ts`)
    if (agents === null || !agents.includes(TRIAGE)) {
      for (const gone of ['triage', 'tryTriage', 'tryRefundDesk']) {
        if (index && new RegExp(`\\b${gone}\\b`).test(index)) errors.push(`${task.name}: start src/index.ts still exports ${gone}`)
        if (agents && new RegExp(`\\b${gone}\\b`).test(agents)) errors.push(`${task.name}: start src/agents.ts still has ${gone}`)
      }
      if (agents?.includes('@genkit-ai/middleware')) errors.push(`${task.name}: start src/agents.ts still imports the delegation middleware`)
    }
    if (agents === null && index && index.includes('./agents.js')) errors.push(`${task.name}: start src/index.ts imports the removed src/agents.ts`)
    if (agents) {
      for (const kept of ['orderAgent', 'refundAgent']) {
        if (!agents.includes(`export const ${kept} = ai.defineAgent(`)) errors.push(`${task.name}: start src/agents.ts lost ${kept}`)
        if (index && !new RegExp(`\\b${kept}\\b`).test(index)) errors.push(`${task.name}: start src/index.ts does not export ${kept}`)
      }
    }
    const tsc = typecheckWith(task.start)
    if (tsc !== null) errors.push(`${task.name}: start state does not typecheck:\n${tsc}`)
    const cheatTsc = typecheckWith({ ...task.start, ...task.cheat.files })
    if (cheatTsc !== null) errors.push(`${task.name}: the cheat does not typecheck:\n${cheatTsc}`)
    const cheatFile = task.cheat.files[task.file]
    if (cheatFile !== undefined) for (const keep of missedKeeps(task.keeps, cheatFile)) errors.push(`${task.name}: the cheat's ${task.file} fails keeps ${keep}`)
  }
  const healthyFile = (file: string) => readFileSync(new URL(file, appDir), 'utf8')
  if (isBuildStart(healthyFile)) errors.push('isBuildStart takes the healthy app for a build start state')
  if (!isBuildStart((file) => (file === 'src/agents.ts' ? null : healthyFile(file)))) errors.push('isBuildStart misreads a missing src/agents.ts')
  for (const bug of BUGS) {
    if (isBuildStart((file) => (file === bug.file ? seed(healthyFile(file), bug) : healthyFile(file)))) {
      errors.push(`${bug.name}: the oracle would take its seed for a build start state`)
    }
  }
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log('OK')
}
