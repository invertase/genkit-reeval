import type { AttemptContext } from 'reeval'
import { type Call, callsOf, genkitCli, isShell, observeGenkitCommands, observeHarnessKey, observeWeb } from '../transcript.ts'
import { mcpAddInvocations, rejectedOptions } from './gates.ts'

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
  observeHarnessKey(c)
  c.observe('stalled', calls.filter((call) => call.stalled).map((call) => clip(`${call.tool}: ${call.command}`)).slice(0, 5))
}

const outputText = (output: unknown): string => (typeof output === 'string' ? output : (JSON.stringify(output) ?? ''))

/** Records how the agent registered the server, all from the transcript: the `claude mcp add` commands it ran (failed ones marked), the options they were told were unknown, whether a file-write tool wrote `.mcp.json`, and the tool calls before the first add. */
export function observeClaudeSetup(c: AttemptContext): void {
  const events = c.turns.flatMap((turn) => turn.transcript)
  const outputs = events.flatMap((e) => (e.type === 'tool' ? [outputText(e.output)] : []))
  const calls = callsOf(c)
  const adds = calls.flatMap((call, i) =>
    isShell(call) ? mcpAddInvocations(call.command).map((argv) => ({ argv, ok: call.ok, output: outputs[i] ?? '' })) : [],
  )
  const first = calls.findIndex((call) => isShell(call) && mcpAddInvocations(call.command).length > 0)
  const rejected = adds.flatMap((add) => rejectedOptions(add.output))
  c.observe('ran-claude-mcp-add', adds.length > 0)
  c.observe('claude-mcp-add-argv', adds.slice(0, 6).map((add) => `${add.ok === false ? 'FAILED ' : ''}${clip(add.argv, 160)}`))
  c.observe('claude-rejected-options', [...new Set(rejected)])
  c.observe('hit-cwd-error', rejected.includes('--cwd'))
  c.observe('wrote-mcp-json-by-hand', events.some((e) => e.type === 'file-edit' && /(^|\/)\.mcp\.json$/.test(e.path)))
  c.observe('tool-calls-before-first-add', first < 0 ? null : first)
}
