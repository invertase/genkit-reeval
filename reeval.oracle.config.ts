// Oracle: the control arm passes every check when the bug is fixed and named or the agents are built, so every eval can pass.
// Canary (`--profile canary`): an unfixed bug with a wrong answer, or a plausible wrong build (`Task.cheat`), must fail every cell, so the checks bite.
// reeval exits 1 for that canary, as for any failed gate; `pnpm canary` then runs evals/canary-check.ts, whose exit code is the verdict.
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
  '~/.oracle/tasks.ts': source('./evals/tasks.ts'),
  '~/.oracle/app/src/agents.ts': source('./evals/app/src/agents.ts'),
  '~/.oracle/app/src/index.ts': source('./evals/app/src/index.ts'),
  '~/.oracle/app/src/tools.ts': source('./evals/app/src/tools.ts'),
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
