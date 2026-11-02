import { DEFAULT_EGRESS_ALLOW, type Environment, type EnvironmentHelpers } from 'reeval'

/** Hosts the `docsite` arms may fetch beyond the package registries: Genkit's own docs only. */
export const DOCSITE_ALLOW = [...DEFAULT_EGRESS_ALLOW, 'genkit.dev', '*.genkit.dev', 'proxy.golang.org', 'sum.golang.org']

/** The app's Gemini key, brokered to Gemini's host only, under the name the fixtures read. */
export const geminiEnv = ({ secret }: Pick<EnvironmentHelpers, 'secret'>) => ({
  GEMINI_API_KEY: secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }),
  GENKIT_CLI_DISABLE_UPDATE_NOTIFICATIONS: 'true',
})

/** The language a docs index and a skill are for. */
export type Language = 'js' | 'go' | 'python'

/**
 * The context-channel arms over `base`: `open` (any host, the agent may search and fetch freely),
 * `docsite` (fetches limited to genkit.dev and the package registries), `llms` (`docsite` plus a
 * rule to read llms.txt first) and `index` (`docsite` plus a compressed docs index as the rules).
 * Server-side web search (Claude Code's WebSearch) runs on the harness's own API, so no egress
 * policy can refuse it; read `webSearches` instead.
 */
export function docsArms(base: Environment, language: Language) {
  const open = base.extendEnvironment(`${base.name}-open`, { egress: 'allow-all' })
  const docsite = base.extendEnvironment(`${base.name}-docsite`, { egress: { allow: DOCSITE_ALLOW } })
  const llms = docsite.extendEnvironment(`${base.name}-llms`, ({ file }) => ({ rules: file('./rules/llms-first.md') }))
  const index = docsite.extendEnvironment(`${base.name}-index`, ({ file }) => ({ rules: file(`./rules/index-${language}.md`) }))
  return { open, docsite, llms, index }
}
