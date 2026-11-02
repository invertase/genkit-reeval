import type { AttemptContext } from 'reeval'
import { type Call, callsOf, genkitCli, observeGenkitCommands, observeWeb } from '../transcript.ts'

/** The calls to the Genkit MCP server's tools, whatever the harness calls them. */
export const genkitMcp = (calls: Call[]) => calls.filter((call) => /^mcp__genkit__|^genkit[_/.]/i.test(call.tool))

const clip = (text: string, n = 110) => (text.length > n ? `${text.slice(0, n)}...` : text)

/** Records the tool use every probe reports, none of it gating: counts, the CLI and MCP calls, web use, stalls and the agent's time. */
export function observeTooling(c: AttemptContext): void {
  const calls = callsOf(c)
  const mcp = genkitMcp(calls)
  c.observe('tool-calls', calls.length)
  c.observe('agent-ms', c.turns.reduce((sum, turn) => sum + turn.durationMs, 0))
  observeGenkitCommands(c)
  c.observe('genkit-mcp-calls', mcp.slice(0, 12).map((call) => `${call.ok === false ? 'FAILED ' : ''}${call.tool.replace(/^mcp__genkit__/, '')}`))
  observeWeb(c)
  c.observe('stalled', calls.filter((call) => call.stalled).map((call) => clip(`${call.tool}: ${call.command}`)).slice(0, 5))
}
