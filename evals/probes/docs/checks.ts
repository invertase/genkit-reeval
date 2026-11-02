import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { type AttemptContext, expect } from 'reeval'
import { parseResult } from '../probe.ts'
import { callsOf, isShell, observeWeb } from '../transcript.ts'

/** Every check label of the docs suite, so `cases.ts` and the runners cannot drift apart. */
export const CHECK = {
  usesGoogleGenai: 'depends on @genkit-ai/google-genai',
  noLegacyGemini: 'no @genkit-ai/googleai or @genkit-ai/vertexai',
  noModelConstants: 'no gemini model constants',
  typechecks: 'typechecks',
  startPrints: 'npm start prints text',
  outputSchema: 'asks for output with a schema',
  noDeprecatedImports: 'no deprecated imports',
  flowReturnsContact: 'flow returns the contact',
  usesMcp: 'depends on @genkit-ai/mcp',
  noLegacyMcp: 'no genkitx-mcp',
  serverListsTool: 'server lists and calls the tool over stdio',
  usesAnthropic: 'depends on @genkit-ai/anthropic',
  noAnthropicSdk: 'no direct @anthropic-ai/sdk import',
  noStaleClaude: 'no retired claude model names',
  registersAnthropic: 'registers the anthropic plugin',
  usesFallback: 'uses the fallback middleware',
} as const

/** The MCP client the hidden `verify-mcp.mts` imports; installed after the turn, outside the workspace. */
const MCP_CLIENT = '@modelcontextprotocol/sdk@1.32.2'

const verifyScript = (name: string) => readFileSync(new URL(`./sandbox/${name}`, import.meta.url), 'utf8')

/** The agent's project as the checks read it: `package.json`, every source file outside `node_modules` and every `.prompt` file. */
export type Workspace = {
  /** names under `dependencies` and `devDependencies` */
  deps: string[]
  /** workspace path to text, source files only */
  files: Record<string, string>
  /** workspace path to text of each `.prompt` file */
  prompts: Record<string, string>
  /** every source file's text, joined, without comments */
  code: string
  /** package names imported by the source files */
  imports: string[]
  /** `package.json` text, source files and all, for pattern matches */
  everything: string
}

const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g
const IMPORT_STATEMENT = /\bimport\s+(?:type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g

/** `code` without `//` and `/* *\/` comments; a `//` right after a colon or inside a quote stays, so URLs survive. */
export const stripComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1')

function packageName(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('node:') || specifier.startsWith('/')) return undefined
  return specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
}

/** Builds a `Workspace` from the text of `package.json` and the files found (source and `.prompt`). */
export function buildWorkspace(pkgText: string, found: Record<string, string>): Workspace {
  let deps: string[] = []
  try {
    const pkg = JSON.parse(pkgText) as { dependencies?: object; devDependencies?: object }
    deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
  } catch {
    deps = []
  }
  const files = Object.fromEntries(Object.entries(found).filter(([path]) => !path.endsWith('.prompt')))
  const prompts = Object.fromEntries(Object.entries(found).filter(([path]) => path.endsWith('.prompt')))
  const code = stripComments(Object.values(files).join('\n'))
  const imports = [...new Set([...code.matchAll(IMPORT)].flatMap((m) => packageName(m[1] ?? m[2] ?? '') ?? []))]
  return { deps, files, prompts, code, imports, everything: `${pkgText}\n${code}` }
}

/** Reads the project from the sandbox. */
export async function readWorkspace(c: AttemptContext): Promise<Workspace> {
  const pkgText = (await c.readFile('package.json')) ?? '{}'
  const listed = await c.exec(
    "find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \\( -name '*.ts' -o -name '*.mts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' -o -name '*.prompt' \\) ! -name '*.d.ts' -print",
  )
  const found: Record<string, string> = {}
  for (const path of listed.stdout.split('\n').filter(Boolean).map((p) => p.replace(/^\.\//, '')).sort()) {
    found[path] = (await c.readFile(path)) ?? ''
  }
  return buildWorkspace(pkgText, found)
}

type Binding = { imported: string; local: string }

/** The named imports of `code` from packages for which `fromPackage` is true, with their local names. */
function namedImports(code: string, fromPackage: (name: string) => boolean): Binding[] {
  return [...code.matchAll(IMPORT_STATEMENT)].flatMap((m) => {
    if (!fromPackage(m[2] ?? '')) return []
    const braces = /\{([^}]*)\}/.exec(m[1] ?? '')?.[1] ?? ''
    return braces.split(',').flatMap((part) => {
      const [imported, local] = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)
      return imported ? [{ imported, local: local ?? imported }] : []
    })
  })
}

const escape = (name: string) => name.replace(/\$/g, '\\$')

/** True when `code` imports `name` from `pkg`, by name under any alias or through `* as X`, and calls it outside the import statements. */
function callsExport(code: string, pkg: string, name: string): boolean {
  const body = code.replace(IMPORT_STATEMENT, '')
  const namespaces = [...code.matchAll(IMPORT_STATEMENT)].flatMap((m) => (m[2] === pkg ? [...(m[1] ?? '').matchAll(/\*\s+as\s+([\w$]+)/g)].map((n) => n[1] ?? '') : []))
  return (
    namedImports(code, (n) => n === pkg).some((b) => b.imported === name && new RegExp(`(?<![\\w$.])${escape(b.local)}\\s*\\(`).test(body)) ||
    namespaces.some((ns) => new RegExp(`(?<![\\w$.])${escape(ns)}\\.${name}\\s*\\(`).test(body))
  )
}

/** Gemini model constants such as `gemini20Flash`, which `@genkit-ai/google-genai` no longer exports. */
const MODEL_CONSTANT = /\bgemini(?:\d\w*|Pro\w*|Flash\w*)\b/
const GENKIT_PACKAGE = (name: string) => name === 'genkit' || name.startsWith('@genkit-ai/')

/** Packages Genkit retired: the Gemini plugins and the pre-1.0 flow and prompt packages. */
const DEPRECATED_JS = ['@genkit-ai/googleai', '@genkit-ai/vertexai', '@genkit-ai/flow', '@genkit-ai/dotprompt']

const STALE_CLAUDE = /\bclaude-(?:3|2|instant|opus-4-1)[\w.-]*/

const STALE: [string, RegExp][] = [
  ['@genkit-ai/googleai', /@genkit-ai\/googleai\b/],
  ['@genkit-ai/vertexai', /@genkit-ai\/vertexai\b/],
  ['genkitx-*', /\bgenkitx-[\w-]+/],
  ['gemini model constants', MODEL_CONSTANT],
  ['gemini-1.5 or gemini-2.0 names', /\bgemini-(?:1\.5|2\.0)[\w.-]*/],
  ['retired claude names', STALE_CLAUDE],
  ['configureGenkit', /\bconfigureGenkit\b/],
]

/** The retired package names, model constants and calls found in the project. */
export const staleIdentifiers = (ws: Workspace): string[] => STALE.filter(([, pattern]) => pattern.test(ws.everything)).map(([name]) => name)

const DOCS_COMMAND = /genkit\.dev|\bllms[\w-]*\.txt/

/** Records the web activity, plus the shell commands that reach genkit.dev or an llms.txt (a shell `curl` makes no web-fetch event) and what the harness left unreported. */
export function observeDocsWeb(c: AttemptContext): void {
  observeWeb(c)
  const commands = callsOf(c).filter((call) => isShell(call) && DOCS_COMMAND.test(call.command))
  c.observe('web-shell-docs-commands', commands.map((call) => call.command.slice(0, 200)).slice(0, 10))
  c.observe('web-unreported', [...new Set(c.turns.flatMap((t) => t.unreported))])
}

const hasDep = (ws: Workspace, name: string) => ws.deps.includes(name)
const importsPkg = (ws: Workspace, name: string) => ws.imports.includes(name)

/** `errors` is empty when `npm start` exits 0 within two minutes and prints at least five words. */
async function startErrors(c: AttemptContext): Promise<string[]> {
  const run = await c.exec('timeout 120 npm start --silent', { retries: 1, interval: 3000 })
  if (run.exitCode !== 0) return [`npm start exited ${run.exitCode}: ${run.stderr.trim().slice(-400)}`]
  const words = run.stdout.trim().split(/\s+/).filter(Boolean).length
  return words >= 5 ? [] : [`npm start printed ${words} words: ${JSON.stringify(run.stdout.slice(0, 200))}`]
}

/** Why `run` of a hidden script is not a passing `PROBE_RESULT {"ok":true,...}` line; empty when it is. */
export function resultErrors(run: { exitCode: number; stdout: string; stderr: string }): string[] {
  const result = parseResult(run)
  if (typeof result === 'string') return [result]
  if (!('ok' in result)) return [`malformed result: ${JSON.stringify(result).slice(0, 300)}`]
  return result.ok === true ? [] : [`${JSON.stringify(result).slice(0, 600)}`]
}

/** Gemini model constants imported from a Genkit package, by their exported names. */
export const importedModelConstants = (ws: Workspace): string[] =>
  namedImports(ws.code, GENKIT_PACKAGE).flatMap((b) => (new RegExp(`^(?:${MODEL_CONSTANT.source})$`).test(b.imported) ? [b.imported] : []))

/** True when a generate call, flow or `.prompt` file asks for output with a schema. */
export function asksForSchema(ws: Workspace): boolean {
  if (/\boutput\s*:\s*\{[^}]*\bschema\b/.test(ws.code)) return true
  const names = [...ws.code.matchAll(/\boutput\s*:\s*([A-Za-z_$][\w$]*)\s*[,}\n]/g)].map((m) => m[1] ?? '')
  if (/[{,]\s*output\s*[,}]/.test(ws.code)) names.push('output')
  if (names.some((name) => new RegExp(`\\b(?:const|let|var)\\s+${escape(name)}\\b[^=]*=\\s*\\{[^}]*\\bschema\\b`).test(ws.code))) return true
  return Object.values(ws.prompts).some(
    (text) => /^output:[ \t]*\n(?:[ \t]+.*\n)*?[ \t]+schema[ \t]*:/m.test(`${text}\n`) || /^output:[ \t]*\{[^}]*\bschema\b/m.test(text),
  )
}

/** True when the project depends on `@genkit-ai/anthropic`, imports `anthropic` from it (any alias or `* as X`) and calls it. */
export const registersAnthropic = (ws: Workspace): boolean =>
  hasDep(ws, '@genkit-ai/anthropic') && callsExport(ws.code, '@genkit-ai/anthropic', 'anthropic')

/** True when the project depends on `@genkit-ai/middleware`, imports `fallback` from it (any alias or `* as X`) and calls it. */
export const usesFallback = (ws: Workspace): boolean =>
  hasDep(ws, '@genkit-ai/middleware') && callsExport(ws.code, '@genkit-ai/middleware', 'fallback')

const typecheck = (c: AttemptContext) => expect(c.exec('node_modules/.bin/tsc --noEmit'), CHECK.typechecks).toSucceed()

const RUNNERS: Record<string, (c: AttemptContext, ws: Workspace) => Promise<void>> = {
  'pkg-gemini-haiku': async (c, ws) => {
    expect(hasDep(ws, '@genkit-ai/google-genai'), CHECK.usesGoogleGenai).toBe(true)
    expect(['@genkit-ai/googleai', '@genkit-ai/vertexai'].filter((n) => hasDep(ws, n) || importsPkg(ws, n)), CHECK.noLegacyGemini).toEqual([])
    expect(importedModelConstants(ws), CHECK.noModelConstants).toEqual([])
    await typecheck(c)
    expect(await startErrors(c), CHECK.startPrints).toEqual([])
  },

  'structured-output': async (c, ws) => {
    expect(asksForSchema(ws), CHECK.outputSchema).toBe(true)
    expect(DEPRECATED_JS.filter((n) => hasDep(ws, n) || importsPkg(ws, n)), CHECK.noDeprecatedImports).toEqual([])
    await typecheck(c)
    await c.writeFile('~/.verify-structured.mts', verifyScript('verify-structured.mts'))
    const run = await c.exec('timeout 180 node_modules/.bin/tsx ~/.verify-structured.mts', { retries: 1, interval: 3000 })
    expect(resultErrors(run), CHECK.flowReturnsContact).toEqual([])
  },

  'mcp-server': async (c, ws) => {
    expect(hasDep(ws, '@genkit-ai/mcp'), CHECK.usesMcp).toBe(true)
    expect(['genkitx-mcp'].filter((n) => hasDep(ws, n) || importsPkg(ws, n)), CHECK.noLegacyMcp).toEqual([])
    await typecheck(c)
    await c.writeFile('~/.verify-mcp/package.json', '{"name":"verify-mcp","private":true,"type":"module"}\n')
    const install = await c.exec(`npm --prefix ~/.verify-mcp install --no-audit --no-fund ${MCP_CLIENT}`, { retries: 2, interval: 3000 })
    if (install.exitCode !== 0) throw new Error(`could not install the MCP client: ${install.stderr.slice(-400)}`)
    await c.writeFile('~/.verify-mcp/verify.mts', verifyScript('verify-mcp.mts'))
    const run = await c.exec('timeout 120 node_modules/.bin/tsx ~/.verify-mcp/verify.mts', { retries: 1, interval: 3000 })
    expect(resultErrors(run), CHECK.serverListsTool).toEqual([])
  },

  'anthropic-plugin': async (c, ws) => {
    expect(hasDep(ws, '@genkit-ai/anthropic'), CHECK.usesAnthropic).toBe(true)
    expect(importsPkg(ws, '@anthropic-ai/sdk'), CHECK.noAnthropicSdk).toBe(false)
    expect(ws.code.match(STALE_CLAUDE)?.[0] ?? null, CHECK.noStaleClaude).toBe(null)
    expect(registersAnthropic(ws), CHECK.registersAnthropic).toBe(true)
    await typecheck(c)
  },

  'fallback-middleware': async (c, ws) => {
    expect(hasDep(ws, '@genkit-ai/middleware') && importsPkg(ws, '@genkit-ai/middleware') && usesFallback(ws), CHECK.usesFallback).toBe(true)
    await typecheck(c)
    expect(await startErrors(c), CHECK.startPrints).toEqual([])
  },
}

/** Runs the deterministic checks of the probe `name` against the agent's project, and records what the turn did on the web and which stale identifiers the project holds. */
export async function runChecks(c: AttemptContext, name: string): Promise<void> {
  const run = RUNNERS[name]
  if (!run) throw new Error(`no runner for docs probe ${name}`)
  const ws = await readWorkspace(c)
  observeDocsWeb(c)
  c.observe('stale', staleIdentifiers(ws))
  c.observe('dependencies', ws.deps)
  await run(c, ws)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ws = (deps: string[], code: string, prompts: Record<string, string> = {}) =>
    buildWorkspace(JSON.stringify({ dependencies: Object.fromEntries(deps.map((d) => [d, '1.0.0'])) }), { 'src/index.ts': code, ...prompts })
  const MW = '@genkit-ai/middleware'
  const cases: [string, boolean, boolean][] = [
    ['fallback inline', usesFallback(ws([MW], `import { fallback } from '${MW}'\nai.generate({ use: [fallback({ models: [] })] })`)), true],
    ['fallback in a variable', usesFallback(ws([MW], `import { fallback } from '${MW}'\nconst mw = fallback({ models: [] })\nai.generate({ use: [mw] })`)), true],
    ['fallback nested with retry', usesFallback(ws([MW], `import { retry, fallback } from "${MW}"\nai.generate({ use: [retry({ statuses: ['X'] }), fallback({ models: [] })] })`)), true],
    ['fallback aliased', usesFallback(ws([MW], `import { fallback as fb } from '${MW}'\nai.generate({ use: [fb({})] })`)), true],
    ['fallback multi-line import', usesFallback(ws([MW], `import {\n  retry,\n  fallback,\n} from '${MW}'\nconst m = [retry({}), fallback({})]`)), true],
    ['fallback imported not called', usesFallback(ws([MW], `import { fallback } from '${MW}'\nconsole.log(fallback)`)), false],
    ['fallback from another package', usesFallback(ws([MW], `import { fallback } from './mine'\nfallback({})`)), false],
    ['fallback without dependency', usesFallback(ws([], `import { fallback } from '${MW}'\nfallback({})`)), false],
    ['fallback by try/catch', usesFallback(ws([], `try { await ai.generate({}) } catch { await ai.generate({}) }`)), false],
    ['main().catch is not a cheat', usesFallback(ws([MW], `import { fallback } from '${MW}'\nmain().catch(console.error)\nfallback({})`)), true],
    ['anthropic plain', registersAnthropic(ws(['@genkit-ai/anthropic'], `import { anthropic } from '@genkit-ai/anthropic'\ngenkit({ plugins: [anthropic()] })`)), true],
    ['anthropic aliased, plugin in a variable', registersAnthropic(ws(['@genkit-ai/anthropic'], `import { anthropic as claude } from '@genkit-ai/anthropic'\nconst plugins = [claude({ apiKey: 'k' })]\ngenkit({ plugins })`)), true],
    ['anthropic imported not called', registersAnthropic(ws(['@genkit-ai/anthropic'], `import { anthropic } from '@genkit-ai/anthropic'\nanthropic.model('claude-sonnet-4-6')`)), false],
    ['anthropic without dependency', registersAnthropic(ws([], `import { anthropic } from '@genkit-ai/anthropic'\nanthropic()`)), false],
    ['anthropic sdk instead', registersAnthropic(ws([], `import Anthropic from '@anthropic-ai/sdk'\nnew Anthropic()`)), false],
    ['schema inline', asksForSchema(ws([], `ai.generate({ prompt, output: { schema: Contact } })`)), true],
    ['schema after format', asksForSchema(ws([], `ai.generate({ prompt, output: { format: 'json', schema: z.object({ a: z.string() }) } })`)), true],
    ['schema options object', asksForSchema(ws([], `const options = { schema: Contact }\nai.generate({ prompt, output: options })`)), true],
    ['schema in a prompt file', asksForSchema(ws([], 'x', { 'prompts/a.prompt': '---\nmodel: x\noutput:\n  schema:\n    name: string\n---\nhi' })), true],
    ['schema destructured output is not a request', asksForSchema(ws([], `const { output: contact } = await ai.generate({ prompt })`)), false],
    ['schema prompt file without output', asksForSchema(ws([], 'x', { 'prompts/a.prompt': '---\nmodel: x\ninput:\n  schema:\n    name: string\n---\nhi' })), false],
    ['schema by JSON.parse', asksForSchema(ws([], `JSON.parse(text)`)), false],
    ['constant imported from googleai', importedModelConstants(ws([], `import { gemini20Flash, googleAI } from '@genkit-ai/googleai'`)).length > 0, true],
    ['constant imported from google-genai', importedModelConstants(ws([], `import { gemini25FlashLite as m } from '@genkit-ai/google-genai'`)).length > 0, true],
    ['constant as a local variable', importedModelConstants(ws([], `import { googleAI } from '@genkit-ai/google-genai'\nconst gemini20Flash = googleAI.model('gemini-flash-latest')`)).length > 0, false],
    ['constant imported from a local module', importedModelConstants(ws([], `import { gemini20Flash } from './models'`)).length > 0, false],
    ['no constants', importedModelConstants(ws([], `import { googleAI } from '@genkit-ai/google-genai'`)).length > 0, false],
    ['stale claude name', STALE_CLAUDE.test(ws([], `anthropic.model('claude-3-haiku')`).code), true],
    ['stale claude opus-4-1', STALE_CLAUDE.test(ws([], `anthropic.model('claude-opus-4-1')`).code), true],
    ['current claude name', STALE_CLAUDE.test(ws([], `anthropic.model('claude-sonnet-4-6')`).code), false],
    ['stale claude name in a line comment', STALE_CLAUDE.test(ws([], `// claude-3-haiku is retired\nanthropic.model('claude-sonnet-4-6')`).code), false],
    ['stale claude name in a block comment', STALE_CLAUDE.test(ws([], `/* claude-opus-4-1 is retired */\nanthropic.model('claude-sonnet-4-6')`).code), false],
    ['fallback namespace import', usesFallback(ws([MW], `import * as mw from '${MW}'\nai.generate({ use: [mw.fallback({})] })`)), true],
    ['fallback default plus named import', usesFallback(ws([MW], `import def, { fallback } from '${MW}'\nfallback({})`)), true],
    ['fallback namespace imported not called', usesFallback(ws([MW], `import * as mw from '${MW}'\nmw.retry({})`)), false],
    ['fallback only in a comment', usesFallback(ws([MW], `import { fallback } from '${MW}'\n// fallback({ models: [] })\n/* fallback({}) */`)), false],
    ['anthropic namespace import', registersAnthropic(ws(['@genkit-ai/anthropic'], `import * as a from '@genkit-ai/anthropic'\ngenkit({ plugins: [a.anthropic()] })`)), true],
    ['anthropic only in a comment', registersAnthropic(ws(['@genkit-ai/anthropic'], `import { anthropic } from '@genkit-ai/anthropic'\n// plugins: [anthropic()]`)), false],
    ['schema shorthand output', asksForSchema(ws([], `const output = { schema: Contact }\nai.generate({ prompt, output })`)), true],
    ['schema shorthand without a definition', asksForSchema(ws([], `const { output } = await ai.generate({ prompt })`)), false],
    ['schema only in a comment', asksForSchema(ws([], `// output: { schema: Contact }`)), false],
    ['schema yaml flow map', asksForSchema(ws([], 'x', { 'prompts/a.prompt': '---\nmodel: x\noutput: {format: json, schema: X}\n---\nhi' })), true],
    ['result ok', resultErrors({ exitCode: 0, stdout: 'x\nPROBE_RESULT {"ok":true}\n', stderr: '' }).length === 0, true],
    ['result not ok', resultErrors({ exitCode: 0, stdout: 'PROBE_RESULT {"ok":false}\n', stderr: '' }).length === 0, false],
    ['result malformed', resultErrors({ exitCode: 0, stdout: 'PROBE_RESULT {oops\n', stderr: '' }).length === 0, false],
    ['result missing', resultErrors({ exitCode: 1, stdout: '', stderr: 'boom' }).length === 0, false],
  ]
  const wrong = cases.filter(([, got, want]) => got !== want).map(([name, , want]) => `${name}: expected ${want}`)
  if (wrong.length > 0) {
    console.error(wrong.join('\n'))
    process.exit(1)
  }
  console.log(`checks self-check: ${cases.length} cases ok`)
}
