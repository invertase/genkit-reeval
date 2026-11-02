import { fileURLToPath } from 'node:url'
import { PROBES as AGENTS } from './agents/cases.ts'
import { PROBES as DOCS } from './docs/cases.ts'
import { type Probe, probeErrors } from './probe.ts'
import { PROBES as TOOLING } from './tooling/cases.ts'

/** Every suite's probes, keyed by the suite directory under `evals/probes/`. */
export const SUITES: Record<string, Probe[]> = { agents: AGENTS, docs: DOCS, tooling: TOOLING }

/** The probe a recorded eval is a case of, from its file and `evaluate.each` case name; undefined when none. */
export function probeFor(file: string, caseName: string): Probe | undefined {
  const suite = /^evals\/probes\/([^/]+)\//.exec(file)?.[1]
  return suite === undefined ? undefined : SUITES[suite]?.find((p) => p.name === caseName)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = probeErrors(Object.values(SUITES).flat())
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log('OK')
}
