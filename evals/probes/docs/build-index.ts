// Builds evals/probes/rules/index-<lang>.md, the compressed docs index of the `index` arm (Vercel's AGENTS.md pattern).
// Usage: tsx evals/probes/docs/build-index.ts [js|go|python ...] [--date YYYY-MM-DD]
// Pages come from genkit.dev's sitemap, each checked to serve markdown. Each fact must quote text found in that language's llms-<lang>.txt bundle, or the build fails.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Language } from '../environments.ts'

const SITE = 'https://genkit.dev'
const MAX_BYTES = 8192

type Fact = { text: string; evidence: string[] }

/** Current-API facts an agent most often gets wrong; each `evidence` string appears verbatim in the language's docs bundle. */
const FACTS: Record<Language, Fact[]> = {
  js: [
    {
      text: "Gemini: `npm i genkit @genkit-ai/google-genai`; `import { genkit, z } from 'genkit'`; `import { googleAI } from '@genkit-ai/google-genai'`; `genkit({ plugins: [googleAI()] })`",
      evidence: ["import { genkit, z } from 'genkit';", "import { googleAI } from '@genkit-ai/google-genai';", 'plugins: [googleAI()]'],
    },
    {
      text: "Models: `googleAI.model('gemini-flash-latest')` passed as `model:` to `ai.generate`; key in `GEMINI_API_KEY`",
      evidence: ["googleAI.model('gemini-flash-latest')", 'Set the `GEMINI_API_KEY` environment variable'],
    },
    {
      text: '`@genkit-ai/google-genai` replaces `@genkit-ai/googleai`; Gemini Enterprise `vertexAI` is exported from `@genkit-ai/google-genai` too',
      evidence: ['drop-in replacement for the previous `@genkit-ai/googleai` package', "import { vertexAI } from '@genkit-ai/google-genai';"],
    },
    {
      text: 'Structured output: `ai.generate({ prompt, output: { schema } })` with a Zod schema; read `response.output`',
      evidence: ['output: { schema: MenuItemSchema }'],
    },
    {
      text: "Claude: `npm i @genkit-ai/anthropic`; `plugins: [anthropic()]`; `anthropic.model('claude-opus-4-8')`; key in `ANTHROPIC_API_KEY`",
      evidence: ['npm i --save @genkit-ai/anthropic', "anthropic.model('claude-opus-4-8')", 'Set `ANTHROPIC_API_KEY`'],
    },
    {
      text: 'MCP server: `npm i genkit @genkit-ai/mcp`; `createMcpServer(ai, { name, version }).start()` serves every tool and prompt over stdio by default',
      evidence: ['npm i genkit @genkit-ai/mcp', 'const server = createMcpServer(ai, {', 'using the stdio transport by default'],
    },
    {
      text: "Middleware: `npm install @genkit-ai/middleware`; `import { fallback } from '@genkit-ai/middleware'`; `ai.generate({ use: [fallback({ models: [...] })] })`",
      evidence: ['npm install @genkit-ai/middleware', "import { fallback } from '@genkit-ai/middleware';", 'fallback({'],
    },
    { text: 'CLI: `npm install -g genkit-cli`', evidence: ['npm install -g genkit-cli'] },
  ],
  go: [
    {
      text: 'Install: `go get github.com/firebase/genkit/go`, then `go mod tidy`; imports are `github.com/firebase/genkit/go/{ai,genkit}`',
      evidence: ['`go get github.com/firebase/genkit/go`', '"github.com/firebase/genkit/go/genkit"'],
    },
    {
      text: 'Gemini: `genkit.Init(ctx, genkit.WithPlugins(&googlegenai.GoogleAI{}))` with `github.com/firebase/genkit/go/plugins/googlegenai`; key in `GEMINI_API_KEY`',
      evidence: ['genkit.WithPlugins(&googlegenai.GoogleAI{})', '"github.com/firebase/genkit/go/plugins/googlegenai"', '`GEMINI_API_KEY` for Google'],
    },
    {
      text: 'Generate: `genkit.Generate(ctx, g, ai.WithPrompt(...), ai.WithModelName("googleai/gemini-flash-latest"))`',
      evidence: ['ai.WithModelName("googleai/gemini-flash-latest")', 'genkit.Generate(ctx, g,'],
    },
    {
      text: 'Claude: `&anthropic.Anthropic{}` from `github.com/firebase/genkit/go/plugins/anthropic`; key in `ANTHROPIC_API_KEY`',
      evidence: ['genkit.WithPlugins(&anthropic.Anthropic{})', '`ANTHROPIC_API_KEY` for Anthropic'],
    },
    { text: 'Middleware: `ai.WithUse(&middleware.Fallback{...})`', evidence: ['ai.WithUse(&middleware.Fallback{'] },
  ],
  python: [
    {
      text: 'Gemini: `uv add genkit genkit-google-genai`; `from genkit import Genkit`; `from genkit_google_genai import GoogleAI`; `Genkit(plugins=[GoogleAI()])`',
      evidence: ['genkit genkit-google-genai', 'from genkit import Genkit', 'from genkit_google_genai import GoogleAI', 'plugins=[GoogleAI()]'],
    },
    {
      text: "Models: `await ai.generate(model='googleai/gemini-flash-latest', prompt=...)`; key in `GEMINI_API_KEY`",
      evidence: ["model='googleai/gemini-flash-latest'", 'await ai.generate(', 'Set the `GEMINI_API_KEY` environment variable'],
    },
    {
      text: "Claude: `uv add genkit-anthropic`; `from genkit_anthropic import Anthropic, anthropic_name`; `Genkit(plugins=[Anthropic()])`",
      evidence: ['uv add genkit-anthropic', 'from genkit_anthropic import Anthropic, anthropic_name', 'plugins=[Anthropic()]'],
    },
    {
      text: 'Middleware: `pip install genkit-middleware`; `from genkit_middleware import Retry`',
      evidence: ['pip install genkit-middleware', 'from genkit_middleware import Retry'],
    },
    { text: 'Python 3.10 or later', evidence: ['Python 3.10 or later'] },
  ],
}

const LANGUAGES = Object.keys(FACTS) as Language[]

async function text(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.text()
}

async function servesMarkdown(url: string): Promise<boolean> {
  const response = await fetch(url, { method: 'HEAD' })
  return response.ok && (response.headers.get('content-type') ?? '').includes('markdown')
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

/** The markdown source of the index for `language`, fetched from genkit.dev; `date` is pinned in its header. */
export async function buildIndex(language: Language, date: string): Promise<string> {
  const sitemap = await text(`${SITE}/sitemap-0.xml`)
  const bundle = await text(`${SITE}/llms-${language}.txt`)
  const prefix = `${SITE}/docs/${language}/`
  const slugs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1] ?? '')
    .filter((url) => url.startsWith(prefix))
    .map((url) => url.slice(prefix.length).replace(/\/$/, ''))
    .filter(Boolean)
    .sort()
  const served = await mapLimit(slugs, 8, (slug) => servesMarkdown(`${prefix}${slug}.md`))
  const missing = slugs.filter((_, i) => !served[i])
  if (missing.length > 0) console.error(`${language}: skipped, no markdown: ${missing.join(', ')}`)
  const pages = slugs.filter((_, i) => served[i])

  const groups = new Map<string, string[]>()
  for (const page of pages) {
    const slash = page.lastIndexOf('/')
    const dir = slash < 0 ? '' : page.slice(0, slash)
    groups.set(dir, [...(groups.get(dir) ?? []), page.slice(slash + 1)])
  }
  const listing = [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([dir, names]) => `|${dir === '' ? '.' : dir}:{${names.join(',')}}`)

  for (const fact of FACTS[language]) {
    for (const quote of fact.evidence) {
      if (!bundle.includes(quote)) throw new Error(`${language}: evidence not in llms-${language}.txt: ${quote}`)
    }
  }

  const label = { js: 'JavaScript/TypeScript', go: 'Go', python: 'Python' }[language]
  const lines = [
    `[Genkit ${label} Docs Index]`,
    `|fetched: ${date}, from ${SITE}/sitemap-0.xml and ${SITE}/llms-${language}.txt`,
    `|root: ${prefix}`,
    '|IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any Genkit task. Fetch <root><path>.md for the page you need before you write code.',
    `|all pages in one file: ${SITE}/llms-${language}.txt`,
    ...listing,
    '|current API facts (each quoted from the docs above):',
    ...FACTS[language].map((f) => `|${f.text}`),
  ]
  const body = `${lines.join('\n')}\n`
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
