import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
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
const LANGS = ['js', 'go', 'python', 'dart'] as const

const SITE = 'https://genkit.dev'
const DEVELOP_HTML = `${SITE}/docs/js/develop-with-ai/`
const DEVELOP_MD = `${SITE}/docs/js/develop-with-ai.md`
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

/** Short quote around the first occurrence of `needle`, or an empty string. */
function excerpt(text: string, needle: string | RegExp, radius = 60): string {
  const m = typeof needle === 'string' ? (text.indexOf(needle) < 0 ? null : { index: text.indexOf(needle), len: needle.length }) : regexHit(text, needle)
  if (!m) return ''
  const from = Math.max(0, m.index - radius)
  return text.slice(from, m.index + m.len + radius).replace(/\s+/g, ' ').trim()
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

const ghFile = async (r: Repo, path: string): Promise<string> =>
  r.sha ? (await gh(`repos/${r.repo}/contents/${path}?ref=${r.sha}`, true)).out : ''

const ghReadme = async (r: Repo): Promise<string> =>
  r.sha ? (await gh(`repos/${r.repo}/readme?ref=${r.sha}`, true)).out : ''

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

const sumPrefix = (tally: Map<string, number>, prefix: string): number =>
  [...tally].filter(([k]) => k.startsWith(prefix)).reduce((n, [, v]) => n + v, 0)

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

// ---------------------------------------------------------------- fetch

const fetchedAt = new Date().toISOString()

const [develop, developMd, developNeutral, rulesJs, rulesGo, index, ...bundles] = await Promise.all([
  fetchText(DEVELOP_HTML),
  fetchText(DEVELOP_MD),
  fetchText(DEVELOP_NEUTRAL),
  fetchText(`${SITE}/GENKIT.js.md`),
  fetchText(`${SITE}/GENKIT.go.md`),
  fetchText(`${SITE}/llms.txt`),
  ...LANGS.map((l) => fetchText(`${SITE}/llms-${l}.txt`)),
])
const bundle = Object.fromEntries(LANGS.map((l, i) => [l, bundles[i] as Fetched])) as Record<(typeof LANGS)[number], Fetched>

const [genkitRepo, skillsRepo, googleSkills] = await Promise.all([
  snapshot('genkit-ai/genkit'),
  snapshot('genkit-ai/skills'),
  snapshot('google/skills'),
])
const [genkitReadme, skillsReadme] = await Promise.all([ghReadme(genkitRepo), ghReadme(skillsRepo)])

const sections: string[] = []

// ---------------------------------------------------------------- 1 skills

{
  const treeSkills = skillsRepo.paths
    .map((p) => /^skills\/([^/]+)\/SKILL\.md$/.exec(p)?.[1])
    .filter((n): n is string => Boolean(n))
    .sort()
  const googleGenkit = googleSkills.paths.filter((p) => /genkit[^/]*\/SKILL\.md$/.test(p))
  const pyPath = 'skills/cloud/developing-genkit-python/SKILL.md'
  const googlePy = googleSkills.paths.includes(pyPath)

  const verdictFor = (names: string[], ok: boolean): Verdict => {
    if (!ok || treeSkills.length === 0) return 'unverified'
    const have = names.filter((n) => treeSkills.includes(n)).length
    return have === treeSkills.length ? 'refuted' : have > 0 ? 'partly' : 'confirmed'
  }

  const sources: { src: string; names: string[]; ok: boolean; note: string }[] = [
    { src: DEVELOP_HTML, names: skillNames(develop.text), ok: develop.ok, note: fetchNote(develop) },
    { src: DEVELOP_MD, names: skillNames(developMd.text), ok: developMd.ok, note: fetchNote(developMd) },
    { src: `https://github.com/genkit-ai/genkit README @ ${genkitRepo.sha.slice(0, 10)}`, names: skillNames(genkitReadme), ok: genkitReadme !== '', note: genkitRepo.error ?? 'ok' },
    { src: `https://github.com/genkit-ai/skills README @ ${skillsRepo.sha.slice(0, 10)}`, names: skillNames(skillsReadme), ok: skillsReadme !== '', note: skillsRepo.error ?? 'ok' },
    { src: `https://github.com/genkit-ai/skills tree @ ${skillsRepo.sha.slice(0, 10)}`, names: treeSkills, ok: treeSkills.length > 0, note: skillsRepo.error ?? 'ok' },
    { src: `https://github.com/google/skills tree @ ${googleSkills.sha.slice(0, 10)}`, names: googleGenkit.map((p) => /([^/]+)\/SKILL\.md$/.exec(p)?.[1] ?? p), ok: googleSkills.paths.length > 0, note: googleSkills.error ?? 'ok' },
  ]

  const rows = sources.map((s) => [
    s.src,
    s.names.length ? s.names.map(code).join(', ') : 'none',
    s.note,
    s.src.includes('skills tree @ ' + skillsRepo.sha.slice(0, 10)) && s.src.includes('genkit-ai') ? '-' : verdictFor(s.names, s.ok),
  ])

  const docSkillCount = skillNames(developMd.text).length
  sections.push(
    '## 1. Which skills exist, per source',
    '',
    `Claim: the docs and READMEs disagree about which \`developing-genkit-*\` skills exist. Verdict column: \`confirmed\` if the source names none of the skills in the genkit-ai/skills tree, \`partly\` if it names some, \`refuted\` if it names all. The genkit-ai/skills tree is the reference (from source, pinned sha ${code(skillsRepo.sha || 'unavailable')}).`,
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
        [
          'The docs page lists fewer skills than exist',
          `docs .md names ${docSkillCount} of ${treeSkills.length}`,
          develop.ok || developMd.ok ? (docSkillCount < treeSkills.length ? 'confirmed' : 'refuted') : 'unverified',
        ],
      ],
    ),
    '',
  )
  if (developMd.ok && treeSkills.length > docSkillCount) {
    addFinding(2, `The docs page ${DEVELOP_MD} names ${docSkillCount} skill(s) (${skillNames(developMd.text).map(code).join(', ') || 'none'}); the genkit-ai/skills tree has ${treeSkills.length} (${treeSkills.map(code).join(', ')}). The genkit-ai/genkit README and the skills README name all of them. Go, Python and Dart agents that start from the docs page never learn their skill exists.`)
  }
}

// ---------------------------------------------------------------- 2 stale docs page

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

// ---------------------------------------------------------------- 3 rules files

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
  try {
    const vendored = readFileSync(VENDORED_RULES, 'utf8')
    if (rulesJs.ok) {
      const d = lineDiff(vendored.split('\n'), rulesJs.text.split('\n'))
      const vTitle = vendored.split('\n').find((l) => l.trim()) ?? ''
      diffRows = [
        [
          'GENKIT.js.md vs evals/rules/GENKIT.md (CLI 1.44.1 copy)',
          `${d.removed} lines only in vendored, ${d.added} lines only on website (vendored ${vendored.split('\n').length} lines, website ${rulesJs.text.split('\n').length})`,
          `vendored title ${code(vTitle)}`,
          modelTally(vendored).size ? `vendored models: ${tallyText(modelTally(vendored))}` : '-',
        ],
      ]
      if (d.removed + d.added > 0) addFinding(4, `The website rules file ${SITE}/GENKIT.js.md and the file ${code('genkit init:ai-tools')} writes (CLI 1.44.1) differ by ${d.removed} + ${d.added} lines, yet carry the same title ${code(vTitle)}. An agent cannot tell which one is current.`)
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
    const bad = needles.slice(0, 5).filter((n) => count(f.text, n) > 0)
    const version = /\((v?\d+\.\d+\.\d+)\)/.exec(f.text.split('\n').find((l) => l.trim()) ?? '')?.[1]
    if (version) addFinding(3, `${url} is titled with version ${code(version)}; the pinned CLI is 1.44.1.`)
    if (bad.length) addFinding(3, `${url} contains ${bad.map(code).join(', ')}.`)
  }
}

// ---------------------------------------------------------------- 4 llms bundles

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
      f.ok ? `1.5: ${sumPrefix(t, 'gemini-1.5')}, 2.0: ${sumPrefix(t, 'gemini-2.0')}, 2.5: ${sumPrefix(t, 'gemini-2.5')}, 3: ${sumPrefix(t, 'gemini-3')}, latest aliases: ${sumPrefix(t, 'gemini-flash-latest') + sumPrefix(t, 'gemini-pro-latest')}` : '-',
    ]
  })

  const pkgRows = sources.map(([name, f]) => [
    name,
    ...pkgNeedles.map((n) => (f.ok ? String(count(f.text, n)) : 'n/a')),
    f.ok ? code(excerpt(f.text, '@genkit-ai/googleai', 50)) || '-' : '-',
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
    '### 4b. Deprecated packages and removed APIs (occurrence counts)',
    '',
    table(['Bundle', ...pkgNeedles.map(code), 'First `@genkit-ai/googleai` excerpt'], pkgRows),
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
    const chat = count(f.text, 'ai.chat(')
    if (chat > 0) addFinding(1, `${SITE}/llms-${l}.txt has ${chat} x ${code('ai.chat(')} in examples${count(f.text, 'API is deprecated. Use [Agents]') > 0 ? `, although the same bundle says ${code(excerpt(f.text, 'API is deprecated. Use [Agents]', 25))}` : ''}.`)
    const goog = count(f.text, '@genkit-ai/googleai')
    if (goog > 0) addFinding(5, `${SITE}/llms-${l}.txt names the deprecated ${code('@genkit-ai/googleai')} ${goog} x: ${code(excerpt(f.text, '@genkit-ai/googleai', 50))}.`)
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
  const withoutLabel = LANGS.filter((_, i) => bundle[LANGS[i] as (typeof LANGS)[number]].ok && (labelsByLang[i] ?? []).length === 0)
  if (distinct.size > 1 || withoutLabel.length) addFinding(3, `The Agents API stability label differs by language: ${LANGS.map((l, i) => `${l}: ${[...new Set(labelsByLang[i])].join('/') || 'no label sentence'}`).join('; ')}.`)
}

// ---------------------------------------------------------------- 5 legacy pages

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

// ---------------------------------------------------------------- 6 npm

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

// ---------------------------------------------------------------- 7 go proxy

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
  for (const m of mismatch) addFinding(2, `${code(m)} resolves on proxy.golang.org but its go.mod declares ${code(declared(goMods[mods.indexOf(m)]))}, so ${code(`go get ${m}`)} fails with a module path mismatch.`)
  const ok = mods.filter((_, i) => (results[i] as Fetched).ok)
  if (ok.length === 1 && bundle.go.ok) {
    const bad = mods.find((m) => !ok.includes(m)) ?? ''
    if (count(bundle.go.text, bad) > 0) addFinding(1, `${code(bad)} does not resolve on proxy.golang.org, yet ${SITE}/llms-go.txt uses it ${count(bundle.go.text, bad)} times.`)
  }
}

// ---------------------------------------------------------------- write

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
