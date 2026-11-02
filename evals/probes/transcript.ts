import { fileURLToPath } from 'node:url'
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

/** Records what the turns did on the web, which no egress policy can show for server-side search: `web-searches`, `web-fetches` and the hosts fetched, split by success. */
export function observeWeb(c: AttemptContext): void {
  const events = c.turns.flatMap((t) => t.transcript)
  const fetches = events.flatMap((e) => (e.type === 'web-fetch' ? [e] : []))
  const hosts = (ok: boolean) => [...new Set(fetches.filter((f) => f.ok === ok).map((f) => hostOf(f.url)))].slice(0, 20)
  c.observe('web-searches', events.filter((e) => e.type === 'web-search').length)
  c.observe('web-fetches', fetches.length)
  c.observe('web-fetched-hosts-ok', hosts(true))
  c.observe('web-fetched-hosts-refused', hosts(false))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases: [string, boolean][] = [
    ['genkit flow:run greet {}', true],
    ["bash -lc 'genkit flow:run greet {}'", true],
    ['bash -lc "genkit flow:run greet {}"', true],
    ['cd app && genkit start -- npm run dev', true],
    ['FOO=1 timeout 60 genkit eval:flow x', true],
    ['npx genkit docs:search streaming', true],
    ['pnpm exec genkit mcp', true],
    ['node_modules/.bin/genkit start', true],
    ['echo genkit is great', false],
    ['cat genkit.config.ts', false],
    ['npm install genkit', false],
    ['grep -r genkit src', false],
  ]
  const errors = cases
    .filter(([command, want]) => (genkitCli([{ tool: 'bash', command, ok: true, stalled: false, durationMs: 0 }]).length === 1) !== want)
    .map(([command, want]) => `genkitCli counts ${JSON.stringify(command)}: should be ${want}`)
  if (genkitCli([{ tool: 'read', command: 'genkit start', ok: true, stalled: false, durationMs: 0 }]).length !== 0) errors.push('genkitCli counts a non-shell call')
  for (const e of errors) console.error(e)
  console.log(errors.length === 0 ? `transcript ok: ${cases.length + 1} cases` : `transcript: ${errors.length} mismatches`)
  process.exit(errors.length === 0 ? 0 : 1)
}
