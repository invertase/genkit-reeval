// Placed in `~/.verify-mcp` beside an install of @modelcontextprotocol/sdk and run from the workspace as `tsx ~/.verify-mcp/verify.mts`; prints one `RESULT <json>` line.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const result: { ok: boolean; listed?: boolean; called?: boolean; tools?: string[]; error?: string } = { ok: false }
const transport = new StdioClientTransport({
  command: 'npm',
  args: ['run', '--silent', 'mcp'],
  cwd: process.cwd(),
  env: Object.fromEntries(Object.entries(process.env).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]]))),
  stderr: 'pipe',
})
const client = new Client({ name: 'verify', version: '1.0.0' })
const deadline = setTimeout(() => {
  console.log(`RESULT ${JSON.stringify({ ...result, error: 'timed out waiting for the server' })}`)
  process.exit(0)
}, 60_000)
try {
  await client.connect(transport)
  const { tools } = await client.listTools()
  result.tools = tools.map((t) => t.name)
  result.listed = result.tools.includes('add')
  if (result.listed) {
    const reply = await client.callTool({ name: 'add', arguments: { a: 2, b: 3 } })
    const text = JSON.stringify(reply.content ?? reply)
    result.called = /\b5\b/.test(text)
  }
  result.ok = result.listed === true && result.called === true
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
}
clearTimeout(deadline)
console.log(`RESULT ${JSON.stringify(result)}`)
await client.close().catch(() => undefined)
process.exit(0)
