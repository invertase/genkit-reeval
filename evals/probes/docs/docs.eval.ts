import { defineEnvironment, evaluate } from 'reeval'
import { docsArms, geminiEnv } from '../environments.ts'
import { gate, noProviderErrors, placeSolutions } from '../probe.ts'
import { runChecks } from './checks.ts'
import { PROBES } from './cases.ts'

/** An empty Node and TypeScript project with the Genkit CLI on PATH; the agent installs every Genkit package itself. */
const empty = defineEnvironment('js-empty', ({ directory, secret }) => ({
  files: directory('../fixtures/js-empty'),
  env: geminiEnv({ secret }),
  setup: [
    'npm install --no-audit --no-fund',
    'genkit --non-interactive config set analyticsOptOut true',
  ],
}))

const { open, docsite, llms, index } = docsArms(empty, 'js', 'js-empty')

evaluate.each(PROBES)(
  'docs: $name',
  { compare: { baseline: open, variants: [docsite, llms, index], gate } },
  async (c, probe) => {
    await placeSolutions(c, probe)
    const turn = await c.send(probe.prompt)
    noProviderErrors(turn)
    await runChecks(c, probe.name)
  },
)
