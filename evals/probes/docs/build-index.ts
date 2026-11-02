// Builds evals/probes/rules/index-<lang>.md: the genkit.dev page list of one language, as the rules of the `index` arm.
// Usage: tsx evals/probes/docs/build-index.ts [js|go|python ...] [--date YYYY-MM-DD]
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Language } from '../environments.ts'

const SITE = 'https://genkit.dev'
const MAX_BYTES = 8192
const MAX_SKIPPED = 5
const TIMEOUT_MS = 20_000
const LANGUAGES: Language[] = ['js', 'go', 'python']

const INSTRUCTION = 'Prefer retrieval over pre-trained knowledge: read the relevant page below before writing Genkit code.'

const get = (url: string, method = 'GET') => fetch(url, { method, signal: AbortSignal.timeout(TIMEOUT_MS) })

async function text(url: string): Promise<string> {
  const response = await get(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.text()
}

const locs = (xml: string): string[] => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => (m[1] ?? '').trim())

/** Every page URL of the site, following the child sitemaps of `sitemap-index.xml`. */
async function sitemapUrls(): Promise<string[]> {
  const children = locs(await text(`${SITE}/sitemap-index.xml`))
  if (children.length === 0) throw new Error('sitemap-index.xml lists no sitemaps')
  return (await Promise.all(children.map(async (child) => locs(await text(child))))).flat()
}

/** The page's `# ` heading when `url` serves markdown, `undefined` when it does not. HEAD is tried first, GET when HEAD is refused. */
async function markdownTitle(url: string, slug: string): Promise<string | undefined> {
  try {
    let head = await get(url, 'HEAD')
    if ([403, 405, 501].includes(head.status)) head = await get(url)
    if (!head.ok || !(head.headers.get('content-type') ?? '').includes('markdown')) return undefined
    const body = await text(url)
    return /^#\s+(.+)$/m.exec(body)?.[1]?.trim() || slug
  } catch {
    return undefined
  }
}

/** `items` with `fn` applied, at most `limit` at a time. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i] as T)
    }),
  )
  return out
}

/** The markdown source of the page index for `language`, fetched from genkit.dev; `date` is pinned in its header. */
export async function buildIndex(language: Language, date: string): Promise<string> {
  const prefix = `${SITE}/docs/${language}/`
  const slugs = [
    ...new Set(
      (await sitemapUrls())
        .filter((url) => url.startsWith(prefix))
        .map((url) => url.slice(prefix.length).replace(/\/$/, ''))
        .filter(Boolean),
    ),
  ].sort()
  const titles = await mapLimit(slugs, 8, (slug) => markdownTitle(`${prefix}${slug}.md`, slug))
  const skipped = slugs.filter((_, i) => titles[i] === undefined)
  if (skipped.length > 0) console.error(`${language}: skipped, no markdown: ${skipped.join(', ')}`)
  if (skipped.length > MAX_SKIPPED) throw new Error(`${language}: ${skipped.length} pages skipped, over ${MAX_SKIPPED}`)

  const sections = new Map<string, string[]>()
  slugs.forEach((slug, i) => {
    const title = titles[i]
    if (title === undefined) return
    const slash = slug.lastIndexOf('/')
    const section = slash < 0 ? 'general' : slug.slice(0, slash)
    sections.set(section, [...(sections.get(section) ?? []), `- ${title}: /docs/${language}/${slug}.md`])
  })
  const label = { js: 'JavaScript/TypeScript', go: 'Go', python: 'Python' }[language]
  const body = [
    `# Genkit ${label} docs on ${SITE}`,
    '',
    INSTRUCTION,
    `Pages are markdown; fetch ${SITE} plus the path. Listed ${date}.`,
    ...[...sections.entries()]
      .sort(([a], [b]) => (a === 'general' ? -1 : b === 'general' ? 1 : a.localeCompare(b)))
      .flatMap(([section, lines]) => ['', `## ${section}`, ...lines]),
    '',
  ].join('\n')
  const bytes = Buffer.byteLength(body)
  if (bytes > MAX_BYTES) throw new Error(`${language}: index is ${bytes} bytes, over ${MAX_BYTES}`)
  return body
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const dateAt = args.indexOf('--date')
  const date = dateAt < 0 ? new Date().toISOString().slice(0, 10) : (args.splice(dateAt, 2)[1] ?? '')
  const requested = args.length === 0 ? LANGUAGES : args
  for (const language of requested) {
    if (!LANGUAGES.includes(language as Language)) throw new Error(`unknown language ${language}`)
    const body = await buildIndex(language as Language, date)
    writeFileSync(new URL(`../rules/index-${language}.md`, import.meta.url), body)
    console.log(`index-${language}.md: ${Buffer.byteLength(body)} bytes`)
  }
}
