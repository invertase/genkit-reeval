import { DEFAULT_EGRESS_ALLOW, type Environment, type EnvironmentHelpers } from 'reeval'

/** Hosts the `docsite` arms may fetch beyond the package registries: Genkit's own docs and the Go module proxy, whose zips `proxy.golang.org` serves from `storage.googleapis.com`. */
export const DOCSITE_ALLOW = [...DEFAULT_EGRESS_ALLOW, 'genkit.dev', '*.genkit.dev', 'proxy.golang.org', 'sum.golang.org', 'storage.googleapis.com']

/** The app's Gemini key, brokered to Gemini's host only, under `name`: the variable the app reads. */
export const geminiEnv = ({ secret }: Pick<EnvironmentHelpers, 'secret'>, name = 'GEMINI_API_KEY') => ({
  [name]: secret.fromEnv('GOOGLE_GENERATIVE_AI_API_KEY', { hosts: secret.hosts.gemini }),
  GENKIT_CLI_DISABLE_UPDATE_NOTIFICATIONS: 'true',
})

/** The language a docs index and a skill are for. */
export type Language = 'js' | 'go' | 'python'

/** The languages with a hosted rules file at `https://genkit.dev/GENKIT.<language>.md`. */
export type HostedLanguage = 'js' | 'go'

const HOSTED: HostedLanguage[] = ['js', 'go']

/** The arms `docsArms` builds for `language`; `hosted` exists only where genkit.dev hosts a rules file. */
export type DocsArms<L extends Language> = {
  open: Environment
  docsite: Environment
  llms: Environment
  index: Environment
} & (L extends HostedLanguage ? { hosted: Environment } : unknown)

/**
 * The context-channel arms over `base`: `open` (any host, the agent may search and fetch freely),
 * `docsite` (fetches limited to genkit.dev and the package registries), `llms` (`docsite` plus a
 * rule to read llms.txt first), `index` (`docsite` plus a compressed docs index as the rules) and
 * `hosted` (`docsite` plus Go's develop-with-ai AGENTS.md block, adapted to the language: it points at
 * the hosted rules file `GENKIT.<language>.md`, the per-page markdown URLs and `llms-<language>.txt`;
 * only for JS and Go, the languages that have a hosted rules file, and only Go's page prints the block).
 * Server-side web search (Claude Code's WebSearch) runs on the harness's own API, so no egress
 * policy can refuse it; read `webSearches` instead. The arms are named `<id>-open`, `<id>-docsite`,
 * `<id>-llms`, `<id>-index` and `<id>-hosted`.
 */
export function docsArms<L extends Language>(base: Environment, language: L, id: string): DocsArms<L> {
  const open = base.extendEnvironment(`${id}-open`, { egress: 'allow-all' })
  const docsite = base.extendEnvironment(`${id}-docsite`, { egress: { allow: DOCSITE_ALLOW } })
  const llms = docsite.extendEnvironment(`${id}-llms`, ({ file }) => ({ rules: file('./rules/llms-first.md') }))
  const index = docsite.extendEnvironment(`${id}-index`, ({ file }) => ({ rules: file(`./rules/index-${language}.md`) }))
  const arms = { open, docsite, llms, index }
  if (!(HOSTED as Language[]).includes(language)) return arms as DocsArms<L>
  const hosted = docsite.extendEnvironment(`${id}-hosted`, ({ file }) => ({ rules: file(`./rules/hosted-${language}.md`) }))
  return { ...arms, hosted } as DocsArms<L>
}
