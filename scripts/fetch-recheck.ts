// Measures what agents fetched in a run. reeval's fetch events carry a URL and ok, but no status or size, so each URL is fetched again now.
// Usage: tsx scripts/fetch-recheck.ts [--config <reeval config>] [--out <file.md>] [--runs-dir <dir>] [--record <show.json>] [<run id>]
// With no run id it reads the newest run under .reeval/runs. `--record` reads a saved `reeval show --json` record instead of calling reeval.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isShell } from '../evals/probes/transcript.ts'
import { type Fetched, fetchUrl, isTextType, pool } from './llms-urls.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

/** The parts of `reeval show <run> --json` this script reads. */
type RunRecord = {
  runId: string
  evals: {
    name: string
    cells: { key: string; harness: string; environment: string }[]
    attempts: { cell: string; files?: { transcript?: { path: string } } }[]
  }[]
}

/** One URL an agent fetched, from a `web-fetch` event or a `curl`/`wget` shell call. */
export type Fetch = { url: string; via: 'web-fetch' | 'shell'; agentOk: boolean | null }

const GENKIT_URL = /https?:\/\/(?:[\w-]+\.)*genkit\.dev[^\s'"`)<>\\]*/g
const SHELL_FETCH = /\b(?:curl|wget)\b/

/** The fetches in one transcript's JSONL lines: `web-fetch` events, plus genkit.dev URLs in shell commands that run curl or wget. */
export function fetchesOf(lines: string[]): Fetch[] {
  const out: Fetch[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    let e: { type?: string; url?: unknown; tool?: string; input?: unknown; ok?: boolean | null }
    try {
      e = JSON.parse(line) as typeof e
    } catch {
      continue
    }
    if (e.type === 'web-fetch' && typeof e.url === 'string') out.push({ url: e.url, via: 'web-fetch', agentOk: e.ok ?? null })
    if (e.type !== 'tool' || typeof e.tool !== 'string') continue
    const command = typeof (e.input as { command?: unknown } | null)?.command === 'string' ? (e.input as { command: string }).command : ''
    if (!isShell({ tool: e.tool, command, ok: e.ok ?? null, stalled: false, durationMs: null }) || !SHELL_FETCH.test(command)) continue
    for (const url of command.match(GENKIT_URL) ?? []) out.push({ url: url.replace(/[.,;]+$/, ''), via: 'shell', agentOk: e.ok ?? null })
  }
  return out
}

type Group = { environment: string; harness: string; fetches: Fetch[] }

/** The fetches of every attempt in `run`, grouped by cell environment and harness. */
export function collect(run: RunRecord, runDir: string): Group[] {
  const groups = new Map<string, Group>()
  for (const e of run.evals) {
    const cells = new Map(e.cells.map((c) => [c.key, c]))
    for (const a of e.attempts) {
      const cell = cells.get(a.cell)
      const rel = a.files?.transcript?.path
      if (!cell || !rel || !existsSync(path.join(runDir, rel))) continue
      const fetches = fetchesOf(readFileSync(path.join(runDir, rel), 'utf8').split('\n'))
      const key = `${cell.environment}\n${cell.harness}`
      const g = groups.get(key) ?? { environment: cell.environment, harness: cell.harness, fetches: [] }
      g.fetches.push(...fetches)
      groups.set(key, g)
    }
  }
  return [...groups.values()].sort((a, b) => a.environment.localeCompare(b.environment) || a.harness.localeCompare(b.harness))
}

type Row = { environment: string; harness: string; fetches: number; unique: number; agentFailed: number; notFound: number; nonMarkdown: number; bytes: number }

const KB = (n: number): string => `${(n / 1024).toFixed(1)} KB`

/** Per-group totals and the worst URLs, using `fetched` for every URL's re-fetch result. */
export function summarize(groups: Group[], fetched: Map<string, Fetched>) {
  const stat = (f: Fetch) => fetched.get(f.url)
  const rows: Row[] = groups.map((g) => ({
    environment: g.environment,
    harness: g.harness,
    fetches: g.fetches.length,
    unique: new Set(g.fetches.map((f) => f.url)).size,
    agentFailed: g.fetches.filter((f) => f.agentOk === false).length,
    notFound: g.fetches.filter((f) => stat(f)?.status === 404).length,
    nonMarkdown: g.fetches.filter((f) => !isTextType(stat(f)?.contentType ?? '')).length,
    bytes: g.fetches.reduce((n, f) => n + (stat(f)?.bytes ?? 0), 0),
  }))
  const counts = new Map<string, number>()
  for (const g of groups) for (const f of g.fetches) counts.set(f.url, (counts.get(f.url) ?? 0) + 1)
  const worst = [...counts]
    .map(([url, n]) => ({ url, n, f: fetched.get(url) as Fetched }))
    .sort((a, b) => Number(b.f.status === 404) - Number(a.f.status === 404) || Number(!isTextType(b.f.contentType)) - Number(!isTextType(a.f.contentType)) || b.n * b.f.bytes - a.n * a.f.bytes)
    .slice(0, 10)
  return { rows, worst }
}

const NOTE =
  'Status, content type and bytes are from fetching each URL again at report time, not from the agent\'s own request: reeval fetch events carry only the URL and ok. A page that changed since the run, or that answers differently to this client, shows here as it is now. "Agent failed" is the event\'s own ok flag. "Non-markdown" counts fetches whose re-fetch is not `text/markdown` or `text/plain` (including failed ones).'

/** The report as markdown. */
export function render(runId: string, rows: Row[], worst: ReturnType<typeof summarize>['worst'], date: string): string {
  const table = (rs: Row[]): string[] => [
    '| Environment | Harness | Fetches | Unique URLs | Agent failed | 404 (re-fetch) | Non-markdown (re-fetch) | Bytes (re-fetch) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rs.map((r) => `| ${r.environment} | ${r.harness} | ${r.fetches} | ${r.unique} | ${r.agentFailed} | ${r.notFound} | ${r.nonMarkdown} | ${KB(r.bytes)} |`),
  ]
  const byEnv = new Map<string, Row>()
  for (const r of rows) {
    const t = byEnv.get(r.environment) ?? { ...r, harness: 'all', fetches: 0, unique: 0, agentFailed: 0, notFound: 0, nonMarkdown: 0, bytes: 0 }
    for (const k of ['fetches', 'unique', 'agentFailed', 'notFound', 'nonMarkdown', 'bytes'] as const) t[k] += r[k]
    byEnv.set(r.environment, t)
  }
  return [
    `# Fetch re-check: ${runId}`,
    '',
    `Re-fetched on ${date}. ${NOTE}`,
    '',
    '## Per arm and harness',
    '',
    ...(rows.length ? table(rows) : ['No web fetches in this run.']),
    '',
    '## Per arm',
    '',
    'Unique URLs are summed over harnesses, so a URL fetched under two harnesses counts twice.',
    '',
    ...(rows.length ? table([...byEnv.values()]) : ['-']),
    '',
    '## Worst URLs',
    '',
    '| URL | Fetches | Status (re-fetch) | Type | Bytes (re-fetch) |',
    '| --- | --- | --- | --- | --- |',
    ...worst.map((w) => `| ${w.url} | ${w.n} | ${w.f.status || `error: ${w.f.error ?? ''}`} | ${w.f.contentType.split(';')[0] || '-'} | ${KB(w.f.bytes)} |`),
    '',
  ].join('\n')
}

const runStart = (runId: string): boolean => /^\d{8}T\d{6}Z_/.test(runId)

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const take = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i < 0 ? undefined : args.splice(i, 2)[1]
  }
  const config = take('--config')
  const out = take('--out')
  const runsDir = path.resolve(root, take('--runs-dir') ?? '.reeval/runs')
  const recordFile = take('--record')
  const [given] = args
  const runId =
    given ??
    (recordFile
      ? (JSON.parse(readFileSync(recordFile, 'utf8')) as RunRecord).runId
      : (existsSync(runsDir) ? readdirSync(runsDir, { withFileTypes: true }) : [])
          .filter((d) => d.isDirectory() && runStart(d.name))
          .map((d) => d.name)
          .sort()
          .at(-1))
  if (!runId) {
    console.error(`fetch-recheck: no run in ${runsDir}`)
    return 1
  }
  let run: RunRecord
  try {
    run = JSON.parse(
      recordFile
        ? readFileSync(recordFile, 'utf8')
        : execFileSync('pnpm', ['-s', 'reeval', 'show', runId, '--json', ...(config ? ['--config', config] : [])], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }),
    ) as RunRecord
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    console.error(`fetch-recheck: cannot read run ${runId}: ${stderr || (error instanceof Error ? error.message : String(error))}`)
    return 1
  }
  const groups = collect(run, path.join(runsDir, runId))
  const urls = [...new Set(groups.flatMap((g) => g.fetches.map((f) => f.url)))]
  const results = await pool(urls, 4, 150, (url) => fetchUrl(url))
  const { rows, worst } = summarize(groups, new Map(results.map((r) => [r.url, r])))
  const md = render(runId, rows, worst, new Date().toISOString().slice(0, 10))
  console.log(md)
  if (out) writeFileSync(out, md)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main())
