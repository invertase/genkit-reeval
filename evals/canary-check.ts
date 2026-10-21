// Run by `pnpm canary` after the canary run: reeval exits 1 when every cell fails, which is what a good canary does, so this sets the exit code.
// Usage: tsx evals/canary-check.ts [<run id>] [--since <ISO time>]; with no run id it reads the latest canary run, which must have started after --since.
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const sinceAt = args.indexOf('--since')
  const since = sinceAt < 0 ? undefined : args.splice(sinceAt, 2)[1]
  const [given] = args
  const db = new DatabaseSync(path.resolve(fileURLToPath(new URL('..', import.meta.url)), '.reeval/history.db'), { readOnly: true })
  const run = given
    ? db.prepare('SELECT run_id, profile, started_at FROM runs WHERE run_id = ?').get(given)
    : db.prepare("SELECT run_id, profile, started_at FROM runs WHERE profile = 'canary' ORDER BY started_at DESC LIMIT 1").get()
  if (!run) {
    console.error(`canary-check: no ${given ? `run ${given}` : 'canary run'} in .reeval/history.db`)
    process.exit(1)
  }
  const runId = String(run.run_id)
  if (since !== undefined && !(new Date(String(run.started_at)) >= new Date(since))) {
    console.error(`canary-check: the latest canary run ${runId} started at ${String(run.started_at)}, before this canary (${since}); the run was not recorded`)
    process.exit(1)
  }
  const rows = db
    .prepare(
      `SELECT e.name, e.file, c.key AS cell, c.outcome,
              (SELECT COUNT(*) FROM attempts a WHERE a.run_id = c.run_id AND a.eval_key = c.eval_key AND a.cell_key = c.key) AS attempts,
              (SELECT json_group_array(s.label) FROM assertions s WHERE s.run_id = c.run_id AND s.eval_key = c.eval_key AND s.cell_key = c.key AND s.status = 'fail') AS failed
       FROM cells c JOIN evals e ON e.run_id = c.run_id AND e.key = c.eval_key
       WHERE c.run_id = ? ORDER BY e.file, e.name, c.key`,
    )
    .all(runId)
  const cells = rows.map((r) => ({
    name: String(r.name),
    file: String(r.file),
    outcome: String(r.outcome),
    attempts: Number(r.attempts),
    failed: (JSON.parse(String(r.failed)) as unknown[]).map(String),
  }))
  console.log(`canary-check: run ${runId} (profile ${String(run.profile)})`)
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
