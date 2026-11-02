// Run from the workspace as `tsx ~/.verify-mcp/verify.mts ~/.verify-mcp/spec.json`, beside the MCP client that `installMcpClient` put in `~/.verify-mcp`.
// Starts the server the spec names, lists its tools and optionally calls one. Prints one `PROBE_RESULT <json>` line;
// exits 1 on a transient transport or provider error so `retries` reruns it, 0 otherwise.
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const TRANSIENT = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|\b(?:429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded/i

type Spec = {
  command: string
  args: string[]
  env?: Record<string, string>
  expectTool: string
  call?: { arguments: Record<string, unknown>; expect: string }
}
const spec = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as Spec

const result: { ok: boolean; listed?: boolean; called?: boolean; tools?: string[]; error?: string; transient?: boolean } = { ok: false }
const finish = (code: number): never => {
  console.log(`PROBE_RESULT ${JSON.stringify(result)}`)
  process.exit(code)
}
let stderr = ''
const transport = new StdioClientTransport({
  command: spec.command,
  args: spec.args,
  cwd: process.cwd(),
  env: { ...Object.fromEntries(Object.entries(process.env).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]]))), ...spec.env },
  stderr: 'pipe',
})
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
  result.listed = result.tools.includes(spec.expectTool)
  if (!result.listed) result.error = `tools/list has no ${spec.expectTool}: ${result.tools.join(', ')}`
  if (result.listed && spec.call) {
    const reply = await client.callTool({ name: spec.expectTool, arguments: spec.call.arguments })
    result.called = new RegExp(spec.call.expect).test(JSON.stringify(reply.content ?? reply))
  }
  result.ok = result.listed === true && (spec.call === undefined || result.called === true)
} catch (error) {
  result.error = `${error instanceof Error ? error.message : String(error)} ${stderr.trim()}`.trim()
  result.transient = TRANSIENT.test(result.error)
}
await client.close().catch(() => undefined)
finish(result.transient ? 1 : 0)
