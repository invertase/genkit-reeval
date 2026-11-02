import { type AttemptContext, defineEnvironment, evaluate } from 'reeval'
import { docsArms, geminiEnv } from '../environments.ts'
import { gate, noProviderErrors, placeSolutions, type Probe } from '../probe.ts'
import { runChecks } from './checks.ts'
import { PROBES, SEEDED } from './cases.ts'

/** An empty Node and TypeScript project with the Genkit CLI on PATH; the agent installs every Genkit package itself. */
const empty = defineEnvironment('js-empty', ({ directory, secret }) => ({
  files: directory('../fixtures/js-empty'),
  env: geminiEnv({ secret }),
  setup: [
    'npm install --no-audit --no-fund',
    'genkit --non-interactive config set analyticsOptOut true',
  ],
}))

/** The same, with `genkit` and `@genkit-ai/google-genai` installed and a single-turn `src/index.ts` for the agent to extend. */
const seeded = defineEnvironment('js-seed', ({ directory, secret }) => ({
  files: directory('../fixtures/js-seed'),
  env: geminiEnv({ secret }),
  setup: [
    'npm install --no-audit --no-fund',
    'genkit --non-interactive config set analyticsOptOut true',
  ],
}))

const run = async (c: AttemptContext, probe: Probe) => {
  await placeSolutions(c, probe)
  const turn = await c.send(probe.prompt)
  noProviderErrors(turn)
  await runChecks(c, probe.name)
}

const arms = (base: typeof empty, id: string) => {
  const { open, docsite, llms, index, hosted } = docsArms(base, 'js', id)
  return { baseline: open, variants: [docsite, llms, index, hosted] }
}

evaluate.each(PROBES.filter((p) => !SEEDED.includes(p.name)))(
  'docs: $name',
  { compare: { ...arms(empty, 'js-empty'), gate } },
  run,
)

evaluate.each(PROBES.filter((p) => SEEDED.includes(p.name)))(
  'docs: $name',
  { compare: { ...arms(seeded, 'js-seed'), gate } },
  run,
)
