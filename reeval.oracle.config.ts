// Oracle: the control arm passes all three checks when the bug is fixed and named, so the eval can pass.
// Canary (`--profile canary`): an unfixed bug with a wrong answer fails every cell, so the checks bite.
import { join } from 'node:path'
import { defineConfig } from 'reeval'
import { fakeHarness } from 'reeval/harness'
import { fakeSandbox } from 'reeval/sandbox'

process.env.GENKIT_EVAL_ORACLE = '1'

const tsx = join(import.meta.dirname, 'node_modules/.bin/tsx')
const oracle = `${JSON.stringify(tsx)} ${JSON.stringify(join(import.meta.dirname, 'evals/oracle.ts'))}`
const controlOnly = { compare: false } as const

export default defineConfig({
  include: ['evals/**/*.eval.ts'],
  harness: fakeHarness({ script: [[{ exec: oracle }]], text: 'Fixed it.' }),
  sandbox: fakeSandbox(),
  defaultProfile: { local: 'oracle', ci: 'oracle' },
  profiles: {
    oracle: { limit: controlOnly },
    canary: {
      defaults: { harness: fakeHarness({ script: [[{ exec: `${oracle} --cheat` }]] }) },
      limit: controlOnly,
    },
  },
})
