import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUGS, seed } from './bugs.ts'

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
  /** must still match `file` after the build (anti-cheat) */
  keeps: RegExp[]
  /** the requirements `verify-build.mts` checks, each its own `test('<name>: <check>')` */
  checks: string[]
  /** a plausible wrong build the canary writes, and which of `checks` it must fail */
  cheat: { files: Record<string, string>; fails: string[] }
}

const appDir = new URL('./app/', import.meta.url)
const healthy = (file: string) => readFileSync(new URL(file, appDir), 'utf8')

/** The healthy files the build tasks strip; the oracle restores them. */
export const HEALTHY = {
  agents: healthy('src/agents.ts'),
  index: healthy('src/index.ts'),
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
  const line = AGENTS_EXPORT.exec(HEALTHY.index)
  if (!line) throw new Error('src/index.ts: no agents export line')
  const names = (line[1] ?? '').split(',').map((n) => n.trim()).filter((n) => keep.includes(n))
  if (names.length !== keep.length) throw new Error(`src/index.ts: does not export all of ${keep.join(', ')}`)
  return HEALTHY.index.replace(line[0], () => (names.length > 0 ? `export { ${names.join(', ')} } from './agents.js';\n` : ''))
}

/** The healthy `src/agents.ts` with `triage`, its two wrapper flows and the delegation import cut out. */
const agentsWithoutTriage = cutOnce(
  cutOnce(HEALTHY.agents, "import { agents } from '@genkit-ai/middleware';\n", "import { FileSessionStore", 'src/agents.ts'),
  '\n/** Routes each customer message',
  null,
  'src/agents.ts',
)

const FLOWS = ['chat', 'draftReply', 'greet', 'orderStatus', 'summarizeTicket']
/** Each flow is still exported from `src/index.ts`, by name or through a star export of `./flows.js`. */
const keepsFlows = FLOWS.map((flow) => new RegExp(`\\b${flow}\\b|export \\* from '\\./flows(\\.js)?'`))

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
      'then pauses for a human to approve the refund, and only if approved issues it with a tool named `issueRefund` built on `createRefund` from `src/db.ts`. ' +
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
        'src/agents.ts': replaceOnce(
          HEALTHY.agents,
          'async ({ orderId, amount }) => ({ refundId: createRefund(orderId, amount) }),',
          'async ({ orderId }) => ({ refundId: createRefund(orderId, 1) }),',
        ),
        'src/index.ts': HEALTHY.index,
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
      'A conversation with it can be picked up again later by its session id, so a customer who said "My order is A-1001." can ask "What is its status?" in a later request. ' +
      'Export `triage` from `src/index.ts`. Callers start a conversation with `triage.chat()` and `send(message)`, read the `sessionId` from the response, ' +
      'and continue it with `triage.loadChat({ sessionId })`. ' +
      RULES,
    file: 'src/index.ts',
    keeps: keepsFlows,
    checks: ['delegates orders', 'delegates refunds', 'resumes by session id'],
    cheat: { files: { 'src/agents.ts': seed(HEALTHY.agents, sessionNotLoaded), 'src/index.ts': HEALTHY.index }, fails: ['resumes by session id'] },
  },
]

const TAP_RESULT = /^\s*(not )?ok \d+ - (.*?)(?: # (?:SKIP|TODO)\b.*)?$/

/**
 * Why each of `task`'s checks failed, read from the TAP that `verify-build.mts` printed for it;
 * an empty list for a check that passed. A check missing from the TAP failed with `output`'s tail,
 * since the file then failed before its tests ran.
 */
export function requirementErrors(tap: string, task: Task, output = tap): Record<string, string[]> {
  const lines = tap.split('\n')
  const results = new Map<string, string[]>()
  lines.forEach((line, i) => {
    const m = TAP_RESULT.exec(line)
    if (!m?.[2]?.startsWith(`${task.name}: `)) return
    const check = m[2].slice(task.name.length + 2)
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

const TRIAGE = "name: 'triage'"

/** A build start state, as the oracle detects it: `src/agents.ts` is missing or has no `triage`. */
export const isBuildStart = (agents: string | null) => agents === null || !agents.includes(TRIAGE)

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
  const errors: string[] = []
  const names = new Set<string>()
  for (const task of TASKS) {
    if (names.has(task.name)) errors.push(`${task.name}: duplicate name`)
    names.add(task.name)
    if (BUGS.some((b) => b.name === task.name)) errors.push(`${task.name}: clashes with a bug name`)
    if (/genkit|trace|mcp|\bcli\b/i.test(task.prompt)) errors.push(`${task.name}: prompt mentions tooling`)
    const tests = [...verify.matchAll(/^test\('([^']*)'/gm)].flatMap((m) => (m[1]?.startsWith(`${task.name}: `) ? [m[1]] : []))
    const expected = task.checks.map((check) => `${task.name}: ${check}`)
    if (tests.join('\n') !== expected.join('\n')) errors.push(`${task.name}: verify-build.mts tests ${JSON.stringify(tests)}, expected ${JSON.stringify(expected)}`)
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
    const index = task.start['src/index.ts']
    const agents = task.start['src/agents.ts']
    if (index === undefined || agents === undefined) errors.push(`${task.name}: start does not set src/index.ts and src/agents.ts`)
    if (!isBuildStart(agents ?? null)) errors.push(`${task.name}: the oracle would not see a build start state`)
    for (const keep of task.keeps) {
      if (!keep.test(HEALTHY.index)) errors.push(`${task.name}: keeps ${keep} does not match the healthy src/index.ts`)
      if (index && !keep.test(index)) errors.push(`${task.name}: keeps ${keep} does not match the start src/index.ts`)
    }
    for (const gone of ['triage', 'tryTriage', 'tryRefundDesk']) {
      if (index && new RegExp(`\\b${gone}\\b`).test(index)) errors.push(`${task.name}: start src/index.ts still exports ${gone}`)
      if (agents && new RegExp(`\\b${gone}\\b`).test(agents)) errors.push(`${task.name}: start src/agents.ts still has ${gone}`)
    }
    if (agents === null && index && index.includes('./agents.js')) errors.push(`${task.name}: start src/index.ts imports the removed src/agents.ts`)
    if (agents) {
      if (agents.includes('@genkit-ai/middleware')) errors.push(`${task.name}: start src/agents.ts still imports the delegation middleware`)
      for (const kept of ['orderAgent', 'refundAgent']) {
        if (!agents.includes(`export const ${kept} = ai.defineAgent(`)) errors.push(`${task.name}: start src/agents.ts lost ${kept}`)
        if (index && !new RegExp(`\\b${kept}\\b`).test(index)) errors.push(`${task.name}: start src/index.ts does not export ${kept}`)
      }
    }
    const tsc = typecheckWith(task.start)
    if (tsc !== null) errors.push(`${task.name}: start state does not typecheck:\n${tsc}`)
    const cheatTsc = typecheckWith(task.cheat.files)
    if (cheatTsc !== null) errors.push(`${task.name}: the cheat does not typecheck:\n${cheatTsc}`)
    for (const keep of task.keeps) {
      const file = task.cheat.files[task.file]
      if (file !== undefined && !keep.test(file)) errors.push(`${task.name}: the cheat's ${task.file} fails keeps ${keep}`)
    }
  }
  if (!isBuildStart(null) || isBuildStart(HEALTHY.agents)) errors.push('isBuildStart misreads the healthy or the missing src/agents.ts')
  for (const bug of BUGS.filter((b) => b.file === 'src/agents.ts')) {
    if (isBuildStart(HEALTHY.agents.replace(bug.from, () => bug.to))) errors.push(`${bug.name}: the oracle would take its seed for a build start state`)
  }
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log('OK')
}
