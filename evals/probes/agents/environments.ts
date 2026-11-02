import { defineEnvironment } from 'reeval'
import { docker } from 'reeval/sandbox'
import { geminiEnv, type Language } from '../environments.ts'

/** What the agents suite holds fixed; the images pin the toolchains and the Genkit packages. */
export const PINS = {
  genkitCli: '1.44.1',
  /** HEAD of genkit-ai/skills when the suite was built; its `developing-genkit-go` and `developing-genkit-python` skills. */
  skillSha: '196e1f64a6915fbe5ab507e8119f9eef6c18a1f5',
} as const

const SKILL = { go: 'developing-genkit-go', python: 'developing-genkit-python' } as const
const IMAGE = { go: new URL('../images/go.Dockerfile', import.meta.url), python: new URL('../images/python.Dockerfile', import.meta.url) } as const

/**
 * The two arms every agents probe starts from, over one fixture directory under `evals/probes/fixtures/`:
 * `control` (the fixture and the language's image) and `skill` (plus the pinned official skill).
 */
export function arms(id: string, language: Exclude<Language, 'js'>, fixture: string) {
  const control = defineEnvironment(`${id}-control`, ({ directory, secret }) => ({
    files: directory(`../fixtures/${fixture}`),
    env: geminiEnv({ secret }),
    sandbox: docker({ dockerfile: IMAGE[language] }),
    setup: ['genkit --non-interactive config set analyticsOptOut true'],
  }))
  const skill = control.extendEnvironment(`${id}-skill`, ({ skill }) => ({
    skills: [skill.git('github:genkit-ai/skills', { ref: PINS.skillSha, path: 'skills', only: [SKILL[language]] })],
  }))
  return { control, skill }
}
