// Run as `ANSWER=<file> FLOW=<name> [ROOT=<dir>] tsx ~/.verify-trace.mts`; prints one JSON line `{ errors }`.
// The answer must hold the id of a stored trace of FLOW and that trace's output.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const answer = readFileSync(process.env.ANSWER ?? '', 'utf8')
const flow = process.env.FLOW ?? ''
const root = path.resolve(process.env.ROOT ?? process.cwd())
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const errors: string[] = []
const ids = [...new Set(answer.match(/\b[0-9a-f]{32}\b/g) ?? [])]
if (ids.length === 0) errors.push('the answer has no trace id')
const ok = ids.some((id) => {
  const file = path.join(root, '.genkit/traces', id)
  if (!existsSync(file)) return false
  const spans: Record<string, { parentSpanId?: string; attributes?: Record<string, unknown> }> = JSON.parse(readFileSync(file, 'utf8')).spans ?? {}
  const top = Object.values(spans).find((s) => !s.parentSpanId)
  if (top?.attributes?.['genkit:name'] !== flow) return false
  let output = String(top.attributes['genkit:output'] ?? '')
  try {
    output = String(JSON.parse(output))
  } catch {}
  return squash(output).length > 0 && squash(answer).includes(squash(output))
})
if (ids.length > 0 && !ok) errors.push(`no trace id in the answer belongs to a stored ${flow} run whose output the answer also quotes`)
console.log(JSON.stringify({ errors }))
