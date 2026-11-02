import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { control } from '../../environments.ts'
import { PROBES, TASK } from './cases.ts'

const MIDDLEWARE = 'node_modules/@genkit-ai/middleware'

/** The study's `control` arm as it is: the support-desk app with its pinned packages, no rules, skill, MCP server or docs link. */
export const stock = control.extendEnvironment('stock', {})

/**
 * `stock` with only the doc comments on `agents` and `AgentsOptions` in `@genkit-ai/middleware`'s
 * declaration files replaced by `tsdoc/agents.txt` and `tsdoc/agents-options.txt`. The setup fails the
 * attempt unless the files change in doc comments only, and removes the patch tooling before the agent starts.
 */
export const tsdoc = stock.extendEnvironment('tsdoc', ({ file }) => ({
  files: {
    '~/.agents-tsdoc/patch-tsdoc.mjs': file('./sandbox/patch-tsdoc.mjs'),
    '~/.agents-tsdoc/agents.txt': file('./tsdoc/agents.txt'),
    '~/.agents-tsdoc/agents-options.txt': file('./tsdoc/agents-options.txt'),
  },
  setup: [
    `node "$HOME/.agents-tsdoc/patch-tsdoc.mjs" ${MIDDLEWARE} "$HOME/.agents-tsdoc/agents.txt" "$HOME/.agents-tsdoc/agents-options.txt"`,
    'rm -rf "$HOME/.agents-tsdoc"',
  ],
}))

/** The words agents grep `node_modules` for when they look for delegation; the patched doc must contain each. */
export const SEARCH_WORDS = ['hand-off', 'handoff', 'delegate', 'delegation', 'sub-agent', 'subagent', 'multi-agent', 'transfer', 'route']

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
  const app = here('../../app/')
  const modules = path.join(app, 'node_modules')
  if (!existsSync(modules)) {
    console.error(`no ${modules}: run npm ci in evals/app first`)
    process.exit(1)
  }
  const errors: string[] = []
  const scratch = mkdtempSync(path.join(tmpdir(), 'agents-tsdoc-'))
  /** A copy of the app with `files` written over it; its `node_modules` links to the app's, except a patched copy of the middleware when `patched`. */
  const appWith = (files: Record<string, string>, patched: boolean): string => {
    const dir = mkdtempSync(path.join(scratch, 'app-'))
    for (const entry of ['src', 'prompts', 'tsconfig.json', 'package.json']) cpSync(path.join(app, entry), path.join(dir, entry), { recursive: true })
    for (const [file, text] of Object.entries(files)) writeFileSync(path.join(dir, file), text)
    if (!patched) {
      symlinkSync(modules, path.join(dir, 'node_modules'), 'dir')
      return dir
    }
    mkdirSync(path.join(dir, 'node_modules/@genkit-ai'), { recursive: true })
    for (const e of readdirSync(modules)) if (e !== '@genkit-ai') symlinkSync(path.join(modules, e), path.join(dir, 'node_modules', e))
    for (const e of readdirSync(path.join(modules, '@genkit-ai'))) {
      const from = path.join(modules, '@genkit-ai', e)
      const to = path.join(dir, 'node_modules/@genkit-ai', e)
      if (e === 'middleware') cpSync(from, to, { recursive: true })
      else symlinkSync(from, to)
    }
    execFileSync('node', [here('./sandbox/patch-tsdoc.mjs'), path.join(dir, MIDDLEWARE), here('./tsdoc/agents.txt'), here('./tsdoc/agents-options.txt')], { stdio: 'pipe' })
    return dir
  }
  const typecheck = (what: string, dir: string) => {
    try {
      execFileSync(path.join(modules, '.bin/tsc'), ['--noEmit', '-p', dir], { stdio: 'pipe' })
    } catch (e) {
      errors.push(`${what} does not typecheck:\n${e instanceof Error && 'stdout' in e ? String(e.stdout) : String(e)}`)
    }
  }
  try {
    const start = Object.fromEntries(Object.entries(TASK.start).flatMap(([file, text]) => (text === null ? [] : [[file, text]])))
    const dir = appWith(start, true)
    const stockLib = path.join(app, MIDDLEWARE, 'lib')
    const patchedLib = path.join(dir, MIDDLEWARE, 'lib')
    const files = readdirSync(stockLib, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(stockLib, path.join(e.parentPath, e.name)))
    const changed = files.filter((f) => readFileSync(path.join(stockLib, f), 'utf8') !== readFileSync(path.join(patchedLib, f), 'utf8'))
    if (changed.sort().join() !== 'agents.d.mts,agents.d.ts') errors.push(`the patch changed ${JSON.stringify(changed)}, not agents.d.ts and agents.d.mts`)
    for (const f of changed) {
      const text = readFileSync(path.join(patchedLib, f), 'utf8')
      for (const word of SEARCH_WORDS) if (!text.toLowerCase().includes(word)) errors.push(`${f}: a grep for ${word} misses the patched doc`)
      if (!text.includes('@see {@link https://genkit.dev/docs/js/agents/multi-agent/')) errors.push(`${f}: no @see link to the multi-agent page`)
    }
    typecheck('the start state with the patched declarations', dir)
    const [probe] = PROBES
    typecheck("the probe's oracle with the patched declarations", appWith({ ...start, ...probe?.oracle.files }, true))
    typecheck("the probe's cheat", appWith({ ...start, ...probe?.cheat.files }, false))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log('OK')
}
