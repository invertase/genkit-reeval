// Run as `ANSWER=<answer.json> tsx ~/.verify-session.mts` in the workspace; prints one JSON line `{ answers, session }`, each a list of problems.
// `answers`: both replies carry the order facts. `session`: one stored session holds both questions and both replies.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const Q1 = 'Where is order A-1001?'
const Q2 = 'What is its tracking code?'
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const compact = (s: string) => s.replace(/\s+/g, '')

type Snapshot = { state?: { messages?: { role: string; content: { text?: string }[] }[] } }

const walk = (dir: string): string[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name)
        if (name.startsWith('.')) return []
        return statSync(full).isDirectory() ? walk(full) : full.endsWith('.json') ? [full] : []
      })

const answers: string[] = []
const session: string[] = []
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
const snapshots = walk(path.join(process.cwd(), '.genkit/sessions')).flatMap((file) => {
  try {
    return [JSON.parse(readFileSync(file, 'utf8')) as Snapshot]
  } catch {
    return []
  }
})
const textOf = (s: Snapshot, role: string) => (s.state?.messages ?? []).filter((m) => m.role === role).map((m) => m.content.map((p) => p.text ?? '').join(''))
const found = squash(turn1) !== '' && squash(turn2) !== '' && snapshots.some((s) => {
  const users = textOf(s, 'user').map(squash)
  const models = squash(textOf(s, 'model').join(' '))
  return users.some((u) => u.includes(squash(Q1))) && users.some((u) => u.includes(squash(Q2))) && models.includes(squash(turn1)) && models.includes(squash(turn2))
})
if (!found) session.push('no stored session holds both questions and both replies')
console.log(JSON.stringify({ answers, session }))
