import { defineEnvironment } from 'reeval'
import { control, mcp as studyMcp, skill } from '../../environments.ts'
import { geminiEnv } from '../environments.ts'

const APP_KEY = 'SUPPORT_DESK_GEMINI_API_KEY'

/** The `mcp` arm's server, pointed at a project root where the app is not. The server starts and answers; its runtime tools never find the app. */
export const mcpWrongRoot = studyMcp.extendEnvironment('mcp-wrong-root', ({ mcp, secret }) => ({
  mcp: {
    genkit: mcp.stdio('genkit', ['mcp', '--no-update-notification', '--project-root', '/home/reeval/support-desk'], {
      env: geminiEnv({ secret }, APP_KEY),
    }),
  },
}))

/**
 * `control` without the docs warm-up, behind `deny-all` egress: npm and all web are unreachable, not only genkit.dev, and the docs cache is cold.
 * Gemini stays reachable because its secret's host is automatic. Not a child of `control`: that setup runs `docs:list`.
 */
const offline = defineEnvironment('offline', ({ directory, secret }) => ({
  files: directory('../../app', { glob: ['!.genkit/', '!answer.json'] }),
  env: geminiEnv({ secret }, APP_KEY),
  setup: ['cp -r /opt/support-desk/node_modules .', 'genkit --non-interactive config set analyticsOptOut true'],
  egress: 'deny-all',
}))

/** The `mcp` arm (GENKIT.md and the `genkit mcp` server) on `offline`. */
export const mcpOffline = offline.extendEnvironment('mcp-offline', ({ file, mcp, secret }) => ({
  rules: file('../../rules/GENKIT.md'),
  mcp: {
    genkit: mcp.stdio('genkit', ['mcp', '--no-update-notification', '--project-root', '/reeval/workspace'], {
      env: geminiEnv({ secret }, APP_KEY),
    }),
  },
}))

/** The image's PATH behind a directory the agent's user can write, which `~/.local/bin` is not: the `claude` stub goes there. */
export const STUB_BIN = '/home/reeval/.claude-stub/bin'
const STUB_PATH = `${STUB_BIN}:/home/reeval/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`

/** `control` with `STUB_BIN` first on PATH. */
export const controlClaudeStub = control.extendEnvironment('control-claude-stub', { env: { PATH: STUB_PATH } })

/** `skill` with `STUB_BIN` first on PATH. */
export const skillClaudeStub = skill.extendEnvironment('skill-claude-stub', { env: { PATH: STUB_PATH } })

/** The `directed` arm (`GENKIT-directed.md` and the `genkit mcp` server) on `offline`. */
export const directedOffline = mcpOffline.extendEnvironment('directed-offline', ({ file }) => ({
  rules: file('../../rules/GENKIT-directed.md'),
}))
