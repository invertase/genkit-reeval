import { defineEnvironment } from 'reeval'

/** What the eval holds fixed; see evals/genkit/PINS.md for the sources. */
export const PINS = {
  genkitCli: '1.44.1',
  skillSha: 'd02d49da3a77687914715188d495999170bbf48b',
} as const

// The oracle config runs on the fake sandbox, which is the host: there is no gateway to swap a
// placeholder key, and the genkit warm-up steps would write to the host's genkit config.
const oracleRun = process.env.GENKIT_EVAL_ORACLE === '1'

/** The healthy support-desk app with the Genkit CLI on PATH and nothing else. The sandbox comes from the config. */
export const control = defineEnvironment('control', ({ directory, secret }) => ({
  files: directory('./app', { glob: ['!.genkit/', '!answer.json'] }),
  env: {
    GEMINI_API_KEY: oracleRun
      ? secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY')
      : secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }),
    GENKIT_CLI_DISABLE_UPDATE_NOTIFICATIONS: 'true',
  },
  setup: [
    { run: 'npm install --no-audit --no-fund', timeout: '5m' },
    ...(oracleRun
      ? []
      : [
          'genkit --non-interactive config set analyticsOptOut true',
          'genkit --non-interactive docs:list js >/dev/null',
        ]),
  ],
}))

/** `control` plus what `genkit init:ai-tools` installs: GENKIT.md and the `genkit mcp` server. */
export const mcp = control.extendEnvironment('mcp', ({ file, mcp, secret }) => ({
  rules: file('./genkit/GENKIT.md'),
  mcp: {
    genkit: mcp.stdio('genkit', ['mcp', '--no-update-notification', '--project-root', '/reeval/workspace'], {
      env: {
        GEMINI_API_KEY: secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }),
      },
    }),
  },
}))

/** `control` plus the pinned `developing-genkit-js` skill. */
export const cli = control.extendEnvironment('cli', ({ skill }) => ({
  skills: [
    skill.git('github:genkit-ai/skills', {
      ref: PINS.skillSha,
      path: 'skills',
      only: ['developing-genkit-js'],
    }),
  ],
}))
