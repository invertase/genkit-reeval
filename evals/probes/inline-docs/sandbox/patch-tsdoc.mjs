// Usage: node patch-tsdoc.mjs <package dir> <agents doc file> <options doc file>
// Replaces the doc comment on `agents` and sets the one on `AgentsOptions` in every declaration file under <package dir>/lib
// that declares `agents`; exits 1, writing nothing, unless every such file changes in doc comments only.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DECLARATION = /\.d\.[cm]?ts$/
const AGENTS = 'declare const agents: '
const OPTIONS = 'type AgentsOptions = '
const DOC_COMMENT = /\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n/g

/** `text` without its `/** *\/` comments, each with the newline after it. */
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

/** `text` with `doc` as the doc comment right above the line that starts with `needle`, replacing any it has. */
const documented = (text, needle, doc, file) => {
  const at = onlyOnce(text, needle, file)
  const before = text.slice(0, at)
  const start = before.endsWith('*/\n') ? before.lastIndexOf('/**') : at
  return text.slice(0, start) + doc + text.slice(at)
}

/** The patched text of a declaration file. */
const patch = (text, agentsDoc, optionsDoc, file) => documented(documented(text, AGENTS, agentsDoc, file), OPTIONS, optionsDoc, file)

const declarations = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const at = path.join(dir, e.name)
    return e.isDirectory() ? declarations(at) : DECLARATION.test(e.name) ? [at] : []
  })

const [pkg, agentsFile, optionsFile] = process.argv.slice(2)
if (!pkg || !agentsFile || !optionsFile) {
  console.error('usage: node patch-tsdoc.mjs <package dir> <agents doc file> <options doc file>')
  process.exit(2)
}
try {
  const agentsDoc = readDoc(agentsFile)
  const optionsDoc = readDoc(optionsFile)
  const targets = declarations(path.join(pkg, 'lib')).filter((file) => readFileSync(file, 'utf8').includes(`\n${AGENTS}`))
  if (targets.length === 0) throw new Error(`no declaration of agents under ${pkg}/lib`)
  const patched = targets.map((file) => {
    const text = readFileSync(file, 'utf8')
    const next = patch(text, agentsDoc, optionsDoc, file)
    if (withoutDocComments(next) !== withoutDocComments(text)) throw new Error(`${file}: the patch changes more than doc comments`)
    if (next === text) throw new Error(`${file}: the patch changes nothing`)
    return [file, next]
  })
  for (const [file, next] of patched) writeFileSync(file, next)
  console.log(`patched ${patched.map(([file]) => path.relative(pkg, file)).join(', ')}`)
} catch (e) {
  console.error(`patch-tsdoc: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
