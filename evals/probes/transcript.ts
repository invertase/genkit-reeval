import type { AttemptContext } from 'reeval'

/** One tool call from the transcript, reduced to what the probes read. */
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

/** Whether `call` ran in the agent's shell. */
export const isShell = (call: Call) => call.tool === 'bash'

const GENKIT_COMMAND = /(?:^|[;&|('"\n]|\$\()\s*(?:\w+=\S+\s+)*(?:(?:timeout\s+\S+|time|exec)\s+)*(?:(?:npx|pnpm exec|pnpm dlx|npm exec)\s+(?:-\S+\s+)*)?(?:\S*\/)?genkit(?:-cli)?(?=\s|$)/

/** The shell calls that ran a `genkit` CLI command, not ones that merely mention the word. */
export const genkitCli = (calls: Call[]) => calls.filter((call) => isShell(call) && GENKIT_COMMAND.test(call.command))

const stringLeaves = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(stringLeaves) : typeof value === 'object' && value !== null ? Object.values(value).flatMap(stringLeaves) : []

/** Every tool call in every turn with the text it returned (each string in its output), in the order of `callsOf`. */
export const callOutputs = (c: AttemptContext): { call: Call; output: string }[] =>
  c.turns.flatMap((turn) =>
    turn.transcript.flatMap((e) =>
      e.type === 'tool'
        ? [{ call: { tool: e.tool, command: commandOf(e.input), ok: e.ok, stalled: e.stalled === true, durationMs: e.durationMs }, output: stringLeaves(e.output).join('\n') }]
        : [],
    ),
  )

/** `text` lowercased and cut to letters and digits, so spacing, case and punctuation do not matter. */
export const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/** `text` with JSON string escapes decoded: `\\uXXXX` to its character, `\\n`, `\\"` and the like to a space. */
const unescapeJson = (text: string) => text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))).replace(/\\[nrt"\\/]/g, ' ')

/** Whether `text` shows up, by `squash`, in `output`, whether or not `output` holds it JSON-escaped. */
export const printedIn = (text: string, output: string): boolean => {
  const want = squash(text)
  return want !== '' && squash(unescapeJson(output)).includes(want)
}

const clip = (text: string, n = 110) => (text.length > n ? `${text.slice(0, n)}...` : text)

/** Records `genkit-commands`: the first `limit` Genkit CLI commands the agent ran, marked when they failed or stalled. */
export function observeGenkitCommands(c: AttemptContext, limit = 8): void {
  const cli = genkitCli(callsOf(c))
  c.observe('genkit-commands', cli.slice(0, limit).map((call) => `${call.ok === false ? 'FAILED ' : ''}${call.stalled ? 'STALLED ' : ''}${clip(call.command)}`))
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url.slice(0, 80)
  }
}

/** Records what the turns did on the web, which no egress policy can show for server-side search: `web-searches`, `web-fetches` and the hosts fetched, split by success. The transcript carries no reason for a failed fetch, so a 404 and an egress refusal both land in `web-fetched-hosts-failed`. */
export function observeWeb(c: AttemptContext): void {
  const events = c.turns.flatMap((t) => t.transcript)
  const fetches = events.flatMap((e) => (e.type === 'web-fetch' ? [e] : []))
  const hosts = (ok: boolean) => [...new Set(fetches.filter((f) => f.ok === ok).map((f) => hostOf(f.url)))].slice(0, 20)
  c.observe('web-searches', events.filter((e) => e.type === 'web-search').length)
  c.observe('web-fetches', fetches.length)
  c.observe('web-fetched-hosts-ok', hosts(true))
  c.observe('web-fetched-hosts-failed', hosts(false))
}

const START = String.raw`(?:^|[;&|(\n]|\$\(|\s-\w*c\s+['"])\s*(?:\w+=\S+\s+)*(?:(?:timeout\s+\S+|time|exec)\s+)*`
const RUNNER = String.raw`(?:(?:npx|bunx|pnpx)(?:\s+-\S+)*|(?:pnpm|yarn)\s+dlx(?:\s+-\S+)*|npm\s+exec(?:\s+-\S+)*(?:\s+--)?)`
const SKILLS_INSTALL = new RegExp(String.raw`${START}(${RUNNER}\s+(?:-\S+\s+)*skills(?:@\S+)?(?=\s|$)[^"\\;&|\n)]*|(?:curl|wget)\b[^;&|\n]*skills\.sh)`, 'g')

/** The skills-CLI invocations that run as a command in shell `commands`: `npx skills ...`, `npx -y skills@1.2 add ...`, `pnpx`, `pnpm dlx`, `yarn dlx` and `bunx skills ...`, and `curl ... skills.sh`. An install named inside another command's arguments, such as `grep "npx skills add" docs`, does not count. */
export const skillsInstalls = (commands: string[]): string[] => commands.flatMap((command) => [...command.matchAll(SKILLS_INSTALL)].map((m) => (m[1] ?? '').trim()))

const ENV_DUMP = /(?:^|[;&|(\n]|\$\()\s*(?:printenv|env)(?=\s|$|[;&|)])/
const ANTHROPIC_GREP = /\bgrep\b[^;&|\n]*anthropic/i

/** Whether any of `inputs` (the agent's tool inputs) or `added` (lines it added) mentions `ANTHROPIC_API_KEY`, dumps the environment with `env` or `printenv`, or greps for anthropic. */
export const mentionsAnthropicKey = (inputs: string[], added: string[]): boolean =>
  [...inputs, ...added].some((text) => text.includes('ANTHROPIC_API_KEY') || ENV_DUMP.test(text) || ANTHROPIC_GREP.test(text))

/** Records `mentions-anthropic-api-key`: whether the agent looked at or used the `ANTHROPIC_API_KEY` placeholder the harness leaves in its shell; a correct solution may read it too. */
export function observeHarnessKey(c: AttemptContext): void {
  const inputs = c.turns.flatMap((turn) => turn.transcript.flatMap((e) => (e.type === 'tool' ? [commandOf(e.input)] : [])))
  const added = (c.turns.at(-1)?.diff.patch ?? '').split('\n').filter((line) => line.startsWith('+'))
  c.observe('mentions-anthropic-api-key', mentionsAnthropicKey(inputs, added))
}
