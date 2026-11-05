// Oracle and canary for evals/probes/: each eval body places a correct and a plausible wrong solution under ~/.probe (evals/probes/probe.ts),
// and the fake agent applies one. `pnpm probe:oracle` must pass every cell; `pnpm probe:canary` must fail each with exactly its cheat.fails.
import { defineConfig } from 'reeval'
import { fakeHarness } from 'reeval/harness'
import { fakeJudge } from 'reeval/judge'
import { sandbox } from './reeval.config.ts'

process.env.GENKIT_PROBE_ORACLE = '1'

const apply = (side: 'good' | 'cheat') => fakeHarness({ script: [[{ exec: `sh ~/.probe/run.sh ${side}` }]], text: 'Done.' })
const controlOnly = { compare: false } as const

export default defineConfig({
  include: ['evals/probes/**/*.eval.ts'],
  harnesses: apply('good'),
  sandbox,
  judge: { model: fakeJudge() },
  defaultProfile: { local: 'oracle', ci: 'oracle' },
  profiles: {
    oracle: { limit: controlOnly },
    canary: { defaults: { harnesses: apply('cheat') }, limit: controlOnly },
  },
})
