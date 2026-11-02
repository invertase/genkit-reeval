import type { AttemptContext } from 'reeval'

/** One tool call from the transcript, reduced to what the tooling probes read. */
export type Call = { tool: string; command: string; ok: boolean | null; stalled: boolean; durationMs: number | null }

const show = (value: unknown): string => (typeof value === 'string' ? value : (JSON.stringify(value) ?? ''))

const commandOf = (input: unknown): string => {
  if (typeof input === 'object' && input !== null) {
    const { command } = input as { command?: unknown }
    if (typeof command === 'string') return command
  }
  return show(input)
}

/** Every tool call in every turn so far, in order. */
export const callsOf = (c: AttemptContext): Call[] =>
  c.turns.flatMap((turn) =>
    turn.transcript.flatMap((e) =>
      e.type === 'tool' ? [{ tool: e.tool, command: commandOf(e.input), ok: e.ok, stalled: e.stalled === true, durationMs: e.durationMs }] : [],
    ),
  )

const isShell = (call: Call) => call.tool === 'bash'

const GENKIT_COMMAND = /(?:^|[;&|(\n]|\$\()\s*(?:\w+=\S+\s+)*(?:(?:timeout\s+\S+|time|exec)\s+)*(?:(?:npx|pnpm exec|pnpm dlx|npm exec)\s+(?:-\S+\s+)*)?(?:\S*\/)?genkit(?:-cli)?(?=\s|$)/

/** The calls that ran a `genkit` CLI command, not ones that merely mention the word. */
export const genkitCli = (calls: Call[]) => calls.filter((call) => isShell(call) && GENKIT_COMMAND.test(call.command))

/** The calls to the Genkit MCP server's tools, whatever the harness calls them. */
export const genkitMcp = (calls: Call[]) => calls.filter((call) => /^mcp__genkit__|^genkit[_/.]/i.test(call.tool))

const clip = (text: string, n = 110) => (text.length > n ? `${text.slice(0, n)}...` : text)

/** Records the tool use every probe reports, none of it gating: counts, the CLI and MCP calls, stalls and the agent's time. */
export function observeTooling(c: AttemptContext): void {
  const calls = callsOf(c)
  const cli = genkitCli(calls)
  const mcp = genkitMcp(calls)
  c.observe('tool_calls', calls.length)
  c.observe('agent_ms', c.turns.reduce((sum, turn) => sum + turn.durationMs, 0))
  c.observe('genkit_cli', cli.slice(0, 8).map((call) => `${call.ok === false ? 'FAILED ' : ''}${call.stalled ? 'STALLED ' : ''}${clip(call.command)}`))
  c.observe('genkit_mcp', mcp.slice(0, 12).map((call) => `${call.ok === false ? 'FAILED ' : ''}${call.tool.replace(/^mcp__genkit__/, '')}`))
  c.observe('stalled', calls.filter((call) => call.stalled).map((call) => clip(`${call.tool}: ${call.command}`)).slice(0, 5))
}
