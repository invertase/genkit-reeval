import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ProbeResult, parseResult } from '../probe.ts'

/** The hidden script that reports the agents modules the workspace's Python source imports. */
export const IMPORTS_SCRIPT = new URL('./sandbox/hidden/py-imports.py', import.meta.url)

/** Why the script's report fails the check that the agents API comes from `genkit.exp`; empty when it passes. */
export function agentsImportErrors(report: ProbeResult | string): string[] {
  if (typeof report === 'string') return [report]
  const list = (key: string) => (Array.isArray(report[key]) ? report[key].map(String) : [])
  const [legacy, exp] = [list('legacy'), list('exp')]
  if (legacy.length > 0) return [`imports genkit.agent, which Genkit 0.12.0 removed: ${legacy.join(', ')}`]
  return exp.length > 0 ? [] : ['no Python file imports the agents API from genkit.exp']
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases: [string, Record<string, string>, boolean][] = [
    ['from genkit.exp import', { 'app.py': 'from genkit.exp import Genkit\n' }, true],
    ['import genkit.exp as', { 'app.py': 'import genkit.exp as g\n' }, true],
    ['from genkit import exp', { 'app.py': 'from genkit import exp\n' }, true],
    ['multi-line from genkit.exp', { 'app.py': 'from genkit.exp import (\n    Genkit,\n    InMemorySessionStore,\n)\n' }, true],
    ['import inside a function', { 'app.py': 'def make():\n    from genkit.exp import Genkit\n    return Genkit\n' }, true],
    ['exp in a subpackage', { 'pkg/agent.py': 'from genkit.exp.session import FileSessionStore\n' }, true],
    ['from genkit.agent import', { 'app.py': 'from genkit.agent import define_agent\n' }, false],
    ['import genkit.agent', { 'app.py': 'import genkit.agent\n' }, false],
    ['from genkit import agent', { 'app.py': 'from genkit import agent\n' }, false],
    ['both imports', { 'app.py': 'from genkit.exp import Genkit\nfrom genkit.agent import define_agent\n' }, false],
    ['legacy import in a second file', { 'app.py': 'from genkit.exp import Genkit\n', 'agents.py': 'from genkit.agent import define_agent\n' }, false],
    ['only the stable API', { 'app.py': 'from genkit import Genkit\n' }, false],
    ['exp only in a comment', { 'app.py': '# from genkit.exp import Genkit\nfrom genkit import Genkit\n' }, false],
    ['exp only in a string', { 'app.py': 'text = "from genkit.exp import Genkit"\n' }, false],
    ['legacy only in a comment', { 'app.py': 'from genkit.exp import Genkit\n# from genkit.agent import define_agent\n' }, true],
    ['legacy only in a docstring', { 'app.py': '"""Was: from genkit.agent import define_agent"""\nfrom genkit.exp import Genkit\n' }, true],
    ['genkit.agents is another module', { 'app.py': 'from genkit.exp import Genkit\nfrom genkit.agents_util import x\n' }, true],
    ['legacy import in .venv is not the agent code', { 'app.py': 'from genkit.exp import Genkit\n', '.venv/lib/x.py': 'from genkit.agent import y\n' }, true],
    ['relative import is not genkit', { 'app.py': 'from genkit.exp import Genkit\nfrom .agent import y\n' }, true],
  ]
  const errors: string[] = []
  for (const [label, files, pass] of cases) {
    const dir = mkdtempSync(path.join(tmpdir(), 'py-imports-'))
    try {
      for (const [file, text] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
        writeFileSync(path.join(dir, file), text)
      }
      const stdout = execFileSync('python3', ['-I', fileURLToPath(IMPORTS_SCRIPT), dir], { encoding: 'utf8' })
      const got = agentsImportErrors(parseResult({ exitCode: 0, stdout, stderr: '' })).length === 0
      if (got !== pass) errors.push(`${label}: passes is ${got}, should be ${pass}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  if (!readFileSync(IMPORTS_SCRIPT, 'utf8').includes('PROBE_RESULT')) errors.push('script prints no result')
  for (const e of errors) console.error(e)
  console.log(errors.length === 0 ? `imports ok: ${cases.length} cases` : `imports: ${errors.length} mismatches`)
  process.exit(errors.length === 0 ? 0 : 1)
}
