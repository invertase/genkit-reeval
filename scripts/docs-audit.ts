import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** `unverified` means a fetch failed and the claim could not be checked; `-` means the row has no external claim. */
type Verdict = 'confirmed' | 'refuted' | 'partly' | 'unverified' | '-'

type Fetched = { url: string; ok: boolean; status: number; finalUrl: string; text: string; error?: string }

type Repo = { repo: string; sha: string; paths: string[]; error?: string }

type Finding = { rank: number; text: string }

const OUT = fileURLToPath(new URL('../DOCS-AUDIT.md', import.meta.url))
const VENDORED_RULES = fileURLToPath(new URL('../evals/rules/GENKIT.md', import.meta.url))
const PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url))
const LANGS = ['js', 'go', 'python', 'dart'] as const
type Lang = (typeof LANGS)[number]

const SITE = 'https://genkit.dev'
const DEVELOP_HTML = `${SITE}/docs/js/develop-with-ai/`
const DEVELOP_MD = `${SITE}/docs/js/develop-with-ai.md`
const developMdFor = (l: Lang): string => `${SITE}/docs/${l}/develop-with-ai.md`
const DEVELOP_NEUTRAL = `${SITE}/docs/develop-with-ai`

const errMsg = (err: unknown): string =>
  err instanceof Error ? `${err.message}${err.cause instanceof Error ? ` (${err.cause.message})` : ''}` : String(err)

const cell = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()

const code = (s: string): string => `\`${s.replace(/`/g, "'")}\``

const count = (text: string, needle: string): number => (needle ? text.split(needle).length - 1 : 0)

/** Short quote around the first occurrence of `needle`, cut at word boundaries, or an empty string. */
function excerpt(text: string, needle: string | RegExp, radius = 60): string {
  const m = typeof needle === 'string' ? (text.indexOf(needle) < 0 ? null : { index: text.indexOf(needle), len: needle.length }) : regexHit(text, needle)
  if (!m) return ''
  const hitEnd = m.index + m.len
  let from = Math.max(0, m.index - radius)
  let to = Math.min(text.length, hitEnd + radius)
  while (from > 0 && from < m.index && !/\s/.test(text[from - 1] ?? ' ')) from++
  while (to < text.length && to > hitEnd && !/\s/.test(text[to] ?? ' ')) to--
  return text.slice(from, to).replace(/\s+/g, ' ').trim()
}

function regexHit(text: string, re: RegExp): { index: number; len: number } | null {
  const m = new RegExp(re.source, re.flags.replace('g', '')).exec(text)
  return m ? { index: m.index, len: m[0].length } : null
}

async function fetchText(url: string): Promise<Fetched> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(90_000) })
    const text = await res.text()
    return { url, ok: res.ok, status: res.status, finalUrl: res.url, text }
  } catch (err) {
    return { url, ok: false, status: 0, finalUrl: url, text: '', error: errMsg(err) }
  }
}

/** Follows redirects by hand so every hop is recorded. */
async function redirectChain(url: string): Promise<string[]> {
  const hops: string[] = []
  let next = url
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(next, { redirect: 'manual', signal: AbortSignal.timeout(60_000) })
      const loc = res.headers.get('location')
      hops.push(`${res.status} ${next}${loc ? ` -> ${loc}` : ''}`)
      if (!loc || res.status < 300 || res.status > 399) break
      next = new URL(loc, next).toString()
    } catch (err) {
      hops.push(`error ${next}: ${errMsg(err)}`)
      break
    }
  }
  return hops
}

async function cmd(file: string, args: string[]): Promise<{ ok: boolean; out: string; error?: string }> {
  try {
    const { stdout } = await run(file, args, { maxBuffer: 256 * 1024 * 1024, timeout: 180_000 })
    return { ok: true, out: stdout }
  } catch (err) {
    return { ok: false, out: '', error: errMsg(err) }
  }
}

const gh = (path: string, raw = false) => cmd('gh', ['api', path, ...(raw ? ['-H', 'Accept: application/vnd.github.raw'] : [])])

/** Pins a repo to the default branch head and lists every path in the tree at that commit. */
async function snapshot(repo: string): Promise<Repo> {
  const head = await gh(`repos/${repo}/commits/HEAD`)
  if (!head.ok) return { repo, sha: '', paths: [], error: head.error }
  const sha = (JSON.parse(head.out) as { sha: string }).sha
  const tree = await gh(`repos/${repo}/git/trees/${sha}?recursive=1`)
  if (!tree.ok) return { repo, sha, paths: [], error: tree.error }
  const paths = (JSON.parse(tree.out) as { tree: { path: string }[] }).tree.map((t) => t.path).sort()
  return { repo, sha, paths }
}

const ghReadme = async (r: Repo): Promise<string> =>
  r.sha ? (await gh(`repos/${r.repo}/readme?ref=${r.sha}`, true)).out : ''

/** `ai.chat(` calls inside fenced code, per page, skipping pages whose first block is `:::danger[Deprecated]`. */
function liveChatExamples(text: string): { total: number; pages: Map<string, number> } {
  const pages = new Map<string, number>()
  let total = 0
  let fenced = false
  let title = ''
  let deprecated = false
  let awaitingFirstLine = false
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (!fenced && /^# \S/.test(line)) {
      title = line.slice(2).trim()
      deprecated = false
      awaitingFirstLine = true
      continue
    }
    if (awaitingFirstLine && line.trim()) {
      deprecated = line.trim().startsWith(':::danger[Deprecated]')
      awaitingFirstLine = false
    }
    if (fenced && !deprecated) {
      const n = line.match(/\bai\.chat\(/g)?.length ?? 0
      if (n > 0) {
        pages.set(title, (pages.get(title) ?? 0) + n)
        total += n
      }
    }
  }
  return { total, pages }
}

const FRAMED_AS_OLD = /\b(previous|replacement|replaces|formerly|migrat\w*)\b/i

/** Lines mentioning `needle` that do not frame it as the previous package or as being replaced. */
const liveMentions = (text: string, needle: string): string[] =>
  text.split('\n').filter((l) => l.includes(needle) && !FRAMED_AS_OLD.test(l))

const skillNames = (text: string): string[] => [...new Set(text.match(/developing-genkit-[a-z]+/g) ?? [])].sort()

function modelTally(text: string): Map<string, number> {
  const tally = new Map<string, number>()
  const re = /gemini-\d+(?:\.\d+)?(?:-[a-z0-9]+(?:\.\d+)?)*|gemini-(?:flash|pro)(?:-lite)?-latest/g
  for (const m of text.matchAll(re)) tally.set(m[0], (tally.get(m[0]) ?? 0) + 1)
  return tally
}

function tallyText(tally: Map<string, number>, limit = 12): string {
  if (tally.size === 0) return 'none'
  const sorted = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const shown = sorted.slice(0, limit).map(([k, v]) => `${code(k)} x${v}`)
  return shown.join(', ') + (sorted.length > limit ? `, +${sorted.length - limit} more` : '')
}

const sumKeys = (tally: Map<string, number>, match: (key: string) => boolean): number =>
  [...tally].filter(([k]) => match(k)).reduce((n, [, v]) => n + v, 0)

const sumPrefix = (tally: Map<string, number>, prefix: string): number => sumKeys(tally, (k) => k.startsWith(prefix))

/** Number of lines only in `a` and only in `b`, from the longest common subsequence. */
function lineDiff(a: string[], b: string[]): { removed: number; added: number } {
  const w = b.length + 1
  const dp = new Uint32Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * w + j] =
        a[i] === b[j] ? (dp[(i + 1) * w + j + 1] ?? 0) + 1 : Math.max(dp[(i + 1) * w + j] ?? 0, dp[i * w + j + 1] ?? 0)
    }
  }
  const common = dp[0] ?? 0
  return { removed: a.length - common, added: b.length - common }
}

function table(headers: string[], rows: string[][]): string {
  const line = (r: string[]) => `| ${r.map(cell).join(' | ')} |`
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n')
}

const fetchNote = (f: Fetched): string => (f.error ? `FETCH FAILED: ${f.error}` : f.ok ? `${f.status}` : `HTTP ${f.status}`)

const verdictOf = (f: Fetched, hit: boolean): Verdict => (f.ok ? (hit ? 'confirmed' : 'refuted') : 'unverified')

const findings: Finding[] = []
const addFinding = (rank: number, text: string) => findings.push({ rank, text })

const fetchedAt = new Date().toISOString()

const cliVersion = (JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as { devDependencies?: Record<string, string> }).devDependencies?.['genkit-cli'] ?? 'unknown'
const npmGenkit = await cmd('npm', ['view', 'genkit', 'version'])
const genkitVersion = npmGenkit.ok ? npmGenkit.out.trim() : ''

const [develop, developNeutral, rulesJs, rulesGo, index, ...rest] = await Promise.all([
  fetchText(DEVELOP_HTML),
  fetchText(DEVELOP_NEUTRAL),
  fetchText(`${SITE}/GENKIT.js.md`),
  fetchText(`${SITE}/GENKIT.go.md`),
  fetchText(`${SITE}/llms.txt`),
  ...LANGS.map((l) => fetchText(`${SITE}/llms-${l}.txt`)),
  ...LANGS.map((l) => fetchText(developMdFor(l))),
])
const bundle = Object.fromEntries(LANGS.map((l, i) => [l, rest[i] as Fetched])) as Record<Lang, Fetched>
const developByLang = Object.fromEntries(LANGS.map((l, i) => [l, rest[LANGS.length + i] as Fetched])) as Record<Lang, Fetched>
const developMd = developByLang.js

const [genkitRepo, skillsRepo, googleSkills] = await Promise.all([
  snapshot('genkit-ai/genkit'),
  snapshot('genkit-ai/skills'),
  snapshot('google/skills'),
])
const [genkitReadme, skillsReadme] = await Promise.all([ghReadme(genkitRepo), ghReadme(skillsRepo)])

const sections: string[] = []

{
  const treeSkills = skillsRepo.paths
    .map((p) => /^skills\/([^/]+)\/SKILL\.md$/.exec(p)?.[1])
    .filter((n): n is string => Boolean(n))
    .sort()
  const googleGenkit = googleSkills.paths.filter((p) => /genkit[^/]*\/SKILL\.md$/.test(p))
  const pyPath = 'skills/cloud/developing-genkit-python/SKILL.md'
  const googlePy = googleSkills.paths.includes(pyPath)
  const installCmd = 'npx skills add genkit-ai/skills'
  const installsAll = skillsReadme.includes(installCmd) && treeSkills.length > 0

  const verdictFor = (names: string[], ok: boolean): Verdict => {
    if (!ok || treeSkills.length === 0) return 'unverified'
    const have = names.filter((n) => treeSkills.includes(n)).length
    return have === treeSkills.length ? 'refuted' : have > 0 ? 'partly' : 'confirmed'
  }

  const pageRows = LANGS.map((l) => {
    const f = developByLang[l]
    const own = `developing-genkit-${l}`
    const names = skillNames(f.text)
    const hasOwn = names.includes(own)
    const hasInstall = f.text.includes(installCmd)
    const verdict: Verdict = !f.ok ? 'unverified' : hasOwn || hasInstall ? 'refuted' : 'confirmed'
    return { l, f, own, names, hasOwn, hasInstall, verdict }
  })

  const sources: { src: string; names: string[]; ok: boolean; note: string; reference?: true }[] = [
    { src: `https://github.com/genkit-ai/genkit README @ ${genkitRepo.sha.slice(0, 10)}`, names: skillNames(genkitReadme), ok: genkitReadme !== '', note: genkitRepo.error ?? 'ok' },
    { src: `https://github.com/genkit-ai/skills README @ ${skillsRepo.sha.slice(0, 10)}`, names: skillNames(skillsReadme), ok: skillsReadme !== '', note: skillsRepo.error ?? 'ok' },
    { src: `https://github.com/genkit-ai/skills tree @ ${skillsRepo.sha.slice(0, 10)}`, names: treeSkills, ok: treeSkills.length > 0, note: skillsRepo.error ?? 'ok', reference: true },
    { src: `https://github.com/google/skills tree @ ${googleSkills.sha.slice(0, 10)}`, names: googleGenkit.map((p) => /([^/]+)\/SKILL\.md$/.exec(p)?.[1] ?? p), ok: googleSkills.paths.length > 0, note: googleSkills.error ?? 'ok' },
  ]

  const rows = sources.map((s) => [
    s.src,
    s.names.length ? s.names.map(code).join(', ') : 'none',
    s.note,
    s.reference ? '-' : verdictFor(s.names, s.ok),
  ])

  sections.push(
    '## 1. Which skills exist, per source',
    '',
    `Claim: an agent that starts from a language's ${code('develop-with-ai')} page cannot find that language's skill. Verdict per page: \`refuted\` if the page names the skill for its own language or shows ${code(installCmd)}, \`confirmed\` if it does neither, \`unverified\` if the fetch failed. The genkit-ai/skills tree is the reference (from source, pinned sha ${code(skillsRepo.sha || 'unavailable')}); ${code(installCmd)} ${installsAll ? 'appears in the skills README and the tree holds ' + treeSkills.length + ' skills' : 'could not be matched against the skills README'}.`,
    '',
    table(
      ['Docs page', 'Fetch', 'Skills named', 'Own-language skill', `Shows ${installCmd}`, 'Verdict'],
      pageRows.map((r) => [
        developMdFor(r.l),
        fetchNote(r.f),
        r.names.length ? r.names.map(code).join(', ') : 'none',
        r.f.ok ? `${code(r.own)} ${r.hasOwn ? 'named' : 'not named'}` : '-',
        r.f.ok ? (r.hasInstall ? 'yes' : 'no') : '-',
        r.verdict,
      ]),
    ),
    '',
    'Other sources. Verdict: `confirmed` if the source names none of the skills in the reference tree, `partly` if it names some, `refuted` if it names all.',
    '',
    table(['Source', 'Skills named', 'Fetch', 'Verdict'], rows),
    '',
    table(
      ['Claim', 'Evidence', 'Verdict'],
      [
        [
          'google/skills carries developing-genkit-python',
          googleSkills.error ? `FETCH FAILED: ${googleSkills.error}` : `${code(pyPath)} ${googlePy ? 'present' : 'absent'}; genkit paths found: ${googleGenkit.length ? googleGenkit.map(code).join(', ') : 'none'} (sha ${code(googleSkills.sha)})`,
          googleSkills.error ? 'unverified' : googlePy ? 'confirmed' : 'refuted',
        ],
      ],
    ),
    '',
  )
  const blind = pageRows.filter((r) => r.verdict === 'confirmed')
  if (blind.length) {
    addFinding(2, `${blind.map((r) => `${developMdFor(r.l)} (names ${r.names.map(code).join(', ') || 'no skill'}, no ${code(installCmd)})`).join('; ')} give an agent no way to find the skill for that language. The genkit-ai/skills tree has ${treeSkills.map(code).join(', ')}.`)
  }
}

{
  const needles = ['init:ai-tools', 'Genkit Node.js API Rules', 'v1.20.0', 'GENKIT.md']
  const pages: [string, Fetched][] = [
    [DEVELOP_NEUTRAL, developNeutral],
    [DEVELOP_HTML, develop],
    [DEVELOP_MD, developMd],
  ]
  const rows = pages.flatMap(([url, f]) =>
    needles.map((n) => [
      f.finalUrl === url ? url : `${url} (final ${f.finalUrl})`,
      code(n),
      f.ok ? String(count(f.text, n)) : fetchNote(f),
      f.ok ? code(excerpt(f.text, n)) || '-' : '-',
      n === 'init:ai-tools' || n === 'v1.20.0' || n === 'Genkit Node.js API Rules' ? verdictOf(f, count(f.text, n) > 0) : '-',
    ]),
  )
  sections.push(
    '## 2. Stale content on /docs/develop-with-ai',
    '',
    'Claim: the page still documents `genkit init:ai-tools` and embeds "Genkit Node.js API Rules (v1.20.0)". Verdict `confirmed` means the text is on the fetched page.',
    '',
    table(['Page', 'Needle', 'Count', 'Excerpt', 'Verdict'], rows),
    '',
  )
  const hit = [develop, developMd, developNeutral].some((f) => f.ok && count(f.text, 'init:ai-tools') > 0)
  if (hit) addFinding(5, `${DEVELOP_NEUTRAL} still mentions ${code('init:ai-tools')}.`)
}

{
  const needles = ['ai.chat(', '@genkit-ai/googleai', '@genkit-ai/vertexai', 'genkitx-mcp', 'init:ai-tools', 'github.com/firebase/genkit/go', 'github.com/genkit-ai/genkit/go']
  const files: [string, Fetched][] = [
    [`${SITE}/GENKIT.js.md`, rulesJs],
    [`${SITE}/GENKIT.go.md`, rulesGo],
  ]
  const rows = files.map(([url, f]) => {
    const title = f.text.split('\n').find((l) => l.trim()) ?? ''
    const version = /\(v?(\d+\.\d+\.\d+)\)/.exec(title)?.[1] ?? 'none in title'
    return [
      url,
      f.ok ? `${f.text.length} bytes` : fetchNote(f),
      code(title),
      version,
      f.ok ? needles.map((n) => `${code(n)} x${count(f.text, n)}`).join(', ') : '-',
      f.ok ? tallyText(modelTally(f.text)) : '-',
    ]
  })

  let diffRows: string[][] = []
  let cliTemplate = ''
  try {
    cliTemplate = (createRequire(import.meta.url)('genkit-cli/dist/commands/init-ai-tools/context/nodejs.js') as { GENKIT_CONTEXT: string }).GENKIT_CONTEXT
  } catch {}
  try {
    const vendored = readFileSync(VENDORED_RULES, 'utf8')
    if (rulesJs.ok) {
      const d = lineDiff(vendored.split('\n'), rulesJs.text.split('\n'))
      const vTitle = vendored.split('\n').find((l) => l.trim()) ?? ''
      diffRows = [
        [
          `GENKIT.js.md vs evals/rules/GENKIT.md (${cliTemplate.trim() === vendored.trim() ? `identical to the template in the installed genkit-cli ${cliVersion}` : 'not matched against the installed genkit-cli template'})`,
          `${d.removed} lines only in vendored, ${d.added} lines only on website (vendored ${vendored.split('\n').length} lines, website ${rulesJs.text.split('\n').length})`,
          `vendored title ${code(vTitle)}`,
          modelTally(vendored).size ? `vendored models: ${tallyText(modelTally(vendored))}` : '-',
        ],
      ]
      const webTitle = rulesJs.text.split('\n').find((l) => l.trim()) ?? ''
      const webVersion = /\(v?(\d+\.\d+\.\d+)\)/.exec(webTitle)?.[1]
      const sameTitle = webTitle.trim() === vTitle.trim()
      const parts = [
        webVersion ? `The website rules file ${SITE}/GENKIT.js.md is titled ${code(webTitle)}${genkitVersion ? `, while ${code('npm view genkit version')} is ${genkitVersion} (repo CLI pin ${code(`genkit-cli ${cliVersion}`)})` : ''}.` : '',
        d.removed + d.added > 0 ? `It differs by ${d.removed} + ${d.added} lines from ${code('evals/rules/GENKIT.md')}${cliTemplate.trim() === vendored.trim() ? `, the template ${code('genkit init:ai-tools')} writes in genkit-cli ${cliVersion}` : ''}${sameTitle ? ', yet both carry the same title, so an agent cannot tell which is current' : ''}.` : '',
      ].filter(Boolean)
      if (parts.length) addFinding(3, parts.join(' '))
    }
  } catch (err) {
    diffRows = [['GENKIT.js.md vs vendored copy', `COMPARE FAILED: ${errMsg(err)}`, '-', '-']]
  }

  sections.push(
    '## 3. Hosted rules files',
    '',
    table(['URL', 'Size', 'Title line', 'Version in title', 'Needle counts', 'Gemini models'], rows),
    '',
    table(['Comparison', 'Diff size (line level, from source)', 'Titles', 'Models'], diffRows),
    '',
  )

  for (const [url, f] of files) {
    if (!f.ok) continue
    const bad = ['ai.chat(', 'genkitx-mcp'].filter((n) => count(f.text, n) > 0)
    if (liveMentions(f.text, '@genkit-ai/googleai').length) bad.push('@genkit-ai/googleai')
    if (bad.length) addFinding(3, `${url} contains ${bad.map(code).join(', ')}.`)
  }
}

{
  const sources: [string, Fetched][] = [['index', index], ...LANGS.map((l): [string, Fetched] => [l, bundle[l]])]
  const goPaths = ['github.com/firebase/genkit/go', 'github.com/genkit-ai/genkit/go']
  const pkgNeedles = ['@genkit-ai/googleai', '@genkit-ai/vertexai', 'genkitx-mcp', 'ai.chat(', 'init:ai-tools']

  const modelRows = sources.map(([name, f]) => {
    const t = modelTally(f.text)
    return [
      `${SITE}/${name === 'index' ? 'llms.txt' : `llms-${name}.txt`}`,
      f.ok ? `${f.text.length} bytes` : fetchNote(f),
      f.ok ? tallyText(t) : '-',
      f.ok ? `1.5: ${sumPrefix(t, 'gemini-1.5')}, 2.0: ${sumPrefix(t, 'gemini-2.0')}, 2.5: ${sumPrefix(t, 'gemini-2.5')}, 3: ${sumPrefix(t, 'gemini-3')}, latest aliases: ${sumKeys(t, (k) => k.endsWith('-latest'))}` : '-',
    ]
  })

  const pkgRows = sources.map(([name, f]) => [
    name,
    ...pkgNeedles.map((n) => (f.ok ? String(count(f.text, n)) : 'n/a')),
    f.ok ? String(liveMentions(f.text, '@genkit-ai/googleai').length) : 'n/a',
  ])

  const goRows = sources.map(([name, f]) => [
    name,
    ...goPaths.map((n) => (f.ok ? String(count(f.text, n)) : 'n/a')),
  ])

  const labelRe = /Agents API is in \*\*(\w+)\.?\*\*/g
  const agentRows = LANGS.map((l) => {
    const f = bundle[l]
    const labels = new Map<string, number>()
    for (const m of f.text.matchAll(labelRe)) labels.set((m[1] ?? '').toLowerCase(), (labels.get((m[1] ?? '').toLowerCase()) ?? 0) + 1)
    const fallback = f.text
      .split('\n')
      .find((line) => /\bagents?\b/i.test(line) && /\b(experimental|beta|preview)\b/i.test(line) && !/gemini-/.test(line))
    return [
      l,
      f.ok ? ([...labels].map(([k, v]) => `${code(k)} x${v}`).join(', ') || 'no "Agents API is in **X**" sentence') : fetchNote(f),
      f.ok ? `genkit/beta x${count(f.text, 'genkit/beta')}, genkit/experimental x${count(f.text, 'genkit/experimental')}, experimental.dart x${count(f.text, 'experimental.dart')}` : '-',
      f.ok ? (labels.size ? '-' : code((fallback ?? '').slice(0, 220)) || '-') : '-',
    ]
  })

  sections.push(
    '## 4. llms.txt and the per-language bundles',
    '',
    '### 4a. Gemini model names',
    '',
    table(['URL', 'Size', 'Models by count', 'Families'], modelRows),
    '',
    '### 4b. Watched package names and commands (occurrence counts)',
    '',
    'Raw substring counts. Candidate findings count `ai.chat(` only in fenced code on pages not marked deprecated.',
    '',
    table(['Bundle', ...pkgNeedles.map(code), '`@genkit-ai/googleai` lines not framed as previous or replacement'], pkgRows),
    '',
    '### 4c. Go module path (occurrence counts)',
    '',
    table(['Bundle', ...goPaths.map(code)], goRows),
    '',
    '### 4d. Stability label for the Agents API',
    '',
    table(['Language', 'Label sentence', 'Import markers', 'Fallback line (when no sentence)'], agentRows),
    '',
  )

  for (const l of LANGS) {
    const f = bundle[l]
    if (!f.ok) continue
    const t = modelTally(f.text)
    const old = sumPrefix(t, 'gemini-1.5') + sumPrefix(t, 'gemini-2.0')
    if (old > 0) addFinding(1, `${SITE}/llms-${l}.txt uses retired or retiring models: ${sumPrefix(t, 'gemini-1.5')} x ${code('gemini-1.5*')}, ${sumPrefix(t, 'gemini-2.0')} x ${code('gemini-2.0*')} (top: ${tallyText(t, 4)}).`)
    const chat = liveChatExamples(f.text)
    if (chat.total > 0) {
      const notice = /The `ai\.chat\(\)` API is deprecated\./.exec(f.text)?.[0]
      addFinding(1, `${SITE}/llms-${l}.txt has ${chat.total} x ${code('ai.chat(')} in fenced code on pages not marked deprecated: ${[...chat.pages].map(([t, n]) => `"${t}" (${n})`).join(', ')}${notice ? `, although the same bundle says ${code(notice)}` : ''}.`)
    }
    const goog = liveMentions(f.text, '@genkit-ai/googleai')
    if (goog.length > 0) addFinding(5, `${SITE}/llms-${l}.txt names ${code('@genkit-ai/googleai')} ${goog.length} x outside previous/replacement framing: ${code(excerpt(f.text, goog[0] ?? '', 50))}.`)
    const mcp = count(f.text, 'genkitx-mcp')
    if (mcp > 0) addFinding(3, `${SITE}/llms-${l}.txt names ${code('genkitx-mcp')} ${mcp} x.`)
  }
  if (bundle.go.ok) {
    const fb = count(bundle.go.text, goPaths[0] ?? '')
    const ga = count(bundle.go.text, goPaths[1] ?? '')
    if (fb > 0 && ga > 0) addFinding(2, `${SITE}/llms-go.txt uses both Go module paths: ${fb} x ${code(goPaths[0] ?? '')} and ${ga} x ${code(goPaths[1] ?? '')}.`)
  }
  const labelsByLang = LANGS.map((l) => [...bundle[l].text.matchAll(labelRe)].map((m) => (m[1] ?? '').toLowerCase()))
  const distinct = new Set(labelsByLang.flat())
  const withoutLabel = LANGS.filter((_, i) => bundle[LANGS[i] as Lang].ok && (labelsByLang[i] ?? []).length === 0)
  if (distinct.size > 1 || withoutLabel.length) addFinding(3, `The Agents API stability label differs by language: ${LANGS.map((l, i) => `${l}: ${[...new Set(labelsByLang[i])].join('/') || 'no label sentence'}`).join('; ')}.`)
}

{
  const legacy = 'https://firebase.google.com/docs/genkit'
  const [f, chain] = await Promise.all([fetchText(legacy), redirectChain(legacy)])
  const needles = ['@genkit-ai/googleai', 'gemini20Flash', 'gemini-2.0-flash']
  sections.push(
    '## 5. Legacy pages',
    '',
    table(
      ['URL', 'Redirect chain', 'Final URL', 'Status', 'Needles on final page', 'Verdict'],
      [[
        legacy,
        chain.join(' ; '),
        f.finalUrl,
        fetchNote(f),
        f.ok ? needles.map((n) => `${code(n)} x${count(f.text, n)}`).join(', ') : '-',
        f.ok ? (needles.some((n) => count(f.text, n) > 0) ? 'confirmed' : 'refuted') : 'unverified',
      ]],
    ),
    '',
    'Verdict: `confirmed` if the page an agent lands on still shows the old package or model; `refuted` if it redirects away and none appear.',
    '',
  )
  if (f.ok && needles.some((n) => count(f.text, n) > 0)) addFinding(3, `${legacy} still shows legacy identifiers.`)
}

{
  const pkgs = ['@genkit-ai/googleai', '@genkit-ai/google-genai', '@genkit-ai/vertexai', 'genkitx-mcp', '@genkit-ai/mcp', 'genkit-cli']
  const rows = await Promise.all(
    pkgs.map(async (p) => {
      const r = await cmd('npm', ['view', p, 'version', 'deprecated', 'dist-tags', 'time.modified', '--json'])
      if (!r.ok) return { p, version: '-', deprecated: '', tags: '-', note: `FAILED: ${(r.error ?? '').split('\n')[0]}` }
      try {
        const j = JSON.parse(r.out) as { version?: string; deprecated?: string; 'dist-tags'?: Record<string, string>; 'time.modified'?: string }
        return {
          p,
          version: j.version ?? '-',
          deprecated: j.deprecated ?? '',
          tags: Object.entries(j['dist-tags'] ?? {}).map(([k, v]) => `${k}=${v}`).join(', '),
          note: j['time.modified'] ?? '',
        }
      } catch (err) {
        return { p, version: '-', deprecated: '', tags: '-', note: `PARSE FAILED: ${errMsg(err)}` }
      }
    }),
  )
  sections.push(
    '## 6. npm facts (`npm view`, latest dist-tag)',
    '',
    table(['Package', 'Latest', 'Deprecation message', 'dist-tags', 'Last modified'], rows.map((r) => [r.p, r.version, r.deprecated ? code(r.deprecated) : 'not deprecated', r.tags, r.note])),
    '',
  )
  for (const r of rows) {
    if (r.version !== '-' && !r.deprecated && r.p === 'genkitx-mcp') {
      addFinding(4, `npm shows no deprecation for ${code(r.p)} (latest ${r.version}), although ${code('@genkit-ai/mcp')} is the maintained package; nothing at install time warns an agent off it.`)
    }
  }
}

{
  const mods = ['github.com/firebase/genkit/go', 'github.com/genkit-ai/genkit/go']
  const results = await Promise.all(mods.map((m) => fetchText(`https://proxy.golang.org/${m}/@latest`)))
  const goMods = await Promise.all(
    mods.map((m, i) => {
      const version = (/"Version":"([^"]+)"/.exec((results[i] as Fetched).text) ?? [])[1]
      return version ? fetchText(`https://proxy.golang.org/${m}/@v/${version}.mod`) : Promise.resolve(undefined)
    }),
  )
  const declared = (f: Fetched | undefined): string => (f?.ok ? (/^module\s+(\S+)/m.exec(f.text)?.[1] ?? 'none') : 'n/a')
  sections.push(
    '## 7. Go module proxy',
    '',
    table(
      ['Module requested', 'URL', 'Status', 'Response', 'Resolves', 'go.mod declares', 'Path matches'],
      mods.map((m, i) => {
        const f = results[i] as Fetched
        const d = declared(goMods[i])
        return [m, f.url, fetchNote(f), code(f.text.trim().slice(0, 160)) || '-', f.error ? 'unverified' : f.ok ? 'yes' : 'no', d, d === 'n/a' ? 'unverified' : d === m ? 'yes' : 'no']
      }),
    ),
    '',
  )
  const mismatch = mods.filter((m, i) => results[i]?.ok && declared(goMods[i]) !== 'n/a' && declared(goMods[i]) !== m)
  const usedInDocs = (m: string): number => LANGS.reduce((n, l) => n + count(bundle[l].text, m), 0) + count(index.text, m)
  for (const m of mismatch) addFinding(3, `${code(m)} (the path an agent would guess from the repo URL github.com/genkit-ai/genkit) resolves on proxy.golang.org but its go.mod declares ${code(declared(goMods[mods.indexOf(m)]))}, so ${code(`go get ${m}`)} fails with a module path mismatch. The fetched llms bundles use it ${usedInDocs(m)} x.`)
  const ok = mods.filter((_, i) => (results[i] as Fetched).ok)
  if (ok.length === 1 && bundle.go.ok) {
    const bad = mods.find((m) => !ok.includes(m)) ?? ''
    if (count(bundle.go.text, bad) > 0) addFinding(1, `${code(bad)} does not resolve on proxy.golang.org, yet ${SITE}/llms-go.txt uses it ${count(bundle.go.text, bad)} times.`)
  }
}

const ranked = [...findings].sort((a, b) => a.rank - b.rank)
const head = [
  '# Genkit docs audit',
  '',
  `Fetched: ${fetchedAt} (UTC). Regenerate with ${code('pnpm -s tsx scripts/docs-audit.ts')}.`,
  '',
  'Every fact below is **live**: fetched from the URL shown at the time above, or read from a GitHub tree pinned by commit sha. No agent ran. Verdicts say whether an external claim holds against the fetched text; `unverified` means a fetch failed.',
  '',
  'Pinned commits:',
  '',
  ...[genkitRepo, skillsRepo, googleSkills].map((r) => `- ${r.repo}: ${r.sha ? code(r.sha) : `unavailable (${r.error ?? 'unknown'})`}`),
  '',
  '## Candidate findings',
  '',
  'Ranked by how likely a coding agent is to trip on it. Rank 1 breaks code, rank 5 is noise.',
  '',
  ...(ranked.length ? ranked.map((f, i) => `${i + 1}. (rank ${f.rank}) ${f.text}`) : ['None triggered.']),
  '',
]

const md = [...head, ...sections].join('\n').replace(/[\u2013\u2014]/g, '-').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
writeFileSync(OUT, md)
console.log(`wrote ${OUT} (${ranked.length} candidate findings)`)
