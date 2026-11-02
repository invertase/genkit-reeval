import { DEFAULT_EGRESS_ALLOW, type Environment, type EnvironmentHelpers } from 'reeval'

/** Hosts the `docsite` arms may fetch beyond the package registries: Genkit's own docs only. */
export const DOCSITE_ALLOW = [...DEFAULT_EGRESS_ALLOW, 'genkit.dev', '*.genkit.dev', 'proxy.golang.org', 'sum.golang.org']

/** The app's Gemini key, brokered to Gemini's host only, under `name`: the variable the app reads. */
export const geminiEnv = ({ secret }: Pick<EnvironmentHelpers, 'secret'>, name = 'GEMINI_API_KEY') => ({
  [name]: secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }),
  GENKIT_CLI_DISABLE_UPDATE_NOTIFICATIONS: 'true',
})

/** The language a docs index and a skill are for. */
export type Language = 'js' | 'go' | 'python'

/**
 * The context-channel arms over `base`: `open` (any host, the agent may search and fetch freely),
 * `docsite` (fetches limited to genkit.dev and the package registries), `llms` (`docsite` plus a
 * rule to read llms.txt first) and `index` (`docsite` plus a compressed docs index as the rules).
 * Server-side web search (Claude Code's WebSearch) runs on the harness's own API, so no egress
 * policy can refuse it; read `webSearches` instead. The arms are named `<id>-open`, `<id>-docsite`,
 * `<id>-llms` and `<id>-index`.
 */
export function docsArms(base: Environment, language: Language, id: string) {
  const open = base.extendEnvironment(`${id}-open`, { egress: 'allow-all' })
  const docsite = base.extendEnvironment(`${id}-docsite`, { egress: { allow: DOCSITE_ALLOW } })
  const llms = docsite.extendEnvironment(`${id}-llms`, ({ file }) => ({ rules: file('./rules/llms-first.md') }))
  const index = docsite.extendEnvironment(`${id}-index`, ({ file }) => ({ rules: file(`./rules/index-${language}.md`) }))
  return { open, docsite, llms, index }
}
