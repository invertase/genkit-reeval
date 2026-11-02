import { defineEnvironment } from 'reeval'
import { mcp as studyMcp } from '../../environments.ts'

/** The `mcp` arm's server, pointed at a project root where the app is not. The server starts and answers; its runtime tools never find the app. */
export const mcpWrongRoot = studyMcp.extendEnvironment('mcp-wrong-root', ({ mcp, secret }) => ({
  mcp: {
    genkit: mcp.stdio('genkit', ['mcp', '--no-update-notification', '--project-root', '/home/reeval/support-desk'], {
      env: { SUPPORT_DESK_GEMINI_API_KEY: secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }) },
    }),
  },
}))

/**
 * `control` without the docs warm-up, behind `deny-all` egress: npm and all web are unreachable, not only genkit.dev, and the docs cache is cold.
 * Gemini stays reachable because its secret's host is automatic. Not a child of `control`: that setup runs `docs:list`.
 */
const offline = defineEnvironment('offline', ({ directory, secret }) => ({
  files: directory('../../app', { glob: ['!.genkit/', '!answer.json'] }),
  env: {
    SUPPORT_DESK_GEMINI_API_KEY: secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }),
    GENKIT_CLI_DISABLE_UPDATE_NOTIFICATIONS: 'true',
  },
  setup: ['cp -r /opt/support-desk/node_modules .', 'genkit --non-interactive config set analyticsOptOut true'],
  egress: 'deny-all',
}))

/** The `mcp` arm (GENKIT.md and the `genkit mcp` server) on `offline`. */
export const mcpOffline = offline.extendEnvironment('mcp-offline', ({ file, mcp, secret }) => ({
  rules: file('../../rules/GENKIT.md'),
  mcp: {
    genkit: mcp.stdio('genkit', ['mcp', '--no-update-notification', '--project-root', '/reeval/workspace'], {
      env: { SUPPORT_DESK_GEMINI_API_KEY: secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }) },
    }),
  },
}))

/** The `directed` arm (`GENKIT-directed.md` and the `genkit mcp` server) on `offline`. */
export const directedOffline = mcpOffline.extendEnvironment('directed-offline', ({ file }) => ({
  rules: file('../../rules/GENKIT-directed.md'),
}))
