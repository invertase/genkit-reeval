// Usage: node patch-tsdoc.mjs <node_modules dir> <doc dir>
// Sets the doc comments below from the files in <doc dir>, in every declaration file under <node_modules dir>/<package>/lib
// that declares the symbol; exits 1, writing nothing, unless every touched file changes in doc comments only.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DECLARATION = /\.d\.[cm]?ts$/
const DOC_COMMENT = /[ \t]*\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n/g

/** The doc comments to set: the package, the declaration's line start, the indent its block takes, and the doc file. */
const RULES = [
  { pkg: '@genkit-ai/middleware', needle: 'declare const agents: ', indent: '', doc: 'agents.txt' },
  { pkg: '@genkit-ai/middleware', needle: 'type AgentsOptions = ', indent: '', doc: 'agents-options.txt' },
  { pkg: '@genkit-ai/ai', needle: 'interface AgentConfig<', indent: '', doc: 'agent-config.txt' },
  { pkg: 'genkit', needle: '    defineAgent<', indent: '    ', doc: 'define-agent.txt' },
]

/** `text` without its `/** *\/` comments, each with its indent and the newline after it. */
const withoutDocComments = (text) => text.replace(DOC_COMMENT, '')

const readDoc = (file) => {
  const doc = readFileSync(file, 'utf8').trimEnd()
  if (!/^\/\*\*\n[\s\S]*\n \*\/$/.test(doc) || doc.indexOf('*/') !== doc.length - 2) throw new Error(`${file}: not one /** */ block`)
  return `${doc}\n`
}

const onlyOnce = (text, needle, file) => {
  const at = text.indexOf(`\n${needle}`)
  if (at < 0 || text.indexOf(`\n${needle}`, at + 1) >= 0) throw new Error(`${file}: ${JSON.stringify(needle)} not found once at a line start`)
  return at + 1
}

/** `text` with `doc`, indented, as the doc comment right above the line that starts with `needle`, replacing any it has. */
const documented = (text, { needle, indent }, doc, file) => {
  const at = onlyOnce(text, needle, file)
  const before = text.slice(0, at)
  const start = before.endsWith('*/\n') ? before.lastIndexOf('\n', before.lastIndexOf('/**')) + 1 : at
  const block = doc.split('\n').map((line) => (line === '' ? line : indent + line)).join('\n')
  return text.slice(0, start) + block + text.slice(at)
}

const declarations = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const at = path.join(dir, e.name)
    return e.isDirectory() ? declarations(at) : DECLARATION.test(e.name) ? [at] : []
  })

const [modules, docDir] = process.argv.slice(2)
if (!modules || !docDir) {
  console.error('usage: node patch-tsdoc.mjs <node_modules dir> <doc dir>')
  process.exit(2)
}
try {
  /** @type {Map<string, string>} */
  const next = new Map()
  const original = new Map()
  for (const rule of RULES) {
    const doc = readDoc(path.join(docDir, rule.doc))
    const targets = declarations(path.join(modules, rule.pkg, 'lib')).filter((file) => readFileSync(file, 'utf8').includes(`\n${rule.needle}`))
    if (targets.length === 0) throw new Error(`no declaration of ${JSON.stringify(rule.needle)} under ${rule.pkg}/lib`)
    for (const file of targets) {
      const text = next.get(file) ?? readFileSync(file, 'utf8')
      if (!original.has(file)) original.set(file, text)
      next.set(file, documented(text, rule, doc, file))
    }
  }
  for (const [file, text] of next) {
    if (withoutDocComments(text) !== withoutDocComments(original.get(file))) throw new Error(`${file}: the patch changes more than doc comments`)
    if (text === original.get(file)) throw new Error(`${file}: the patch changes nothing`)
  }
  for (const [file, text] of next) writeFileSync(file, text)
  console.log(`patched ${[...next.keys()].map((file) => path.relative(modules, file)).join(', ')}`)
} catch (e) {
  console.error(`patch-tsdoc: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
