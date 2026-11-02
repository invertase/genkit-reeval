// Placed in the sandbox after the agent's turn and run from the workspace as `tsx ~/.verify-structured.mts`.
// Prints one `PROBE_RESULT <json>` line; exits 1 on a transport or provider error so `retries` reruns it, 0 otherwise.
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MESSAGES = [
  { text: 'Hello, this is Ada Lovelace. Please reply to ada@example.com about the engine.', name: 'ada lovelace', email: 'ada@example.com' },
  { text: 'Grace Hopper here, grace.hopper@navy.example is the best address for me.', name: 'grace hopper', email: 'grace.hopper@navy.example' },
]

const TRANSIENT = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|\b(?:429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded/i

const result: { ok: boolean; error?: string; outputs?: unknown[]; transient?: boolean } = { ok: false }
try {
  const flows = (await import(pathToFileURL(path.resolve(process.cwd(), 'src/flows.ts')).href)) as Record<string, unknown>
  const extract = flows.extractContact
  if (typeof extract !== 'function') throw new Error('src/flows.ts does not export a function named extractContact')
  const outputs: unknown[] = []
  for (const message of MESSAGES) {
    const output: unknown = await extract(message.text)
    outputs.push(output)
    if (typeof output !== 'object' || output === null || Array.isArray(output)) throw new Error(`flow returned ${JSON.stringify(output)}, not an object`)
    const { name, email } = output as Record<string, unknown>
    if (typeof name !== 'string' || typeof email !== 'string') throw new Error(`name and email must be strings: ${JSON.stringify(output)}`)
    if (name.trim().toLowerCase() !== message.name) throw new Error(`name is ${JSON.stringify(name)}, want ${message.name}`)
    if (email.trim().toLowerCase() !== message.email) throw new Error(`email is ${JSON.stringify(email)}, want ${message.email}`)
  }
  result.ok = true
  result.outputs = outputs
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  result.transient = TRANSIENT.test(`${result.error} ${error instanceof Error ? String(error.cause ?? '') : ''}`)
}
console.log(`PROBE_RESULT ${JSON.stringify(result)}`)
process.exit(result.transient ? 1 : 0)
