// Self-check of the skill gate: runs skills-gate.check.ts on reeval's fake agent, so reeval's own matcher reads every case.
// Usage: tsx evals/probes/agents/skills-gate.ts
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CASES } from './skills-gate.cases.ts'
import { GENKIT_SKILLS } from './skills.ts'

type Attempt = { cell: string; outcome: string; assertions: { label: string; status: string }[]; observations: { name: string; value: unknown }[] }
type Run = { evals: { name: string; attempts: Attempt[] }[] }

const config = fileURLToPath(new URL('./skills-gate.config.ts', import.meta.url))
const reeval = (...args: string[]) => spawnSync('pnpm', ['-s', 'reeval', ...args, '--config', config], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const ran = reeval('run', '--ui', 'plain')
const shown = reeval('show', 'latest', '--json')
let run: Run
try {
  run = JSON.parse(shown.stdout) as Run
} catch {
  console.error(`skills-gate: cannot read the run: ${(ran.stdout + ran.stderr + shown.stderr).slice(-600)}`)
  process.exit(1)
}

const attemptsOf = (name: string) => run.evals.find((e) => e.name === name)?.attempts ?? []
const errors: string[] = []
for (const c of CASES) {
  const gate = attemptsOf('gate').find((a) => a.cell.startsWith(`${c.id}/`))
  if (gate === undefined) {
    errors.push(`${c.id}: the gate eval did not run`)
    continue
  }
  const failed = [...new Set(gate.assertions.filter((a) => a.status === 'fail').map((a) => a.label.replace(/ #\d+$/, '')))].sort()
  if (failed.join('|') !== [...c.fails].sort().join('|')) errors.push(`${c.id}: the gate fails ${JSON.stringify(failed)}, should fail ${JSON.stringify(c.fails)}`)
  const observed = gate.observations.find((o) => o.name === 'skills-called')?.value
  const matched = GENKIT_SKILLS.filter((skill) => attemptsOf(`matcher ${skill}`).find((a) => a.cell.startsWith(`${c.id}/`))?.outcome === 'pass')
  const wanted = GENKIT_SKILLS.filter((skill) => c.seen.includes(skill))
  if (matched.join() !== wanted.join()) errors.push(`${c.id}: the matcher finds ${JSON.stringify(matched)}, should find ${JSON.stringify(wanted)}`)
  if (JSON.stringify([...(Array.isArray(observed) ? observed : [])].sort()) !== JSON.stringify([...matched].sort())) errors.push(`${c.id}: skills-called is ${JSON.stringify(observed)}, the matcher finds ${JSON.stringify(matched)}`)
}
for (const e of errors) console.error(e)
console.log(errors.length === 0 ? `skills-gate ok: ${CASES.length} cases` : `skills-gate: ${errors.length} mismatches`)
process.exit(errors.length === 0 ? 0 : 1)
