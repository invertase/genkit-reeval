import { readFileSync } from 'node:fs'
import { type AttemptContext, expect } from 'reeval'

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
  registersAnthropic: 'registers the anthropic plugin',
  usesFallback: 'uses the fallback middleware',
  noTryCatch: 'no hand-written try/catch',
} as const

const verifyScript = (name: string) => readFileSync(new URL(`./sandbox/${name}`, import.meta.url), 'utf8')

/** The agent's project as the checks read it: `package.json` and every source file outside `node_modules`. */
export type Workspace = {
  /** names under `dependencies` and `devDependencies` */
  deps: string[]
  /** workspace path to text */
  files: Record<string, string>
  /** every source file's text, joined */
  code: string
  /** package names imported by the source files */
  imports: string[]
  /** `package.json` text, source files and all, for pattern matches */
  everything: string
}

const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g

function packageName(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('node:') || specifier.startsWith('/')) return undefined
  return specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
}

/** Reads the project from the sandbox. */
export async function readWorkspace(c: AttemptContext): Promise<Workspace> {
  const pkgText = (await c.readFile('package.json')) ?? '{}'
  let deps: string[] = []
  try {
    const pkg = JSON.parse(pkgText) as { dependencies?: object; devDependencies?: object }
    deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
  } catch {
    // a package.json that does not parse has no dependencies
  }
  const listed = await c.exec(
    "find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \\( -name '*.ts' -o -name '*.mts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \\) ! -name '*.d.ts' -print",
  )
  const files: Record<string, string> = {}
  for (const path of listed.stdout.split('\n').filter(Boolean).map((p) => p.replace(/^\.\//, '')).sort()) {
    files[path] = (await c.readFile(path)) ?? ''
  }
  const code = Object.values(files).join('\n')
  const imports = [...new Set([...code.matchAll(IMPORT)].flatMap((m) => packageName(m[1] ?? m[2] ?? '') ?? []))]
  return { deps, files, code, imports, everything: `${pkgText}\n${code}` }
}

/** Gemini model constants such as `gemini20Flash`, which `@genkit-ai/google-genai` no longer exports. */
const MODEL_CONSTANT = /\bgemini(?:\d\w*|Pro\w*|Flash\w*)\b/

const STALE: [string, RegExp][] = [
  ['@genkit-ai/googleai', /@genkit-ai\/googleai\b/],
  ['@genkit-ai/vertexai', /@genkit-ai\/vertexai\b/],
  ['genkitx-*', /\bgenkitx-[\w-]+/],
  ['gemini model constants', MODEL_CONSTANT],
  ['gemini-1.5 or gemini-2.0 names', /\bgemini-(?:1\.5|2\.0)[\w.-]*/],
  ['claude-3 names', /\bclaude-3[\w.-]*/],
  ['configureGenkit', /\bconfigureGenkit\b/],
]

/** The retired package names, model constants and calls found in the project. */
export const staleIdentifiers = (ws: Workspace): string[] => STALE.filter(([, pattern]) => pattern.test(ws.everything)).map(([name]) => name)

/** Records what the turns did on the web, which no egress policy can show for server-side search. */
export function observeWeb(c: AttemptContext): void {
  const events = c.turns.flatMap((t) => t.transcript)
  const fetched = events.flatMap((e) => (e.type === 'web-fetch' ? [e.url] : []))
  const hosts = new Set<string>()
  for (const url of fetched) {
    try {
      hosts.add(new URL(url).host)
    } catch {
      hosts.add(url.slice(0, 80))
    }
  }
  c.observe('web-searches', events.filter((e) => e.type === 'web-search').length)
  c.observe('web-fetches', fetched.length)
  c.observe('web-fetched-hosts', [...hosts].slice(0, 20))
  c.observe('web-unreported', c.turns.flatMap((t) => t.unreported))
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

/** `errors` is empty when the hidden script `file` prints `RESULT {"ok":true,...}`. */
function resultErrors(run: { exitCode: number; stdout: string; stderr: string }): string[] {
  const line = run.stdout.split('\n').reverse().find((l) => l.startsWith('RESULT '))
  if (line === undefined) return [`no result, exit ${run.exitCode}: ${(run.stderr || run.stdout).trim().slice(-400)}`]
  const parsed = JSON.parse(line.slice('RESULT '.length)) as { ok: boolean; error?: string }
  return parsed.ok ? [] : [line.slice(0, 600)]
}

const typecheck = (c: AttemptContext) => expect(c.exec('node_modules/.bin/tsc --noEmit'), CHECK.typechecks).toSucceed()

const RUNNERS: Record<string, (c: AttemptContext, ws: Workspace) => Promise<void>> = {
  'pkg-gemini-haiku': async (c, ws) => {
    expect(hasDep(ws, '@genkit-ai/google-genai'), CHECK.usesGoogleGenai).toBe(true)
    expect(['@genkit-ai/googleai', '@genkit-ai/vertexai'].filter((n) => hasDep(ws, n) || importsPkg(ws, n)), CHECK.noLegacyGemini).toEqual([])
    expect(ws.code.match(MODEL_CONSTANT)?.[0] ?? null, CHECK.noModelConstants).toBe(null)
    await typecheck(c)
    expect(await startErrors(c), CHECK.startPrints).toEqual([])
  },

  'structured-output': async (c, ws) => {
    expect(/\boutput\s*:\s*\{[^}]*\bschema\b/.test(ws.code), CHECK.outputSchema).toBe(true)
    expect(['@genkit-ai/googleai', '@genkit-ai/vertexai', 'genkitx-genkit'].filter((n) => hasDep(ws, n) || importsPkg(ws, n)), CHECK.noDeprecatedImports).toEqual([])
    await typecheck(c)
    await c.writeFile('~/.verify-structured.mts', verifyScript('verify-structured.mts'))
    const run = await c.exec('timeout 180 node_modules/.bin/tsx ~/.verify-structured.mts', { retries: 1, interval: 3000 })
    expect(resultErrors(run), CHECK.flowReturnsContact).toEqual([])
  },

  'mcp-server': async (c, ws) => {
    expect(hasDep(ws, '@genkit-ai/mcp'), CHECK.usesMcp).toBe(true)
    expect(['genkitx-mcp'].filter((n) => hasDep(ws, n) || importsPkg(ws, n)), CHECK.noLegacyMcp).toEqual([])
    await c.writeFile('~/.verify-mcp/package.json', '{"name":"verify-mcp","private":true,"type":"module"}\n')
    await c.writeFile('~/.verify-mcp/verify.mts', verifyScript('verify-mcp.mts'))
    const install = await c.exec('npm --prefix ~/.verify-mcp install --no-audit --no-fund @modelcontextprotocol/sdk@1.32.2', { retries: 1 })
    if (install.exitCode !== 0) throw new Error(`could not install the MCP client: ${install.stderr.slice(-400)}`)
    const run = await c.exec('timeout 120 node_modules/.bin/tsx ~/.verify-mcp/verify.mts')
    expect(resultErrors(run), CHECK.serverListsTool).toEqual([])
  },

  'anthropic-plugin': async (c, ws) => {
    expect(hasDep(ws, '@genkit-ai/anthropic'), CHECK.usesAnthropic).toBe(true)
    expect(importsPkg(ws, '@anthropic-ai/sdk'), CHECK.noAnthropicSdk).toBe(false)
    expect(/\bplugins\s*:\s*\[[^\]]*\banthropic\s*\(/.test(ws.code), CHECK.registersAnthropic).toBe(true)
    await typecheck(c)
  },

  'fallback-middleware': async (c, ws) => {
    const wired = hasDep(ws, '@genkit-ai/middleware') && importsPkg(ws, '@genkit-ai/middleware') && /\buse\s*:\s*\[[^\]]*\bfallback\s*\(/.test(ws.code)
    expect(wired, CHECK.usesFallback).toBe(true)
    expect(/\bcatch\b/.test(ws.code), CHECK.noTryCatch).toBe(false)
    await typecheck(c)
    expect(await startErrors(c), CHECK.startPrints).toEqual([])
  },
}

/** Runs the deterministic checks of the probe `name` against the agent's project, and records what the turn did on the web and which stale identifiers the project holds. */
export async function runChecks(c: AttemptContext, name: string): Promise<void> {
  const run = RUNNERS[name]
  if (!run) throw new Error(`no runner for docs probe ${name}`)
  const ws = await readWorkspace(c)
  observeWeb(c)
  c.observe('stale', staleIdentifiers(ws))
  c.observe('dependencies', ws.deps)
  await run(c, ws)
}
