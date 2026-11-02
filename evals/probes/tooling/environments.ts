import { defineEnvironment, type Environment } from 'reeval'
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

/** The real Claude Code CLI the `mcp-setup-claude` probe's arms install; it is the version the study's Claude Code harness runs. */
const CLAUDE_CODE = '@anthropic-ai/claude-code@2.1.316'
const CLAUDE_PREFIX = '/home/reeval/.claude/local'

/** The sandbox image's PATH, which reeval's env cannot extend by reference; arms only prepend to it. */
const IMAGE_PATH = '/home/reeval/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

/** `parent` with the real `claude` CLI installed into a prefix the sandbox user owns and put first on PATH. */
const withClaude = (parent: Environment, name: string) =>
  parent.extendEnvironment(name, {
    env: { PATH: `${CLAUDE_PREFIX}/node_modules/.bin:${IMAGE_PATH}` },
    setup: [
      `for try in 1 2 3; do npm install --prefix ${CLAUDE_PREFIX} --no-audit --no-fund ${CLAUDE_CODE} && break; sleep 3; done`,
      'command -v genkit node npm claude',
    ],
  })

/** `control` plus the real `claude` CLI. */
export const controlClaude = withClaude(control, 'control-claude')

/** `skill` plus the real `claude` CLI. */
export const skillClaude = withClaude(skill, 'skill-claude')

/** The `directed` arm (`GENKIT-directed.md` and the `genkit mcp` server) on `offline`. */
export const directedOffline = mcpOffline.extendEnvironment('directed-offline', ({ file }) => ({
  rules: file('../../rules/GENKIT-directed.md'),
}))
