import type { AttemptContext } from 'reeval'
import { type Call, callsOf, genkitCli, observeGenkitCommands, observeWeb } from '../transcript.ts'
import { rejectedOptions, type StubRun } from './gates.ts'

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

const MCP_ADD = /\bclaude\s+mcp\s+add\b/

/** Records how the agent registered the server: `claude mcp add` runs, their exact argv (rejected ones marked), the options `claude` rejected, whether it wrote `.mcp.json` by hand, and the tool calls before the first `claude mcp add`. */
export function observeClaudeSetup(c: AttemptContext, runs: StubRun[], wroteMcpJson: boolean): void {
  const adds = runs.filter((run) => run.argv[0] === 'mcp' && run.argv[1] === 'add')
  const first = callsOf(c).findIndex((call) => MCP_ADD.test(call.command))
  c.observe('ran-claude-mcp-add', first >= 0)
  c.observe('claude-mcp-add-runs', adds.length)
  c.observe('claude-mcp-add-argv', adds.slice(0, 6).map((run) => `${run.exit === 0 ? '' : 'REJECTED '}${clip(run.argv.join(' '), 160)}`))
  c.observe('claude-rejected-options', [...new Set(adds.flatMap(rejectedOptions))])
  c.observe('hit-cwd-error', adds.some((run) => rejectedOptions(run).includes('--cwd')))
  c.observe('wrote-mcp-json-by-hand', wroteMcpJson && !adds.some((run) => run.exit === 0))
  c.observe('tool-calls-before-first-add', first < 0 ? null : first)
}
