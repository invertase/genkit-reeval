import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { AttemptContext } from 'reeval'
import { buildWorkspace, callsExport, type Workspace } from '../docs/checks.ts'
import { observeGenkitCommands, observeWeb, printedIn } from '../transcript.ts'

/** True when the project imports `agents` from `@genkit-ai/middleware` (any alias or `* as X`) and calls it. */
export const usesAgentsMiddleware = (ws: Workspace): boolean => callsExport(ws.code, '@genkit-ai/middleware', 'agents')

/** One tool call's input and the text it returned. */
type ToolCall = { tool: string; input: unknown; output: string }

const stringLeaves = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(stringLeaves) : typeof value === 'object' && value !== null ? Object.values(value).flatMap(stringLeaves) : []

const field = (input: unknown, key: string): string | undefined => {
  const value: unknown = typeof input === 'object' && input !== null ? Reflect.get(input, key) : undefined
  return typeof value === 'string' ? value : undefined
}

const isShellTool = (tool: string) => tool === 'bash' || tool === 'shell'

type Token = { text: string; separator: boolean }

/** `command` split into shell words and the separators between commands; quotes are removed, a backslash inside double quotes kept unless it escapes a quote. */
export function shellTokens(command: string): Token[] {
  const tokens: Token[] = []
  let word = ''
  let inWord = false
  const flush = () => {
    if (inWord) tokens.push({ text: word, separator: false })
    word = ''
    inWord = false
  }
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? ''
    if (ch === "'") {
      const end = command.indexOf("'", i + 1)
      word += command.slice(i + 1, end < 0 ? undefined : end)
      inWord = true
      i = end < 0 ? command.length : end
    } else if (ch === '"') {
      inWord = true
      for (i++; i < command.length && command[i] !== '"'; i++) {
        if (command[i] === '\\' && /["\\$`]/.test(command[i + 1] ?? '')) i++
        word += command[i]
      }
    } else if (ch === '\\') {
      word += command[i + 1] ?? ''
      inWord = true
      i++
    } else if (/[|;&\n()]/.test(ch)) {
      flush()
      tokens.push({ text: ch, separator: true })
    } else if (/\s/.test(ch)) flush()
    else {
      word += ch
      inWord = true
    }
  }
  flush()
  return tokens
}

const SEARCHERS = /^(?:\S*\/)?(?:grep|egrep|fgrep|rg)$/
const VALUE_FLAGS = new Set(['-A', '-B', '-C', '-m', '-f', '-g', '-t', '-T', '-d', '-D', '--include', '--exclude', '--exclude-dir', '--glob', '--type', '--max-count', '--context', '--after-context', '--before-context'])

/** The patterns of the `grep`, `egrep`, `fgrep` and `rg` calls in `command` that search files; a filter on a pipe (no path, not recursive) is not a search. */
export function shellSearchPatterns(command: string): string[] {
  const tokens = shellTokens(command)
  const patterns: string[] = []
  tokens.forEach((token, at) => {
    if (token.separator || !SEARCHERS.test(token.text) || (at > 0 && !tokens[at - 1]?.separator && !/^(?:xargs|-\S*|\w+=\S*|timeout|\d+[smh]?)$/.test(tokens[at - 1]?.text ?? ''))) return
    const explicit: string[] = []
    const positional: string[] = []
    let recursive = token.text.endsWith('rg')
    let flagsDone = false
    for (let i = at + 1; i < tokens.length && !tokens[i]?.separator; i++) {
      const arg = tokens[i]?.text ?? ''
      if (flagsDone || !arg.startsWith('-') || arg === '-') positional.push(arg)
      else if (arg === '--') flagsDone = true
      else if (arg === '-e' || arg === '--regexp') explicit.push(tokens[++i]?.text ?? '')
      else if (arg.startsWith('--regexp=')) explicit.push(arg.slice('--regexp='.length))
      else if (VALUE_FLAGS.has(arg)) i++
      else if (/^-[^-]/.test(arg)) {
        const e = arg.indexOf('e')
        if (/^-[a-zA-Z]*e./.test(arg) && !/[ABCm]/.test(arg.slice(1, e))) explicit.push(arg.slice(e + 1))
        if (/[rR]/.test(arg.replace(/[ABCm]\d+$/, ''))) recursive = true
      } else if (arg === '--recursive' || arg === '--dereference-recursive') recursive = true
    }
    const [first, ...paths] = positional
    const searched = explicit.length > 0 ? positional : paths
    if (searched.length === 0 && !recursive) return
    patterns.push(...(explicit.length > 0 ? explicit : first === undefined ? [] : [first]))
  })
  return patterns
}

/** The alternatives of a grep or ripgrep pattern, `a\|b` and `a|b` alike, without anchors; empty ones dropped. */
export const patternTerms = (pattern: string): string[] =>
  pattern
    .split(/\\\||\|/)
    .map((t) => t.replace(/^\^|\$$|\\b|\\</g, '').replace(/\\>/g, '').trim())
    .filter((t) => t !== '')

/** Every term the agent searched files for, in order, once each by lower case: shell `grep`/`rg` patterns and a grep tool's `pattern`. */
export function searchTerms(calls: ToolCall[]): string[] {
  const terms = calls.flatMap((call) => {
    if (isShellTool(call.tool)) return shellSearchPatterns(field(call.input, 'command') ?? '').flatMap(patternTerms)
    const pattern = /grep|search_files/i.test(call.tool) ? field(call.input, 'pattern') : undefined
    return pattern === undefined ? [] : patternTerms(pattern)
  })
  const seen = new Set<string>()
  return terms.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
}

const DECLARATION_PATH = /[\w@.~/*{}-]*\.d\.[cm]?ts\b/g

/** Every declaration-file path or glob (`.d.ts`, `.d.mts`, `.d.cts`) named in a tool call's input, in order, once each. */
export const declarationPaths = (calls: ToolCall[]): string[] => [...new Set(calls.flatMap((call) => stringLeaves(call.input).flatMap((s) => s.match(DECLARATION_PATH) ?? [])))]

const here = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const NEW_WORDS = /hand-?off|subagent|multi-agent|transfer|router|genkit\.dev/i

/** The lines of the patched doc comments that name what the stock ones do not: seeing one in a tool's output means the agent saw the patched doc. */
export const PATCHED_LINES = [here('./tsdoc/agents.txt'), here('./tsdoc/agents-options.txt')]
  .flatMap((doc) => doc.split('\n'))
  .map((line) => line.replace(/^\s*\*\s?/, '').trim())
  .filter((line) => NEW_WORDS.test(line))

/** `c`'s tool calls with their inputs and the text each returned. */
const toolCalls = (c: AttemptContext): ToolCall[] =>
  c.turns.flatMap((turn) => turn.transcript.flatMap((e) => (e.type === 'tool' ? [{ tool: e.tool, input: e.input, output: stringLeaves(e.output).join('\n') }] : [])))

const AGENTS_DECLARATION = 'declare const agents: GenerateMiddleware'
const GENKIT_DEV = /https?:\/\/(?:[\w-]+\.)*genkit\.dev\S*/g

/**
 * Records how the agent searched: `searched-dts-files` (the declaration files and globs its tool calls named),
 * `search-terms` (what it grepped for), `read-agents-declaration` (a tool returned the `agents` declaration),
 * `saw-patched-tsdoc` (a tool returned a line only the patched doc has; always false in `stock`),
 * `genkit-dev-urls` (genkit.dev pages it fetched or curled), the web activity and the Genkit commands it ran.
 */
export function observeSearch(c: AttemptContext): void {
  const calls = toolCalls(c)
  c.observe('searched-dts-files', declarationPaths(calls).slice(0, 40))
  c.observe('search-terms', searchTerms(calls).slice(0, 40))
  c.observe('read-agents-declaration', calls.some((call) => call.output.includes(AGENTS_DECLARATION)))
  c.observe('saw-patched-tsdoc', calls.some((call) => PATCHED_LINES.some((line) => printedIn(line, call.output))))
  const fetched = c.turns.flatMap((t) => t.transcript.flatMap((e) => (e.type === 'web-fetch' && /genkit\.dev/.test(e.url) ? [e.url] : [])))
  const curled = calls.flatMap((call) => (isShellTool(call.tool) ? (field(call.input, 'command') ?? '').match(GENKIT_DEV) ?? [] : []))
  c.observe('genkit-dev-urls', [...new Set([...fetched, ...curled])].slice(0, 20))
  observeWeb(c)
  observeGenkitCommands(c)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors: string[] = []
  const MW = '@genkit-ai/middleware'
  const ws = (code: string) => buildWorkspace('{}', { 'src/agents.ts': code })
  const uses: [string, string, boolean][] = [
    ['the healthy triage', `import { agents } from '${MW}';\nai.defineAgent({ use: [agents({ agents: ['orderAgent'] })] })`, true],
    ['aliased', `import { agents as delegate } from '${MW}'\nconst mw = delegate({ agents: [] })`, true],
    ['namespace', `import * as mw from '${MW}'\nuse: [mw.agents({ agents: [] })]`, true],
    ['imported, never called', `import { agents } from '${MW}'\nconsole.log(agents)`, false],
    ['wrapper tools', `const askOrderDesk = ai.defineTool({ name: 'askOrderDesk' }, async ({ q }) => (await orderAgent.chat().send(q)).text)`, false],
    ['agents from another module', `import { agents } from './agents.js'\nagents({})`, false],
    ['only in a comment', `// import { agents } from '${MW}'\n// agents({ agents: [] })`, false],
    ['a local agents() function', `function agents(x) { return x }\nagents({ agents: [] })`, false],
  ]
  for (const [name, code, want] of uses) if (usesAgentsMiddleware(ws(code)) !== want) errors.push(`usesAgentsMiddleware on ${name}: should be ${want}`)

  const bash = (command: string): ToolCall => ({ tool: 'bash', input: { command, description: 'x' }, output: '' })
  const searches: [string, ToolCall[], string[]][] = [
    ['BRE alternatives over two dirs', [bash(String.raw`cd node_modules && grep -rln "handoff\|Handoff" @genkit-ai/ai/lib @genkit-ai/middleware/lib 2>/dev/null | head`)], ['handoff']],
    ['four terms, one path glob', [bash(String.raw`cd .; grep -rn "handoff\|handOff\|subAgent\|delegate" node_modules/@genkit-ai/ai/lib/*.d.ts | head -20`)], ['handoff', 'subAgent', 'delegate']],
    ['single quotes and -i', [bash(String.raw`grep -rni 'transfer' node_modules/@genkit-ai/middleware/lib`)], ['transfer']],
    ['-E alternation', [bash('grep -rE "route|router" node_modules/genkit/lib')], ['route', 'router']],
    ['-e patterns', [bash('grep -rn -e asTool -e delegate node_modules/@genkit-ai/ai/lib')], ['asTool', 'delegate']],
    ['ripgrep with no path', [bash('rg -n "sub-agent"')], ['sub-agent']],
    ['a filter on a pipe is not a search', [bash(`cat node_modules/genkit/package.json | grep '"version"'`)], []],
    ['grep -v on a pipe is not a search', [bash('node x.mjs 2>&1 | grep -v UNDICI')], []],
    ['-A with a value', [bash('grep -n "asTool" -A25 node_modules/@genkit-ai/ai/lib/tool.d.ts')], ['asTool']],
    ['--include with a glob', [bash('grep -rl "defineAgent" ../@genkit-ai/ --include=*.d.ts')], ['defineAgent']],
    ['anchors dropped', [bash(String.raw`grep -n "^export declare\|\bagents\b" node_modules/@genkit-ai/middleware/lib/index.d.ts`)], ['export declare', 'agents']],
    ['a grep tool', [{ tool: 'grep', input: { pattern: 'handoff|delegat', path: 'node_modules' }, output: '' }], ['handoff', 'delegat']],
    ['once each by lower case', [bash('grep -rn handoff node_modules'), bash('grep -rni HandOff node_modules')], ['handoff']],
    ['echo of grep is not a search', [bash('echo grep -r handoff node_modules')], []],
  ]
  for (const [name, calls, want] of searches) {
    const got = searchTerms(calls)
    if (JSON.stringify(got) !== JSON.stringify(want)) errors.push(`searchTerms on ${name}: ${JSON.stringify(got)}, should be ${JSON.stringify(want)}`)
  }

  const read = (file_path: string): ToolCall => ({ tool: 'read', input: { file_path }, output: '' })
  const paths = declarationPaths([
    read('node_modules/@genkit-ai/ai/lib/agent.d.ts'),
    bash('grep -rn "handoff" node_modules/@genkit-ai/ai/lib/*.d.ts node_modules/@genkit-ai/middleware/lib/agents.d.mts'),
    read('node_modules/@genkit-ai/ai/lib/agent.d.ts'),
    read('src/agents.ts'),
  ])
  const wantPaths = ['node_modules/@genkit-ai/ai/lib/agent.d.ts', 'node_modules/@genkit-ai/ai/lib/*.d.ts', 'node_modules/@genkit-ai/middleware/lib/agents.d.mts']
  if (JSON.stringify(paths) !== JSON.stringify(wantPaths)) errors.push(`declarationPaths: ${JSON.stringify(paths)}, should be ${JSON.stringify(wantPaths)}`)

  if (PATCHED_LINES.length < 3) errors.push(`only ${PATCHED_LINES.length} patched doc lines to recognise`)
  const stock = (() => {
    try {
      return readFileSync(new URL('../../app/node_modules/@genkit-ai/middleware/lib/agents.d.ts', import.meta.url), 'utf8')
    } catch {
      return null
    }
  })()
  if (stock === null) errors.push('no evals/app/node_modules: run npm ci in evals/app first')
  else for (const line of PATCHED_LINES) if (printedIn(line, stock)) errors.push(`the stock agents.d.ts already has the patched line ${JSON.stringify(line)}`)
  const grepHit = `node_modules/@genkit-ai/middleware/lib/agents.d.ts:57: * Genkit builds a multi-agent system. Agent hand-off, handoff, transfer to a`
  if (!PATCHED_LINES.some((line) => printedIn(line, grepHit))) errors.push('a grep hit on the patched doc is not recognised')

  for (const e of errors) console.error(e)
  console.log(errors.length === 0 ? `inline-docs checks ok: ${uses.length + searches.length + 2} cases` : `inline-docs checks: ${errors.length} mismatches`)
  process.exit(errors.length === 0 ? 0 : 1)
}
