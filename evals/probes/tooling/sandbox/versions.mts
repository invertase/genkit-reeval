// Run as `tsx ~/.verify-versions.mts` in the workspace; prints one JSON line `{ one, tree }`, each a list of problems.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const MIN_GENKIT = '1.43.0'
const MIN_MIDDLEWARE = '0.11.0'

const parse = (v: string) => v.replace(/^[^\d]*/, '').split('-')[0]!.split('.').map(Number)
const atLeast = (v: string, min: string) => {
  const [a, b] = [parse(v), parse(min)]
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return true
}
const installed = (name: string): string | undefined => {
  try {
    return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version
  } catch {
    return undefined
  }
}

const one: string[] = []
const genkit = installed('genkit')
const googleAI = installed('@genkit-ai/google-genai')
const middleware = installed('@genkit-ai/middleware')
if (!genkit) one.push('genkit is not installed')
else if (!atLeast(genkit, MIN_GENKIT)) one.push(`genkit ${genkit} is older than ${MIN_GENKIT}`)
if (googleAI !== genkit) one.push(`@genkit-ai/google-genai is ${googleAI}, genkit is ${genkit}`)
if (!middleware) one.push('@genkit-ai/middleware is not installed')
else if (!atLeast(middleware, MIN_MIDDLEWARE)) one.push(`@genkit-ai/middleware ${middleware} is older than ${MIN_MIDDLEWARE}`)
const declared = JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? {}
for (const name of ['genkit', '@genkit-ai/google-genai', '@genkit-ai/middleware']) {
  const spec: string | undefined = declared[name]
  const have = installed(name)
  if (spec && have && parse(spec).join('.') !== have) one.push(`package.json asks for ${name}@${spec} but ${have} is installed`)
}

const tree: string[] = []
try {
  execFileSync('npm', ['ls', '--all'], { stdio: 'pipe' })
} catch (error) {
  tree.push(`npm ls failed: ${String((error as { stdout?: Buffer }).stdout ?? error).slice(0, 400)}`)
}
console.log(JSON.stringify({ one, tree }))
