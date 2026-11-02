import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** One `claude` invocation the sandbox's stub recorded. */
export type StubRun = { argv: string[]; exit: number; stderr: string }

/** The invocations in the stub's `log.jsonl`, oldest first; unreadable lines are skipped. */
export function stubRuns(log: string | null): StubRun[] {
  return (log ?? '').split('\n').flatMap((line) => {
    try {
      const run = JSON.parse(line) as Partial<StubRun>
      return Array.isArray(run.argv) ? [{ argv: run.argv.map(String), exit: Number(run.exit), stderr: String(run.stderr ?? '') }] : []
    } catch {
      return []
    }
  })
}

/** The options a recorded `claude` run rejected, from "error: unknown option '--cwd'". */
export const rejectedOptions = (run: StubRun): string[] => [...run.stderr.matchAll(/unknown option '([^']+)'/g)].map((m) => m[1] ?? '')

/** The `args` of every server in a `.mcp.json` whose command is `genkit` and whose args hold `mcp`. */
export function genkitServers(mcpJson: string | null): string[][] {
  try {
    const doc = JSON.parse(mcpJson ?? '') as { mcpServers?: Record<string, { command?: unknown; args?: unknown }> }
    return Object.values(doc.mcpServers ?? {}).flatMap((s) => {
      const args = Array.isArray(s.args) ? s.args.map(String) : []
      return typeof s.command === 'string' && /(^|\/)genkit$/.test(s.command) && args.includes('mcp') ? [args] : []
    })
  } catch {
    return []
  }
}

/** Why a `.mcp.json` registers no server that runs `genkit mcp`; empty when it does. */
export const registrationErrors = (mcpJson: string | null): string[] =>
  genkitServers(mcpJson).length > 0 ? [] : ['.mcp.json is missing, not JSON, or registers no server with command genkit and args holding mcp']

/** The registered Genkit servers whose args carry `--cwd`, which neither `genkit mcp` nor Claude Code knows. */
export const cwdErrors = (mcpJson: string | null): string[] =>
  genkitServers(mcpJson)
    .filter((args) => args.some((a) => a === '--cwd' || a.startsWith('--cwd=')))
    .map((args) => `args hold --cwd: ${args.join(' ')}`)

/** The registered Genkit servers whose `--project-root` is not `workspace`; a server without one is fine. */
export function rootErrors(mcpJson: string | null, workspace: string): string[] {
  return genkitServers(mcpJson).flatMap((args) => {
    const at = args.findIndex((a) => a === '--project-root' || a.startsWith('--project-root='))
    if (at < 0) return []
    const flag = args[at] ?? ''
    const value = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : args[at + 1]
    return value !== undefined && path.resolve(workspace, value) === workspace ? [] : [`--project-root ${value ?? '(none)'} is not ${workspace}`]
  })
}

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
    ['npx is not genkit', registrationErrors(server('npx', ['genkit', 'mcp'])).length, 1],
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
    [
      'stub log',
      stubRuns(`${JSON.stringify({ argv: ['mcp', 'add', 'g', '--cwd', '.'], exit: 1, stderr: "error: unknown option '--cwd'" })}\nnot json\n`).map(rejectedOptions),
      [['--cwd']],
    ],
    ['empty stub log', stubRuns(null), []],
  ]
  errors.push(...cases.filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want)).map(([name, got, want]) => `${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))
  for (const e of errors) console.error(e)
  console.log(errors.length === 0 ? `gates ok: ${admits.length + cases.length} cases` : `gates: ${errors.length} mismatches`)
  process.exit(errors.length === 0 ? 0 : 1)
}
