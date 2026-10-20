// Oracle: the control arm passes all three checks when the bug is fixed and named, so the eval can pass.
// Canary (`--profile canary`): an unfixed bug with a wrong answer fails every cell, so the checks bite.
import { readFileSync } from 'node:fs'
import { defineConfig } from 'reeval'
import { fakeHarness } from 'reeval/harness'
import { fakeJudge } from 'reeval/judge'
import { sandbox } from './reeval.config.ts'

// Read by evals/genkit.eval.ts at registration: reeval does not expose the config or profile to an eval.
process.env.GENKIT_EVAL_GATE = 'all'

const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const oracleFiles = {
  '~/.oracle/oracle.ts': source('./evals/oracle.ts'),
  '~/.oracle/bugs.ts': source('./evals/bugs.ts'),
}
const oracle = (args = '') =>
  fakeHarness({
    script: [[{ write: oracleFiles }, { exec: `node_modules/.bin/tsx ~/.oracle/oracle.ts${args}` }]],
    text: 'Fixed it.',
  })
const controlOnly = { compare: false } as const

export default defineConfig({
  include: ['evals/**/*.eval.ts'],
  harness: oracle(),
  sandbox,
  // The judge code path runs in the oracle too, with no key and no model call.
  judge: { model: fakeJudge() },
  defaultProfile: { local: 'oracle', ci: 'oracle' },
  profiles: {
    oracle: { limit: controlOnly },
    canary: { defaults: { harness: oracle(' --cheat') }, limit: controlOnly },
  },
})
