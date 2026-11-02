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
  errors.push(...cases.filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want)).map(([name, got, want]) => `${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))
  for (const e of errors) console.error(e)
  console.log(errors.length === 0 ? `gates ok: ${admits.length + cases.length} cases` : `gates: ${errors.length} mismatches`)
  process.exit(errors.length === 0 ? 0 : 1)
}
