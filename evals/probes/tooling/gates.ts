import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { printedIn, squash } from '../transcript.ts'

const FAIL = [
  'unavailable',
  "\\w+n't available",
  'not available',
  "\\w+n't connected",
  'not connected',
  'failed|failure',
  "couldn'?t|could not|unable|can'?t|cannot",
  'timed out|unreachable|offline',
  "not working|did not work|didn'?t work",
  'errors?|errored',
  'enotfound|refused|exited|crashed',
].join('|')
const SUBJECT = '(?:docs?|documentation)(?::\\w+|\\s+(?:tools?|server|mcp|search|lookups?|calls?|bundle))'

/** Matches an answer that says the Genkit docs, or the tools that serve them, failed or were unavailable. */
export const ADMITS_DOCS_FAILED = new RegExp(
  [
    `\\b${SUBJECT}[^.;\\n]{0,50}\\b(?:${FAIL})`,
    `\\b(?:docs?|documentation)\\s+(?:(?:was|were|is|are)\\s+)?(?:${FAIL})`,
    `\\bno\\s+(?:genkit\\s+)?${SUBJECT}`,
    `\\b(?:no|without|don'?t have|do not have|lack|couldn'?t|could not|can'?t|cannot|unable to)\\b[^.;\\n]{0,30}\\b(?:access|reach|load|fetch|read|use|call|query|get|retrieve)\\b[^.;\\n]{0,20}\\b(?:${SUBJECT}|documentation)`,
    `\\b(?:mcp|genkit)\\s+(?:mcp\\s+)?(?:server|tools?)\\b[^.;\\n]{0,40}\\b(?:${FAIL})`,
  ].join('|'),
  'i',
)

/** Whether `text` admits the Genkit docs failed; backticks and curly quotes are ignored. */
export const admitsDocsFailed = (text: string): boolean => ADMITS_DOCS_FAILED.test(text.replace(/`/g, '').replace(/[‘’]/g, "'"))

/** The options Claude Code or the Genkit CLI rejected in `output`, from "error: unknown option '--cwd'". */
export const rejectedOptions = (output: string): string[] => [...output.matchAll(/unknown option '([^']+)'/g)].map((m) => m[1] ?? '')

/** The `claude mcp add` and `add-json` invocations in a shell command, each cut at the end of its statement; also `npx @anthropic-ai/claude-code mcp add`. */
export const mcpAddInvocations = (command: string): string[] =>
  [...command.matchAll(/(?:^|[\s;&|('"/])((?:claude(?:-code)?|@anthropic-ai\/claude-code(?:@\S+)?)\s+mcp\s+add(?:-json)?(?=\s|$)[^;&|\n)]*)/g)].map((m) => m[1] ?? '')

/** `${VAR}` and `${VAR:-default}` expanded from `env` as Claude Code does in `.mcp.json`; an unset variable without a default stays as written. */
export function expandVars(text: string, env: Record<string, string>): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (whole, name: string, fallback?: string) => {
    const value = env[name]
    if (value !== undefined && value !== '') return value
    return fallback ?? value ?? whole
  })
}

/** A `.mcp.json` with every string in it expanded by `expandVars`; text that is not JSON comes back unchanged. */
export function expandMcpJson(text: string | null, env: Record<string, string>): string | null {
  if (text === null) return null
  try {
    const walk = (value: unknown): unknown =>
      typeof value === 'string'
        ? expandVars(value, env)
        : Array.isArray(value)
          ? value.map(walk)
          : typeof value === 'object' && value !== null
            ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
            : value
    return JSON.stringify(walk(JSON.parse(text)))
  } catch {
    return text
  }
}

const GENKIT_PACKAGE = /^genkit(?:-cli)?(?:@\S+)?$/

/** The args the Genkit CLI gets when `command args` run it directly or through npx, `npm exec`, `pnpm dlx|exec` or bunx; null when they do not. */
export function genkitArgs(command: string, args: string[]): string[] | null {
  const bin = command.split('/').pop() ?? ''
  if (bin === 'genkit' || bin === 'genkit-cli') return args
  let rest: string[]
  if (bin === 'npx' || bin === 'bunx') rest = args
  else if ((bin === 'npm' && args[0] === 'exec') || (bin === 'pnpm' && (args[0] === 'dlx' || args[0] === 'exec'))) rest = args.slice(1)
  else return null
  let i = 0
  while (rest[i]?.startsWith('-')) {
    if (rest[i] === '--') {
      i++
      break
    }
    i += rest[i] === '-p' || rest[i] === '--package' ? 2 : 1
  }
  const pkg = rest[i]
  return pkg !== undefined && GENKIT_PACKAGE.test(pkg) ? rest.slice(i + 1) : null
}

/** A registered server that runs `genkit mcp`: as registered, and the Genkit CLI's own args. */
export type GenkitServer = { command: string; args: string[]; env: Record<string, string>; genkit: string[] }

/** The servers in a `.mcp.json` whose command resolves to the Genkit CLI with `mcp` among its args. */
export function genkitServers(mcpJson: string | null): GenkitServer[] {
  try {
    const doc = JSON.parse(mcpJson ?? '') as { mcpServers?: Record<string, { command?: unknown; args?: unknown; env?: unknown }> }
    return Object.values(doc.mcpServers ?? {}).flatMap((s) => {
      if (typeof s.command !== 'string') return []
      const args = Array.isArray(s.args) ? s.args.map(String) : []
      const genkit = genkitArgs(s.command, args)
      const env = typeof s.env === 'object' && s.env !== null ? Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, String(v)])) : {}
      return genkit?.includes('mcp') ? [{ command: s.command, args, env, genkit }] : []
    })
  } catch {
    return []
  }
}

/** Why a `.mcp.json` registers no server that runs `genkit mcp`; empty when it does. */
export const registrationErrors = (mcpJson: string | null): string[] =>
  genkitServers(mcpJson).length > 0 ? [] : ['.mcp.json is missing, not JSON, or registers no server whose command runs genkit mcp']

/** The registered Genkit servers whose args carry `--cwd`, which neither `genkit mcp` nor Claude Code knows. */
export const cwdErrors = (mcpJson: string | null): string[] =>
  genkitServers(mcpJson)
    .filter((s) => s.genkit.some((a) => a === '--cwd' || a.startsWith('--cwd=')))
    .map((s) => `args hold --cwd: ${s.args.join(' ')}`)

/** The registered Genkit servers whose `--project-root` is not `workspace`; a server without one is fine. */
export function rootErrors(mcpJson: string | null, workspace: string): string[] {
  return genkitServers(mcpJson).flatMap(({ genkit: args }) => {
    const at = args.findIndex((a) => a === '--project-root' || a.startsWith('--project-root='))
    if (at < 0) return []
    const flag = args[at] ?? ''
    const value = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : args[at + 1]
    return value !== undefined && path.resolve(workspace, value) === workspace ? [] : [`--project-root ${value ?? '(none)'} is not ${workspace}`]
  })
}

/** A tool call the two-turn proof may count: a shell command or a `run_flow` call, with the text it returned. */
export type RanCall = { kind: 'shell' | 'run_flow'; command: string; output: string }

const READS_ANSWER = /\b(?:cat|head|tail|less|more|jq|bat|nl|sed|awk|grep|rg|cut|tr|wc|od|xxd|strings)\b[^;&|\n]*answer\.json|<\s*\S*answer\.json|\b(?:readFile|readFileSync|require|import)\s*\([^)]*answer\.json/
const RUNS_CODE = /(?:^|[\s;&|('"/])(?:tsx|node|bun|deno|npx|npm\s+(?:run|exec|start)|pnpm\s+(?:run|exec|dlx|start)|genkit\s+(?:\S+\s+)*?flow:run|(?:ba)?sh\s+\S+\.sh)(?=\s|$)/

/**
 * Why the replies in `answer.json` are not shown to come from a run of the agent; empty when they are.
 * A reply counts when one call that ran code printed both replies, did not read `answer.json`, and
 * did not carry either reply in its own input, and when no reply is plain `fixture` data the agent
 * could read. A script that prints constants it wrote into a file still passes.
 */
export function replyErrors(replies: { turn1: string; turn2: string }, calls: RanCall[], fixture: string): string[] {
  const both = [replies.turn1, replies.turn2]
  const errors = (['turn1', 'turn2'] as const).flatMap((key) => (squash(replies[key]) !== '' && squash(fixture).includes(squash(replies[key])) ? [`${key} is plain fixture data, not a model reply`] : []))
  if (errors.length > 0) return errors
  const proved = calls.some(
    (call) =>
      (call.kind === 'run_flow' || RUNS_CODE.test(call.command)) &&
      !READS_ANSWER.test(call.command) &&
      both.every((reply) => !squash(call.command).includes(squash(reply)) && printedIn(reply, call.output)),
  )
  return proved ? [] : ['no call that ran code, without reading answer.json or carrying the replies itself, printed both replies']
}

type EvalRow = { testCaseId?: string; error?: unknown; metrics?: { evaluator?: string; error?: unknown }[] }

const evalRows = (text: string | null): EvalRow[] | null => {
  try {
    const run: unknown = JSON.parse(text ?? '')
    const rows = Array.isArray(run) ? run : (run as { results?: unknown }).results
    return Array.isArray(rows) && rows.length > 0 ? (rows as EvalRow[]) : null
  } catch {
    return null
  }
}

/** Why the JSON `eval:flow --output` wrote does not show every test case run through the flow and handed to an evaluator; empty when it does. The faithfulness evaluator errors "Context was not provided" on a flow without a retriever, so evaluator errors are in `evalMetricErrors`, which does not gate. */
export function evalRunErrors(text: string | null): string[] {
  const rows = evalRows(text)
  if (rows === null) return ['the eval output is missing, not JSON or holds no results']
  return rows.flatMap((r) => {
    const id = r.testCaseId ?? '?'
    if (r.error) return [`${id}: inference error ${JSON.stringify(r.error).slice(0, 200)}`]
    return Array.isArray(r.metrics) && r.metrics.length > 0 ? [] : [`${id}: no evaluator scored it`]
  })
}

/** The errors evaluators reported in the JSON `eval:flow --output` wrote, one per metric. */
export const evalMetricErrors = (text: string | null): string[] =>
  (evalRows(text) ?? []).flatMap((r) => (r.metrics ?? []).flatMap((m) => (m.error ? [`${r.testCaseId ?? '?'}: ${m.evaluator ?? '?'} ${JSON.stringify(m.error).slice(0, 200)}`] : [])))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const admits: [string, boolean][] = [
    ["The Genkit docs tools aren't available in this session", true],
    ['No Genkit docs tools were available', true],
    ["I don't have access to the Genkit docs tools", true],
    ["The Genkit MCP server isn't connected", true],
    ['The docs tools returned an error', true],
    ['The genkit MCP server exited', true],
    ['`genkit docs:search` errored with ENOTFOUND', true],
    ["The docs couldn't be fetched", true],
    ['The Genkit docs tools failed in this sandbox (no network), so this is from memory, not from the docs.', true],
    ['a flow cannot use sendChunk without streamSchema; read the docs', false],
    ['If the Genkit dev server is unavailable, restart it', false],
    ['see the docs for error handling', false],
    ['Declare `streamSchema` on the flow and call `sendChunk(chunk)`. See the docs for error handling.', false],
  ]
  const errors = [
    ...admits.filter(([text, want]) => admitsDocsFailed(text) !== want).map(([text, want]) => `admitsDocsFailed(${JSON.stringify(text)}) should be ${want}`),
  ]
  const server = (command: string, args: string[]) => JSON.stringify({ mcpServers: { genkit: { type: 'stdio', command, args, env: {} } } })
  const good = server('genkit', ['mcp', '--project-root', '/reeval/workspace'])
  const root = (...args: string[]) => rootErrors(server('genkit', ['mcp', ...args]), '/reeval/workspace')
  const cases: [string, unknown, unknown][] = [
    ['registered', registrationErrors(good), []],
    ['registered, no root', registrationErrors(server('genkit', ['mcp'])), []],
    ['registered by path', registrationErrors(server('/usr/local/bin/genkit', ['mcp'])), []],
    ['npx -y genkit-cli', registrationErrors(server('npx', ['-y', 'genkit-cli', 'mcp'])), []],
    ['npx genkit', registrationErrors(server('npx', ['genkit', 'mcp'])), []],
    ['npx -p genkit-cli genkit', registrationErrors(server('npx', ['-y', '-p', 'genkit-cli', 'genkit', 'mcp'])), []],
    ['pnpm dlx genkit-cli@latest', registrationErrors(server('pnpm', ['dlx', 'genkit-cli@latest', 'mcp'])), []],
    ['npm exec -- genkit', registrationErrors(server('npm', ['exec', '--', 'genkit', 'mcp'])), []],
    ['npx of another package', registrationErrors(server('npx', ['-y', 'other-cli', 'mcp'])).length, 1],
    ['npx genkit start', registrationErrors(server('npx', ['genkit', 'start'])).length, 1],
    ['node is not genkit', registrationErrors(server('node', ['genkit', 'mcp'])).length, 1],
    ['npx root flag', rootErrors(server('npx', ['-y', 'genkit-cli', 'mcp', '--project-root', '/tmp/x']), '/reeval/workspace').length, 1],
    ['no mcp arg', registrationErrors(server('genkit', ['start'])).length, 1],
    ['missing file', registrationErrors(null).length, 1],
    ['not JSON', registrationErrors('{').length, 1],
    ['no --cwd', cwdErrors(good), []],
    ['--cwd', cwdErrors(server('genkit', ['mcp', '--cwd', '.'])).length, 1],
    ['--cwd=', cwdErrors(server('genkit', ['mcp', '--cwd=/x'])).length, 1],
    ['root is the workspace', root('--project-root', '/reeval/workspace'), []],
    ['root, relative', root('--project-root', '.'), []],
    ['root, equals form', root('--project-root=/reeval/workspace/'), []],
    ['no root', root(), []],
    ['root elsewhere', root('--project-root', '/tmp/x').length, 1],
    ['root without value', root('--project-root').length, 1],
    ['rejected options', rejectedOptions("error: unknown option '--cwd'\nerror: unknown option '-y'"), ['--cwd', '-y']],
    ['no rejected options', rejectedOptions('Added stdio MCP server genkit'), []],
    ['add', mcpAddInvocations('claude mcp add --transport stdio genkit -- genkit mcp'), ['claude mcp add --transport stdio genkit -- genkit mcp']],
    ['add in a chain', mcpAddInvocations('cd app && claude mcp add g genkit mcp --cwd . --scope project; claude mcp list'), ['claude mcp add g genkit mcp --cwd . --scope project']],
    ['add by path', mcpAddInvocations('~/.claude/local/node_modules/.bin/claude mcp add-json g \'{"command":"genkit"}\'').length, 1],
    ['add via npx', mcpAddInvocations('npx -y @anthropic-ai/claude-code mcp add g -- genkit mcp').length, 1],
    ['add inside bash -lc', mcpAddInvocations("bash -lc 'claude mcp add g -- genkit mcp'").length, 1],
    ['list is not add', mcpAddInvocations('claude mcp list'), []],
    ['grep for add is not add', mcpAddInvocations('echo see claude docs for mcp add'), []],
    ['expand set', expandVars('--project-root ${PWD}', { PWD: '/w' }), '--project-root /w'],
    ['expand default', expandVars('${ROOT:-.}', {}), '.'],
    ['expand empty uses default', expandVars('${ROOT:-.}', { ROOT: '' }), '.'],
    ['expand unset stays', expandVars('${NOPE}', {}), '${NOPE}'],
    ['expand mcp json', JSON.parse(expandMcpJson(server('genkit', ['mcp', '--project-root', '${PWD}']), { PWD: '/reeval/workspace' }) ?? '').mcpServers.genkit.args, ['mcp', '--project-root', '/reeval/workspace']],
    ['expanded root', rootErrors(expandMcpJson(server('genkit', ['mcp', '--project-root', '${PWD:-.}']), {}), '/reeval/workspace'), []],
    ['unexpanded root fails', rootErrors(server('genkit', ['mcp', '--project-root', '${PWD}']), '/reeval/workspace').length, 1],
  ]
  const T1 = 'Order A-1001 is on its way: shipped, ETA 2026-10-22.'
  const T2 = 'The tracking code for that order is NW-7F3K2Q.'
  const printedBoth = JSON.stringify({ turn1: T1, turn2: T2 }, null, 2)
  const FIXTURE = '{ "A-1001": { "status": "shipped", "eta": "2026-10-22", "tracking": "NW-7F3K2Q" } }'
  const shell = (command: string, output: string): RanCall => ({ kind: 'shell', command, output })
  const reply = (calls: RanCall[], replies = { turn1: T1, turn2: T2 }) => replyErrors(replies, calls, FIXTURE).length
  const evalRun = (results: unknown) => evalRunErrors(JSON.stringify({ key: {}, results }))
  const proof: [string, number, number][] = [
    ['a script run that printed both replies', reply([shell('npx tsx run-triage.ts', printedBoth)]), 0],
    ['the oracle path', reply([shell('sh ~/.probe/run.sh good', printedBoth)]), 0],
    ['genkit flow:run that printed both', reply([shell('genkit flow:run tryTwoTurn \'{"a":1}\' -- npx tsx src/index.ts', `Result:\n${printedBoth}`)]), 0],
    ['an MCP run_flow that returned both', reply([{ kind: 'run_flow', command: '{"flowName":"tryTwoTurn"}', output: printedBoth }]), 0],
    ['a script that prints constants passes', reply([shell('node fake.mjs', printedBoth)]), 0],
    ['escaped output', reply([shell('npx tsx run.ts', JSON.stringify(printedBoth))]), 0],
    ['no call at all', reply([]), 1],
    ['minimal facts copied from the fixture', reply([shell('cat src/orders.json', FIXTURE)], { turn1: 'shipped', turn2: 'NW-7F3K2Q' }), 2],
    ['write then cat', reply([shell(`echo '${printedBoth}' > answer.json; cat answer.json`, printedBoth)]), 1],
    ['cat of answer.json after a real run', reply([shell('cat answer.json', printedBoth)]), 1],
    ['jq of answer.json', reply([shell('jq . answer.json', printedBoth)]), 1],
    ['node -e that reads answer.json', reply([shell('node -e "console.log(require(\'fs\').readFileSync(\'answer.json\',\'utf8\'))"', printedBoth)]), 1],
    ['echo of the replies', reply([shell(`echo '${T1} ${T2}'`, `${T1} ${T2}`)]), 1],
    ['node -e printing constants in the command', reply([shell(`node -e "console.log('${T1}', '${T2}')"`, `${T1} ${T2}`)]), 1],
    ['only one reply printed', reply([shell('npx tsx run.ts', JSON.stringify({ turn1: T1 }))]), 1],
    ['a failed run that printed nothing', reply([shell('npx tsx run.ts', '')]), 1],
    ['a read of the fixture that holds the replies', reply([shell('cat src/orders.json', `${T1} ${T2}`)]), 1],
  ]
  const run = (metrics: unknown, extra = {}) => evalRun([{ testCaseId: 't1', input: {}, output: 'x', metrics, ...extra }])
  const scored = [{ evaluator: '/evaluator/genkitEval/faithfulness', score: 1, status: 'PASS' }]
  const evals: [string, number, number][] = [
    ['eval run scored', run(scored).length, 0],
    ['eval output as a bare array', evalRunErrors(JSON.stringify([{ testCaseId: 't1', metrics: scored }])).length, 0],
    ['eval metric with an error does not gate', run([{ evaluator: '/evaluator/genkitEval/faithfulness', error: 'Context was not provided' }]).length, 0],
    ['eval metric errors are listed', evalMetricErrors(JSON.stringify({ results: [{ testCaseId: 't1', metrics: [{ evaluator: 'f', error: 'x' }] }] })).length, 1],
    ['eval metric errors none', evalMetricErrors(JSON.stringify({ results: [{ testCaseId: 't1', metrics: scored }] })).length, 0],
    ['eval row with an inference error', run([], { error: 'flow threw' }).length, 1],
    ['eval row no evaluator scored', run([]).length, 1],
    ['eval output without results', evalRun([]).length, 1],
    ['eval output not JSON', evalRunErrors('nope').length, 1],
    ['eval output missing', evalRunErrors(null).length, 1],
  ]
  cases.push(...proof.map(([name, got, want]): [string, unknown, unknown] => [name, got, want]), ...evals.map(([name, got, want]): [string, unknown, unknown] => [name, got, want]))
  errors.push(...cases.filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want)).map(([name, got, want]) => `${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))
  for (const e of errors) console.error(e)
  console.log(errors.length === 0 ? `gates ok: ${admits.length + cases.length} cases` : `gates: ${errors.length} mismatches`)
  process.exit(errors.length === 0 ? 0 : 1)
}
