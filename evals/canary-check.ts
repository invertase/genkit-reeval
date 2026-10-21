// Run by `pnpm canary` after the canary run: reeval exits 1 when every cell fails, which is what a good canary does, so this sets the exit code.
// Usage: tsx evals/canary-check.ts [<run id>] [--since <ISO time>]; with no run id it reads the newest run under .reeval/runs, which must be a canary run that started after --since.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUGS } from './bugs.ts'
import { FIXED_CHECKS, TASKS } from './tasks.ts'

/** The checks every canary bug cell must fail: its answer names a decoy bug and the bug stays in place. */
const BUG_FAILS = ['locates the file', 'names the cause', 'flow works']

type Cell = { name: string; file: string; outcome: string; attempts: number; failed: string[] }

/** Why `cell` is not what the canary must produce; empty when it is. */
export function cellErrors(cell: Cell): string[] {
  const errors = cell.outcome === 'fail' ? [] : [`outcome ${cell.outcome}, not fail`]
  if (cell.attempts === 0) errors.push('no attempt')
  const name = cell.name.slice(cell.name.indexOf(': ') + 2)
  if (cell.file === 'evals/build.eval.ts') {
    const task = TASKS.find((t) => t.name === name)
    if (!task) return [...errors, `no build task ${name}`]
    const failed = [...new Set(cell.failed.filter((label) => !(FIXED_CHECKS as readonly string[]).includes(label)))].sort()
    const expected = [...task.cheat.fails].sort()
    if (failed.join('\n') !== expected.join('\n')) errors.push(`failed ${JSON.stringify(failed)}, cheat.fails is ${JSON.stringify(expected)}`)
    return errors
  }
  if (cell.file === 'evals/genkit.eval.ts') {
    if (!BUGS.some((b) => b.name === name)) return [...errors, `no bug ${name}`]
    const missed = BUG_FAILS.filter((label) => !cell.failed.includes(label))
    if (missed.length > 0) errors.push(`passed ${missed.join(', ')}`)
    return errors
  }
  return [...errors, `unknown family ${cell.file}`]
}

/** Shape of the parts of `reeval show <run> --json` this script reads. */
type RunRecord = {
  runId: string
  startedAt: string
  profile: { name: string } | null
  evals: {
    name: string
    file: string
    cells: { key: string; outcome: string }[]
    attempts: { cell: string; assertions: { label: string; status: string }[] }[]
  }[]
}

/** The start time encoded in a run id such as `20261021T165233Z_efb4b05_jacob-cable_j98t`; undefined when it is not one. */
function runStart(runId: string): Date | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z_/.exec(runId)
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : undefined
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const sinceAt = args.indexOf('--since')
  const since = sinceAt < 0 ? undefined : args.splice(sinceAt, 2)[1]
  const [given] = args
  const root = fileURLToPath(new URL('..', import.meta.url))
  const runsDir = path.join(root, '.reeval/runs')
  const sinceDate = since === undefined ? undefined : new Date(since)
  if (sinceDate && Number.isNaN(sinceDate.getTime())) {
    console.error(`canary-check: --since ${since} is not a time`)
    process.exit(1)
  }
  // history.db is only brought up to date by `reeval query`, so the run directories are the source of truth.
  const newest = readdirSync(runsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && runStart(d.name) !== undefined)
    .map((d) => d.name)
    .sort()
    .at(-1)
  const runId = given ?? newest
  if (!runId) {
    console.error('canary-check: no run in .reeval/runs')
    process.exit(1)
  }
  if (!given && sinceDate && !(runStart(runId)! >= sinceDate)) {
    console.error(`canary-check: the newest run ${runId} started before this canary (${since}); the canary run was not recorded`)
    process.exit(1)
  }
  let run: RunRecord
  try {
    run = JSON.parse(execFileSync('pnpm', ['-s', 'reeval', 'show', runId, '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 })) as RunRecord
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    console.error(`canary-check: cannot read run ${runId} with reeval show: ${stderr || (error instanceof Error ? error.message : String(error))}`)
    process.exit(1)
  }
  const profile = run.profile?.name ?? 'default'
  if (!given && profile !== 'canary') {
    console.error(`canary-check: the newest run ${runId} has profile ${profile}, not canary`)
    process.exit(1)
  }
  const cells = run.evals
    .flatMap((e) =>
      e.cells.map((c) => {
        const attempts = e.attempts.filter((a) => a.cell === c.key)
        return {
          name: e.name,
          file: e.file,
          key: c.key,
          outcome: c.outcome,
          attempts: attempts.length,
          failed: attempts.flatMap((a) => a.assertions.filter((s) => s.status === 'fail').map((s) => s.label)),
        }
      }),
    )
    .sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
  console.log(`canary-check: run ${runId} (profile ${profile})`)
  let bad = cells.length === 0 ? 1 : 0
  if (cells.length === 0) console.log('no cells')
  for (const cell of cells) {
    const errors = cellErrors(cell)
    if (errors.length > 0) bad++
    const failed = [...new Set(cell.failed.filter((label) => !(FIXED_CHECKS as readonly string[]).includes(label)))].join(', ')
    console.log(`${errors.length === 0 ? 'ok  ' : 'BAD '} ${cell.name.padEnd(50)} ${cell.outcome.padEnd(5)} failed: ${failed || '-'}${errors.length > 0 ? `\n       ${errors.join('; ')}` : ''}`)
  }
  const cases = BUGS.length + TASKS.length
  if (cells.length > 0 && cells.length < cases) console.log(`${cells.length} of ${cases} cases ran: a filtered canary proves only those`)
  console.log(bad === 0 ? `canary-check: all ${cells.length} cells failed as they must` : `canary-check: ${bad} of ${cells.length} cells are wrong`)
  process.exit(bad === 0 ? 0 : 1)
}
