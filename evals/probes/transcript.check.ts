import { genkitCli, mentionsAnthropicKey, printedIn, skillsInstalls } from './transcript.ts'

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
const output = String.raw`{"turn1":"Order A-1001 is shipped.\nETA 2026-10-22 \u2014 it\u2019s on the way","turn2":"Code: NW-7F3K2Q"}`
const printed: [string, string, boolean][] = [
  ['reply with an escaped newline', 'Order A-1001 is shipped.\nETA 2026-10-22', true],
  ['reply with different spacing and case', 'order a-1001 IS shipped. eta 2026-10-22', true],
  ['reply with unicode escapes in the output', 'Order A-1001 is shipped.\nETA 2026-10-22 \u2014 it\u2019s on the way', true],
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
