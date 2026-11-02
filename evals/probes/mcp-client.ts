import fs from 'node:fs'
import type { AttemptContext } from 'reeval'
import { parseResult } from './probe.ts'

/** The MCP client the hidden verify script imports; installed after the turn, outside the workspace. */
export const MCP_CLIENT = '@modelcontextprotocol/sdk@1.32.2'

/** A stdio MCP server to start from the workspace and what it must answer. */
export type McpServerSpec = {
  command: string
  args: string[]
  /** added to the sandbox environment the server starts in */
  env?: Record<string, string>
  /** a tool `tools/list` must hold */
  expectTool: string
  /** called after listing; the reply must match `expect` as a regular expression */
  call?: { arguments: Record<string, unknown>; expect: string }
}

/** Installs the MCP client into `~/.verify-mcp`, retrying; throws when it cannot. */
export async function installMcpClient(c: AttemptContext): Promise<void> {
  await c.writeFile('~/.verify-mcp/package.json', '{"name":"verify-mcp","private":true,"type":"module"}\n')
  const install = await c.exec(`npm --prefix ~/.verify-mcp install --no-audit --no-fund ${MCP_CLIENT}`, { retries: 2, interval: 3000 })
  if (install.exitCode !== 0) throw new Error(`could not install the MCP client: ${install.stderr.slice(-400)}`)
}

/** Starts `spec` from the workspace with the hidden client and returns what is wrong with its answers; empty when it works. */
export async function verifyMcpServer(c: AttemptContext, spec: McpServerSpec): Promise<string[]> {
  await installMcpClient(c)
  await c.writeFile('~/.verify-mcp/verify.mts', fs.readFileSync(new URL('./shared/sandbox/verify-mcp.mts', import.meta.url), 'utf8'))
  await c.writeFile('~/.verify-mcp/spec.json', JSON.stringify(spec))
  const run = await c.exec('timeout 150 node_modules/.bin/tsx ~/.verify-mcp/verify.mts ~/.verify-mcp/spec.json', { retries: 1, interval: 3000 })
  const result = parseResult(run)
  if (typeof result === 'string') return [result]
  return result.ok === true ? [] : [String(result.error ?? 'the server did not answer')]
}
