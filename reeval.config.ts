import { defineConfig } from 'reeval'
import { antigravity, claudeCode, codex, cursor } from 'reeval/harness'
import { docker } from 'reeval/sandbox'

/** Every arm shares one image with the Genkit CLI on PATH and the fixture's dependencies; the arms differ only in what the agent is told. */
export const sandbox = docker({ dockerfile: './evals/Dockerfile' })

/** The five agents every study and probe run compares. */
export const harness = [
  claudeCode({ model: 'claude-sonnet-5' }),
  claudeCode({ model: 'claude-haiku-5-5' }),
  antigravity({ model: 'gemini-3.8-flash-medium' }),
  cursor({ model: 'composer-2.5', params: { fast: 'true' } }),
  codex({ model: 'gpt-5.6-luna' }),
]

/** The judge model and pass threshold every config shares. */
export const judge = { model: 'google/gemini-3.8-flash', threshold: 0.7 }

/** The model reeval's analysis of a run uses. */
export const analysis = { model: 'google/gemini-3.8-flash' }

export default defineConfig({
  include: ['evals/*.eval.ts'],
  sandbox,
  harness,
  timeout: '15m',
  judge,
  analysis,
  profiles: {
    smoke: { limit: { runs: 1, harness: ['claude-code:claude-sonnet-5'] } },
    haiku: { limit: { runs: 1, harness: ['claude-code:claude-haiku-5-5'] } },
    antigravity: { limit: { runs: 1, harness: ['antigravity:gemini-3.8-flash-medium'] } },
    full: { defaults: { runs: 5 }, record: 'always', budget: { attempts: 2500, duration: '16h' } },
  },
})
