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
  const installs: [string, string, number][] = [
    ['npx skills add', 'npx skills add genkit-ai/skills', 1],
    ['npx -y skills add', 'npx -y skills add genkit-ai/skills -y', 1],
    ['npx skills@latest add', 'npx skills@latest add genkit-ai/skills', 1],
    ['npx --yes skills@1.4.0', 'npx --yes skills@1.4.0 add genkit-ai/skills', 1],
    ['pnpm dlx skills', 'pnpm dlx skills add genkit-ai/skills', 1],
    ['pnpx skills', 'pnpx skills add genkit-ai/skills', 1],
    ['yarn dlx skills', 'yarn dlx skills add genkit-ai/skills', 1],
    ['env prefix', 'CI=1 npx skills add genkit-ai/skills', 1],
    ['chained pnpx', 'cd app && pnpx skills add x', 1],
    ['grep for the install', 'grep -r "npx skills add" docs', 0],
    ['echo of the install', 'echo "run npx skills add x"', 0],
    ['cat of a doc about it', 'cat README.md | grep "pnpm dlx skills"', 0],
    ['bunx skills', 'bunx skills add genkit-ai/skills', 1],
    ['chained', 'cd app && npx -y skills add x --yes; ls', 1],
    ['quoted in bash -lc', "bash -lc 'npx -y skills add x'", 1],
    ['skills.sh', 'curl https://skills.sh | sh', 1],
    ['skills.sh as an argument', 'grep skills.sh notes.md', 0],
    ['skills in a path', 'cat .claude/skills/x/SKILL.md', 0],
    ['npx of another package', 'npx -y create-skills-app', 0],
    ['echo mentions skills', 'echo use npm skills later', 0],
  ]
  for (const [name, command, want] of installs) {
    if (skillsInstalls([command]).length !== want) errors.push(`skillsInstalls on ${name}: should find ${want}, found ${JSON.stringify(skillsInstalls([command]))}`)
  }
  const output = String.raw`{"turn1":"Order A-1001 is shipped.\nETA 2026-10-22 — it’s on the way","turn2":"Code: NW-7F3K2Q"}`
  const printed: [string, string, boolean][] = [
    ['reply with an escaped newline', 'Order A-1001 is shipped.\nETA 2026-10-22', true],
    ['reply with different spacing and case', 'order a-1001 IS shipped. eta 2026-10-22', true],
    ['reply with unicode escapes in the output', 'Order A-1001 is shipped.\nETA 2026-10-22 — it’s on the way', true],
    ['reply never printed', 'The tracking code is NW-7F3K2Q and more', false],
    ['empty reply', '', false],
  ]
  for (const [name, text, want] of printed) if (printedIn(text, output) !== want) errors.push(`printedIn ${name}: should be ${want}`)
  const mentions: [string, string[], string[], boolean][] = [
    ['reads the variable', ['console.log(process.env.ANTHROPIC_API_KEY)'], [], true],
    ['added line', [], ['+  apiKey: process.env.ANTHROPIC_API_KEY'], true],
    ['env dump', ['env | grep -i gemini'], [], true],
    ['printenv', ['printenv'], [], true],
    ['env in a chain', ['cd app && env'], [], true],
    ['grep for anthropic', ['npm ls | grep -i anthropic'], [], true],
    ['plain ls', ['ls -la'], [], false],
    ['environment word', ['cat environment.ts'], [], false],
    ['no mention', ['npm install genkit'], ['+import { genkit } from "genkit"'], false],
  ]
  for (const [name, inputs, added, want] of mentions) if (mentionsAnthropicKey(inputs, added) !== want) errors.push(`mentionsAnthropicKey ${name}: should be ${want}`)
  if (genkitCli([{ tool: 'read', command: 'genkit start', ok: true, stalled: false, durationMs: 0 }]).length !== 0) errors.push('genkitCli counts a non-shell call')
  for (const e of errors) console.error(e)
  console.log(errors.length === 0 ? `transcript ok: ${cases.length + 1 + installs.length + printed.length + mentions.length} cases` : `transcript: ${errors.length} mismatches`)
  process.exit(errors.length === 0 ? 0 : 1)
}
