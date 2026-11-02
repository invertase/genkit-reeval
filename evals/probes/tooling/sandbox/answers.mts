// Run as `ANSWER=<answer.json> tsx ~/.verify-answers.mts` in the workspace; prints one `PROBE_RESULT {"answers":[...]}` line, a list of problems.
// `answers`: both replies carry the order facts.
import { readFileSync } from 'node:fs'

const compact = (s: string) => s.replace(/\s+/g, '')

const answers: string[] = []
let turn1 = ''
let turn2 = ''
try {
  const parsed = JSON.parse(readFileSync(process.env.ANSWER ?? '', 'utf8'))
  turn1 = String(parsed.turn1 ?? '')
  turn2 = String(parsed.turn2 ?? '')
} catch (error) {
  answers.push(`answer.json is not readable JSON: ${error instanceof Error ? error.message : String(error)}`)
}
if (answers.length === 0) {
  if (!/shipped|2026-10-22|NW-7F3K2Q/i.test(compact(turn1))) answers.push(`turn1 has no fact of order A-1001: ${JSON.stringify(turn1)}`)
  if (!compact(turn2).includes('NW-7F3K2Q')) answers.push(`turn2 has no tracking code NW-7F3K2Q: ${JSON.stringify(turn2)}`)
}
console.log('PROBE_RESULT ' + JSON.stringify({ answers }))
