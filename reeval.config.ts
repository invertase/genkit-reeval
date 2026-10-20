import { defineConfig } from 'reeval'
import { antigravity, claudeCode, codex, cursor } from 'reeval/harness'
import { docker } from 'reeval/sandbox'

export default defineConfig({
  include: ['evals/**/*.eval.ts'],
  // Every arm shares one image with the Genkit CLI on PATH; the arms differ only in what the agent is told.
  sandbox: docker({ install: ['npm i -g genkit-cli@1.44.1'] }),
  harness: [
    claudeCode({ model: 'claude-sonnet-5' }),
    antigravity({ model: 'gemini-3.8-flash-medium' }),
    cursor({ model: 'composer-2.5', params: { fast: 'true' } }),
    codex({ model: 'gpt-5.6-luna' }),
  ],
  timeout: '15m',
  judge: { model: 'google/gemini-3.8-flash', threshold: 0.7 },
  analysis: { model: 'google/gemini-3.8-flash' },
  profiles: {
    smoke: { limit: { runs: 1, harness: ['claude-code:claude-sonnet-5'] } },
    full: { defaults: { runs: 5 }, record: 'always' },
  },
})
