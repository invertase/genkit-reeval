/** Origin of the Genkit docs site. */
export const SITE = 'https://genkit.dev'

/** The languages Genkit documents. */
export const LANGS = ['js', 'go', 'python', 'dart'] as const
/** One of {@link LANGS}. */
export type Lang = (typeof LANGS)[number]

/** Outcome of one fetch. `bytes` counts the body actually read; `status` is 0 when the request failed. */
export type Fetched = {
  url: string
  finalUrl: string
  status: number
  contentType: string
  bytes: number
  /** Present only when `fetchUrl` was called with `keepBody`. */
  body?: string
  error?: string
}

const errMsg = (err: unknown): string =>
  err instanceof Error ? `${err.message}${err.cause instanceof Error ? ` (${err.cause.message})` : ''}` : String(err)

/** Whether a status is a transient failure (network error, 429, 5xx) rather than an answer about the URL. */
export const isTransient = (status: number): boolean => status === 0 || status === 429 || status >= 500

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function fetchOnce(url: string, opts: { timeoutMs?: number; keepBody?: boolean }): Promise<{ result: Fetched; retryAfterMs?: number }> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000), headers: { 'user-agent': 'genkit-reeval-url-check' } })
    const buf = new Uint8Array(await res.arrayBuffer())
    const seconds = Number(res.headers.get('retry-after'))
    return {
      result: {
        url,
        finalUrl: res.url || url,
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        bytes: buf.byteLength,
        ...(opts.keepBody ? { body: new TextDecoder().decode(buf) } : {}),
      },
      ...(Number.isFinite(seconds) && seconds > 0 ? { retryAfterMs: seconds * 1000 } : {}),
    }
  } catch (err) {
    return { result: { url, finalUrl: url, status: 0, contentType: '', bytes: 0, error: errMsg(err) } }
  }
}

/** Fetches `url` with a timeout, following redirects. Never throws: a failure comes back as `status: 0` with `error`. Transient failures (status 0, 429, 5xx) are retried `retries` times with exponential backoff, honouring `Retry-After`. */
export async function fetchUrl(url: string, opts: { timeoutMs?: number; keepBody?: boolean; retries?: number } = {}): Promise<Fetched> {
  for (let attempt = 0; ; attempt++) {
    const { result, retryAfterMs } = await fetchOnce(url, opts)
    if (!isTransient(result.status) || attempt >= (opts.retries ?? 0)) return result
    await sleep(Math.min(retryAfterMs ?? 1000 * 2 ** attempt, 60_000))
  }
}

/** Runs `fn` over `items` with at most `limit` in flight, each worker pausing `delayMs` between items. Results keep input order. */
export async function pool<T, R>(items: readonly T[], limit: number, delayMs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      out[i] = await fn(items[i] as T)
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** A docs page as the sitemap names it: `lang` is undefined for language-agnostic pages. */
export type DocsPage = { url: string; lang?: Lang; slug: string }

/** Splits a canonical `https://genkit.dev/docs/...` URL into language and slug; undefined for anything else. */
export function parseDocsUrl(url: string): DocsPage | undefined {
  const m = /^https:\/\/genkit\.dev\/docs\/(.+?)\/?$/.exec(url)
  if (!m?.[1]) return undefined
  const [first, ...rest] = m[1].split('/')
  const lang = (LANGS as readonly string[]).includes(first ?? '') ? (first as Lang) : undefined
  const slug = lang ? rest.join('/') : m[1]
  return slug ? { url, lang, slug } : undefined
}

/** The form llms.txt's examples show for "Append `.md` to any docs URL": the canonical URL without its trailing `/`, plus `.md`. */
export const appendMd = (canonical: string): string => `${canonical.replace(/\/$/, '')}.md`

/** The literal reading of "Append `.md` to any docs URL": a canonical URL ends in `/`, so this is `<url>/.md`. */
export const appendMdLiteral = (canonical: string): string => `${canonical}.md`

/** `https://genkit.dev/docs/<lang>/<slug>.md`, the form llms.txt gives as an example. */
export const langMd = (lang: Lang, slug: string): string => `${SITE}/docs/${lang}/${slug}.md`

/** `https://genkit.dev/docs/<slug>.md`, with no language. */
export const neutralMd = (slug: string): string => `${SITE}/docs/${slug}.md`

/** Whether a content type is one an agent can read as text from a `.md` URL. */
export const isTextType = (contentType: string): boolean => /^text\/(markdown|plain)\b/i.test(contentType)

/** Whether a response is a real markdown or plain-text page: 200, a text type, and a body that is not HTML. */
export const isMarkdownOk = (f: Fetched): boolean => f.status === 200 && isTextType(f.contentType) && !(f.body ?? '').trimStart().toLowerCase().startsWith('<!doctype')

/** Number of `<Lang` tags in an MDX body. */
export const countLangTags = (text: string): number => text.split(/<Lang\b/).length - 1

/** The `<loc>` values of a sitemap or sitemap index. */
export const sitemapLocs = (xml: string): string[] => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1] as string)
