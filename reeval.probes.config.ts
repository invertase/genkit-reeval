// Smoke probes of Genkit tooling beyond the study: one attempt per cell, report only. See evals/probes/.
import { defineConfig } from 'reeval'
import { analysis, harnesses, judge, sandbox } from './reeval.config.ts'

export default defineConfig({
  include: ['evals/probes/**/*.eval.ts'],
  sandbox,
  harnesses,
  timeout: '25m',
  judge,
  analysis,
  defaultProfile: { local: 'probe', ci: 'probe' },
  profiles: {
    probe: { defaults: { runs: 1 } },
    smoke: { defaults: { runs: 1 }, limit: { harnesses: ['claude-code:claude-sonnet-5'] } },
    antigravity: { defaults: { runs: 1 }, limit: { harnesses: ['antigravity:gemini-3.8-flash-medium'] } },
    cursor: { defaults: { runs: 1 }, limit: { harnesses: ['cursor:composer-2.5'] } },
    'agents-tsdoc': { defaults: { runs: 12 }, limit: { harnesses: ['claude-code:claude-haiku-5-5', 'claude-code:claude-sonnet-5', 'codex:gpt-5.6-luna', 'cursor:composer-2.5', 'antigravity:gemini-3.8-flash-medium'] }, tags: ['agents-tsdoc'] },
  },
})
