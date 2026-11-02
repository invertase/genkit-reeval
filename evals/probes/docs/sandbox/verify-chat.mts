// Placed in the sandbox after the agent's turn and run from the workspace as `tsx ~/.verify-chat.mts <session id or "-"> <message>`.
// One turn in this process: the eval runs it twice, so the second turn can only know the first through what the agent persisted.
// Prints one `PROBE_RESULT <json>` line; exits 1 on a transport or provider error so `retries` reruns it, 0 otherwise.
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TRANSIENT = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|\b(?:429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded/i

const [session, message] = process.argv.slice(2)
const result: { ok: boolean; error?: string; reply?: string; sessionId?: string; transient?: boolean } = { ok: false }
try {
  const loaded = import(pathToFileURL(path.resolve(process.cwd(), 'src/index.ts')).href)
  const never = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('import of src/index.ts did not return within 30s')), 30_000))
  const app = (await Promise.race([loaded, never])) as Record<string, unknown>
  if (typeof app.turn !== 'function') throw new Error('src/index.ts does not export a function named turn')
  const out: unknown = await app.turn(session === '-' ? undefined : session, message)
  if (typeof out !== 'object' || out === null) throw new Error(`turn returned ${JSON.stringify(out)}, not an object`)
  const { reply, sessionId } = out as Record<string, unknown>
  if (typeof reply !== 'string' || typeof sessionId !== 'string' || sessionId === '') throw new Error(`turn must return a reply and a non-empty sessionId: ${JSON.stringify(out)}`)
  result.ok = true
  result.reply = reply
  result.sessionId = sessionId
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  result.transient = TRANSIENT.test(`${result.error} ${error instanceof Error ? String(error.cause ?? '') : ''}`)
}
console.log(`PROBE_RESULT ${JSON.stringify(result)}`)
process.exit(result.transient ? 1 : 0)
