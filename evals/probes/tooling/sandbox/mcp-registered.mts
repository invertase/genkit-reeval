// Run from the workspace as `tsx ~/.verify-mcp/verify.mts`, beside the MCP client installed in `~/.verify-mcp`.
// Starts the Genkit server that `.mcp.json` registers, the way Claude Code would, and lists its tools.
// Prints one `PROBE_RESULT <json>` line; exits 1 on a transient transport error so `retries` reruns it, 0 otherwise.
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const TRANSIENT = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i

type Server = { command?: unknown; args?: unknown; env?: unknown }
const result: { ok: boolean; tools?: string[]; error?: string; transient?: boolean } = { ok: false }
const finish = (code: number): never => {
  console.log(`PROBE_RESULT ${JSON.stringify(result)}`)
  process.exit(code)
}

let server: Server | undefined
try {
  const doc = JSON.parse(readFileSync('.mcp.json', 'utf8')) as { mcpServers?: Record<string, Server> }
  server = Object.values(doc.mcpServers ?? {}).find(
    (s) => typeof s.command === 'string' && /(^|\/)genkit$/.test(s.command) && Array.isArray(s.args) && s.args.includes('mcp'),
  )
} catch (error) {
  result.error = `cannot read .mcp.json: ${error instanceof Error ? error.message : String(error)}`
}
if (server === undefined) {
  result.error ??= 'no registered server runs genkit mcp'
  finish(0)
}
const { command, args, env } = server as Server
const transport = new StdioClientTransport({
  command: command as string,
  args: (args as unknown[]).map(String),
  cwd: process.cwd(),
  env: {
    ...Object.fromEntries(Object.entries(process.env).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]]))),
    ...(typeof env === 'object' && env !== null ? (env as Record<string, string>) : {}),
  },
  stderr: 'pipe',
})
let stderr = ''
transport.stderr?.on('data', (chunk) => {
  stderr = (stderr + String(chunk)).slice(-400)
})
const client = new Client({ name: 'verify', version: '1.0.0' })
setTimeout(() => {
  result.error = `timed out waiting for the server: ${stderr.trim()}`
  finish(0)
}, 90_000)
try {
  await client.connect(transport)
  result.tools = (await client.listTools()).tools.map((t) => t.name)
  result.ok = result.tools.includes('list_flows')
  if (!result.ok) result.error = `tools/list has no list_flows: ${result.tools.join(', ')}`
} catch (error) {
  result.error = `${error instanceof Error ? error.message : String(error)} ${stderr.trim()}`.trim()
  result.transient = TRANSIENT.test(result.error)
}
await client.close().catch(() => undefined)
finish(result.transient ? 1 : 0)
