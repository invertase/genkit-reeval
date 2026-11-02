// Placed in the sandbox after the agent's turn and run as `tsx ~/.verify-models.mts <model id>...`.
// Asks the Gemini API whether each model id exists (GET /v1beta/models/<id>); it never generates anything.
// Prints one `PROBE_RESULT <json>` line; exits 1 on a transport or provider error so `retries` reruns it, 0 otherwise.
const result: { ok: boolean; missing: string[]; error?: string; transient?: boolean } = { ok: false, missing: [] }
try {
  for (const id of process.argv.slice(2)) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}`, {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
    })
    if (response.status === 404) result.missing.push(id)
    else if (response.status === 429 || response.status >= 500) throw new Error(`fetch failed: ${response.status} for ${id}`)
    else if (!response.ok) throw new Error(`models.get ${id} answered ${response.status}`)
  }
  result.ok = result.missing.length === 0
  if (!result.ok) result.error = `no such model: ${result.missing.join(', ')}`
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  result.transient = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i.test(result.error)
}
console.log(`PROBE_RESULT ${JSON.stringify(result)}`)
process.exit(result.transient ? 1 : 0)
