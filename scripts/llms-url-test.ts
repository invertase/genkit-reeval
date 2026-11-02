// Tests every URL form that https://genkit.dev/llms.txt documents, and the forms agents plausibly try, against the live site.
// Usage: tsx scripts/llms-url-test.ts; rewrites LLMS-URLS.md and exits 1 when a form llms.txt documents fails.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  appendMd,
  countLangTags,
  type DocsPage,
  fetchUrl,
  isMarkdownOk,
  isTextType,
  LANGS,
  langMd,
  neutralMd,
  parseDocsUrl,
  pool,
  SITE,
  sitemapLocs,
} from './llms-urls.ts'

const OUT = fileURLToPath(new URL('../LLMS-URLS.md', import.meta.url))
const CONCURRENCY = 4
const DELAY_MS = 150
const KB = (n: number): string => `${(n / 1024).toFixed(1)} KB`
const cell = (s: string): string => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()

type Form = 'append-md' | 'lang-md' | 'neutral-md' | 'llms-link' | 'missing-lang-md'

type Result = {
  form: Form
  /** True when llms.txt itself documents this form, so a failure fails the guard. */
  documented: boolean
  page?: DocsPage
  url: string
  ok: boolean
  status: number
  contentType: string
  bytes: number
  langTags: number
  html: boolean
  error?: string
}

/** Fetches `url` once per run; the body is reduced to what the checks read. */
const seen = new Map<string, Promise<Omit<Result, 'form' | 'documented' | 'page'>>>()
function probe(url: string): Promise<Omit<Result, 'form' | 'documented' | 'page'>> {
  let p = seen.get(url)
  if (!p) {
    p = fetchUrl(url, { keepBody: true, timeoutMs: 60_000 }).then((f) => ({
      url,
      ok: isMarkdownOk(f),
      status: f.status,
      contentType: f.contentType,
      bytes: f.bytes,
      langTags: countLangTags(f.body ?? ''),
      html: /^\s*<!doctype/i.test(f.body ?? ''),
      ...(f.error ? { error: f.error } : {}),
    }))
    seen.set(url, p)
  }
  return p
}

type Job = { form: Form; documented: boolean; page?: DocsPage; url: string }

async function main(): Promise<number> {
  const llms = await fetchUrl(`${SITE}/llms.txt`, { keepBody: true })
  if (llms.status !== 200 || !llms.body) throw new Error(`cannot read llms.txt: ${llms.status} ${llms.error ?? ''}`)
  const llmsUrls = [...new Set([...llms.body.matchAll(/https:\/\/genkit\.dev\/[^\s)`>\]]+/g)].map((m) => m[1] ?? m[0]))]
  const claimsAppend = /Append\s+`\.md`\s+to\s+any\s+docs\s+URL/i.test(llms.body)

  const index = await fetchUrl(`${SITE}/sitemap-index.xml`, { keepBody: true })
  if (index.status !== 200 || !index.body) throw new Error(`cannot read sitemap-index.xml: ${index.status} ${index.error ?? ''}`)
  const children = sitemapLocs(index.body)
  const locs = (
    await Promise.all(
      children.map(async (c) => {
        const r = await fetchUrl(c, { keepBody: true })
        if (r.status !== 200 || !r.body) throw new Error(`cannot read ${c}: ${r.status} ${r.error ?? ''}`)
        return sitemapLocs(r.body)
      }),
    )
  ).flat()
  const pages = [...new Set(locs)].map(parseDocsUrl).filter((p): p is DocsPage => p !== undefined)
  const perLang = pages.filter((p) => p.lang)
  const agnostic = pages.filter((p) => !p.lang)
  const langsBySlug = new Map<string, Set<string>>()
  for (const p of perLang) langsBySlug.set(p.slug, (langsBySlug.get(p.slug) ?? new Set()).add(p.lang as string))
  const agnosticSlugs = new Set(agnostic.map((p) => p.slug))

  const jobs: Job[] = []
  for (const url of llmsUrls) jobs.push({ form: 'llms-link', documented: true, url })
  for (const page of pages) jobs.push({ form: 'append-md', documented: claimsAppend, page, url: appendMd(page.url) })
  for (const page of perLang) {
    jobs.push({ form: 'lang-md', documented: true, page, url: langMd(page.lang!, page.slug) })
  }
  for (const slug of langsBySlug.keys()) {
    const page = perLang.find((p) => p.slug === slug)!
    jobs.push({ form: 'neutral-md', documented: false, page: { ...page, lang: undefined }, url: neutralMd(slug) })
  }
  for (const page of agnostic) {
    jobs.push({ form: 'neutral-md', documented: false, page, url: neutralMd(page.slug) })
    for (const lang of LANGS) jobs.push({ form: 'lang-md', documented: false, page, url: langMd(lang, page.slug) })
  }
  for (const [slug, have] of langsBySlug) {
    if (agnosticSlugs.has(slug)) continue
    for (const lang of LANGS) if (!have.has(lang)) jobs.push({ form: 'missing-lang-md', documented: false, page: { url: '', lang, slug }, url: langMd(lang, slug) })
  }

  console.error(`llms-url-test: ${pages.length} docs pages (${agnostic.length} language-agnostic), ${jobs.length} checks`)
  const results: Result[] = await pool(jobs, CONCURRENCY, DELAY_MS, async (j) => ({ ...j, ...(await probe(j.url)) }))

  const sel = (form: Form, f: (r: Result) => boolean = () => true) => results.filter((r) => r.form === form && f(r))
  const agnosticOf = (r: Result): boolean => r.page !== undefined && agnosticSlugs.has(r.page.slug) && !r.page.lang
  const isAgnosticPage = (r: Result): boolean => r.page !== undefined && agnosticSlugs.has(r.page.slug)
  const failing = (rs: Result[]) => rs.filter((r) => !r.ok)
  const sample = (rs: Result[], n = 3) =>
    rs.slice(0, n).map((r) => `\`${r.url.replace(SITE, '')}\``).join(', ')
  const summary = (r: Result): string => `${r.status || 'error'} ${r.contentType.split(';')[0] || '-'} ${KB(r.bytes)}`

  const appendAll = sel('append-md')
  const langPerLang = sel('lang-md', (r) => !isAgnosticPage(r))
  const langAgnostic = sel('lang-md', isAgnosticPage)
  const neutralPerLang = sel('neutral-md', (r) => !agnosticOf(r))
  const neutralAgnostic = sel('neutral-md', agnosticOf)
  const missing = sel('missing-lang-md')
  const links = sel('llms-link')
  const docsLinks = links.filter((r) => r.url.startsWith(`${SITE}/docs/`))

  const unfiltered = neutralPerLang.filter((r) => r.ok && r.langTags > 0)
  const langTagsMax = Math.max(0, ...unfiltered.map((r) => r.langTags))
  const flowsNeutral = results.find((r) => r.url === neutralMd('flows'))
  const flowsLang = results.find((r) => r.url === langMd('js', 'flows'))
  const missingHtml = missing.filter((r) => r.status === 404 && r.html)
  const missingBytes = [...new Set(missing.map((r) => r.bytes))]
  const agnosticLangOk = langAgnostic.filter((r) => r.ok)
  const appendOk = appendAll.filter((r) => r.ok)
  const langDocsOk = langPerLang.filter((r) => r.ok)

  const linked = new Set(llmsUrls)
  const covered = pages.filter((p) => [...LANGS.map((l) => langMd(l, p.slug)), neutralMd(p.slug), p.url].some((u) => linked.has(u))).length
  const appendFail = failing(appendAll)[0]
  const missingFirst = missing[0]
  const verdicts: { id: string; claim: string; verdict: string; evidence: string }[] = [
    {
      id: 'F8',
      claim: 'llms.txt says "Append `.md` to any docs URL" but `<url>/.md` is 404 and only `/docs/js/flows.md` works',
      verdict: !claimsAppend ? 'unverified (llms.txt no longer says it)' : appendOk.length === 0 ? 'confirmed' : failing(appendAll).length === 0 ? 'refuted' : 'partly',
      evidence: `\`<canonical>.md\` ok on ${appendOk.length} of ${appendAll.length} pages (e.g. ${sample(failing(appendAll), 1)}: ${appendFail ? summary(appendFail) : '-'}); \`/docs/<lang>/<slug>.md\` ok on ${langDocsOk.length} of ${langPerLang.length} per-language pages`,
    },
    {
      id: 'F9',
      claim: 'language-agnostic pages 404 on `/docs/<lang>/<page>.md`',
      verdict: agnosticLangOk.length === 0 ? 'confirmed' : agnosticLangOk.length === langAgnostic.length ? 'refuted' : 'partly',
      evidence: `${agnostic.length} agnostic pages (${[...agnosticSlugs].join(', ')}): per-language form ok on ${agnosticLangOk.length} of ${langAgnostic.length}; \`/docs/<slug>.md\` ok on ${neutralAgnostic.filter((r) => r.ok).length} of ${neutralAgnostic.length}`,
    },
    {
      id: 'F10',
      claim: '`/docs/<page>.md` returns unfiltered MDX for all four languages',
      verdict: unfiltered.length === 0 ? 'refuted' : unfiltered.length === neutralPerLang.filter((r) => r.ok).length ? 'confirmed' : 'partly',
      evidence: `${unfiltered.length} of ${neutralPerLang.filter((r) => r.ok).length} no-language pages that return 200 contain \`<Lang\` tags (max ${langTagsMax}); \`/docs/flows.md\` is ${flowsNeutral ? `${KB(flowsNeutral.bytes)} with ${flowsNeutral.langTags} \`<Lang\` tags` : 'not tested'}, \`/docs/js/flows.md\` is ${flowsLang ? `${KB(flowsLang.bytes)} with ${flowsLang.langTags}` : 'not tested'}`,
    },
    {
      id: 'F30',
      claim: 'llms.txt has no page index',
      verdict: covered === 0 || covered / pages.length < 0.05 ? 'confirmed' : covered === pages.length ? 'refuted' : 'partly',
      evidence: `llms.txt links ${llmsUrls.length} URLs: ${docsLinks.length} under \`/docs/\` (the two examples), so ${covered} of ${pages.length} sitemap docs pages are linked; it lists bundles (\`llms-<lang>.txt\`, \`_llms-txt/*\`) and \`index.md\` but no per-page list.`,
    },
    {
      id: 'F32',
      claim: 'a missing per-language page returns a 42 KB HTML 404',
      verdict: missing.length === 0 ? 'unverified (no missing combinations)' : missingHtml.length === missing.length ? 'confirmed' : missingHtml.length === 0 ? 'refuted' : 'partly',
      evidence: `${missingHtml.length} of ${missing.length} slug/language gaps return a 404 HTML body; sizes ${missingBytes.map(KB).join(', ')}; e.g. ${sample(missing, 1)}: ${missingFirst ? summary(missingFirst) : '-'}`,
    },
  ]

  const row = (name: string, documented: string, rs: Result[], note: string): string => {
    const bad = failing(rs)
    return `| ${name} | ${documented} | ${rs.length} | ${rs.length - bad.length} | ${bad.length} | ${cell(note)} |`
  }
  const failNote = (rs: Result[]): string => {
    const bad = failing(rs)
    return bad.length === 0 ? '-' : `${sample(bad)}${bad.length > 3 ? ', ...' : ''}: ${summary(bad[0] as Result)}`
  }
  const typeBad = results.filter((r) => r.status === 200 && !isTextType(r.contentType) && r.form !== 'llms-link')

  const documentedFailures = results.filter((r) => r.documented && !r.ok)
  const date = new Date().toISOString().slice(0, 10)
  const md = [
    '# llms.txt URL forms',
    '',
    `Generated by \`scripts/llms-url-test.ts\` on ${date} against ${SITE}. Every row is a live fetch: status, content type and bytes are from the body read. A form passes when it returns 200 with \`text/markdown\` or \`text/plain\` and a body that is not HTML.`,
    '',
    `Evidence labels: **documented** forms are named by llms.txt itself (a failure fails the guard); **plausible** forms are ones agents try without llms.txt naming them. The sitemap lists ${pages.length} docs pages: ${perLang.length} per-language and ${agnostic.length} language-agnostic (${[...agnosticSlugs].join(', ')}).`,
    '',
    '## Claims from the external audit',
    '',
    '| Id | Claim | Verdict | Evidence |',
    '| --- | --- | --- | --- |',
    ...verdicts.map((v) => `| ${v.id} | ${cell(v.claim)} | **${v.verdict}** | ${cell(v.evidence)} |`),
    '',
    '## Forms tested',
    '',
    '| Form | Kind | Tested | Pass | Fail | First failures |',
    '| --- | --- | --- | --- | --- | --- |',
    row('URLs linked from llms.txt', 'documented', links, failNote(links)),
    row('`<canonical url>.md` (append `.md` to the docs URL)', claimsAppend ? 'documented' : 'plausible', appendAll, failNote(appendAll)),
    row('`/docs/<lang>/<slug>.md`, per-language pages', 'documented', langPerLang, failNote(langPerLang)),
    row('`/docs/<slug>.md`, per-language pages (no language)', 'plausible', neutralPerLang, failNote(neutralPerLang)),
    row('`/docs/<slug>.md`, language-agnostic pages', 'plausible', neutralAgnostic, failNote(neutralAgnostic)),
    row('`/docs/<lang>/<slug>.md`, language-agnostic pages', 'plausible', langAgnostic, failNote(langAgnostic)),
    row('`/docs/<lang>/<slug>.md`, page missing in that language', 'plausible', missing, failNote(missing)),
    '',
    `Content checks: ${typeBad.length} responses with status 200 had a type other than \`text/markdown\` or \`text/plain\`${typeBad.length ? ` (e.g. ${sample(typeBad)})` : ''}. ${unfiltered.length} of ${neutralPerLang.filter((r) => r.ok).length} no-language pages are unfiltered multi-language MDX${unfiltered.length ? ` (up to ${langTagsMax} \`<Lang\` tags)` : ''}. ${missingHtml.length} of ${missing.length} missing-language requests return an HTML 404 body.`,
    '',
    '## Documented forms that fail',
    '',
    documentedFailures.length === 0
      ? 'None.'
      : [
          '| Form | URL | Result |',
          '| --- | --- | --- |',
          ...documentedFailures.slice(0, 40).map((r) => `| ${r.form} | \`${r.url.replace(SITE, '')}\` | ${cell(r.error ?? summary(r))} |`),
          ...(documentedFailures.length > 40 ? [`| ... | ${documentedFailures.length - 40} more | |`] : []),
        ].join('\n'),
    '',
    `Guard: ${documentedFailures.length === 0 ? 'pass' : `fail (${documentedFailures.length} documented checks)`}.`,
    '',
  ].join('\n')
  writeFileSync(OUT, md)
  console.log(verdicts.map((v) => `${v.id} ${v.verdict}`).join('\n'))
  console.log(`llms-url-test: ${documentedFailures.length} documented forms fail (${results.length} checks); wrote LLMS-URLS.md`)
  return documentedFailures.length === 0 ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`llms-url-test: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  },
)
