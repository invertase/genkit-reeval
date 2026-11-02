// Run from the workspace as `tsx ~/.verify-mcp/verify.mts`, beside the MCP client the environment setup installed in `~/.verify-mcp`.
// Prints one `RESULT <json>` line; exits 1 on a transport or provider error so `retries` reruns it, 0 otherwise.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const TRANSIENT = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|\b(?:429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded/i

const result: { ok: boolean; listed?: boolean; called?: boolean; tools?: string[]; error?: string; transient?: boolean } = { ok: false }
const finish = (code: number): never => {
  console.log(`RESULT ${JSON.stringify(result)}`)
  process.exit(code)
}
const transport = new StdioClientTransport({
  command: 'npm',
  args: ['run', '--silent', 'mcp'],
  cwd: process.cwd(),
  env: Object.fromEntries(Object.entries(process.env).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]]))),
  stderr: 'pipe',
})
const client = new Client({ name: 'verify', version: '1.0.0' })
setTimeout(() => {
  result.error = 'timed out waiting for the server'
  finish(0)
}, 60_000)
try {
  await client.connect(transport)
  const { tools } = await client.listTools()
  result.tools = tools.map((t) => t.name)
  result.listed = result.tools.includes('add')
  if (result.listed) {
    const reply = await client.callTool({ name: 'add', arguments: { a: 2, b: 3 } })
    result.called = /\b5\b/.test(JSON.stringify(reply.content ?? reply))
  }
  result.ok = result.listed === true && result.called === true
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  result.transient = TRANSIENT.test(result.error)
}
await client.close().catch(() => undefined)
finish(result.transient ? 1 : 0)
