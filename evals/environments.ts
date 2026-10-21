import { defineEnvironment } from 'reeval'

/** What the eval holds fixed; FINDINGS.md lists the sources. */
export const PINS = {
  genkitCli: '1.44.1',
  skillSha: 'd02d49da3a77687914715188d495999170bbf48b',
} as const

/** The healthy support-desk app with the Genkit CLI on PATH and nothing else. The sandbox comes from the config. */
export const control = defineEnvironment('control', ({ directory, secret }) => ({
  files: directory('./app', { glob: ['!.genkit/', '!answer.json'] }),
  env: {
    SUPPORT_DESK_GEMINI_API_KEY: secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }),
    GENKIT_CLI_DISABLE_UPDATE_NOTIFICATIONS: 'true',
  },
  setup: [
    'cp -r /opt/support-desk/node_modules .',
    'genkit --non-interactive config set analyticsOptOut true',
    'genkit --non-interactive docs:list js >/dev/null',
  ],
}))

/** `control` plus `GENKIT.md` as the project rules, and nothing else. */
export const rules = control.extendEnvironment('rules', ({ file }) => ({
  rules: file('./rules/GENKIT.md'),
}))

/** `rules` plus the `genkit mcp` server, which together are what `genkit init:ai-tools` installs. */
export const mcp = rules.extendEnvironment('mcp', ({ mcp, secret }) => ({
  mcp: {
    genkit: mcp.stdio('genkit', ['mcp', '--no-update-notification', '--project-root', '/reeval/workspace'], {
      env: {
        SUPPORT_DESK_GEMINI_API_KEY: secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }),
      },
    }),
  },
}))

/** `control` plus the pinned `developing-genkit-js` skill. */
export const skill = control.extendEnvironment('skill', ({ skill }) => ({
  skills: [
    skill.git('github:genkit-ai/skills', {
      ref: PINS.skillSha,
      path: 'skills',
      only: ['developing-genkit-js'],
    }),
  ],
}))
