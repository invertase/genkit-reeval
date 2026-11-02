import type { AttemptContext } from 'reeval'

/** Files to place in the workspace and a shell command to run after, both optional. */
export type Solution = {
  /** workspace-relative path to full text */
  files?: Record<string, string>
  /** run in the workspace after the files are placed, e.g. `npm install` */
  exec?: string
}

/** One smoke probe: a prompt, the checks its eval makes, and the solutions that prove the checks. */
export type Probe = {
  /** kebab-case, unique across every suite; the case name in the eval */
  name: string
  /** what the agent is asked; never names the tooling under test unless the probe is about it */
  prompt: string
  /** every check label the eval body can fail, in order */
  checks: string[]
  /** a correct solution the oracle writes: every check passes */
  oracle: Solution
  /** a plausible wrong solution the canary writes, and exactly which of `checks` it fails */
  cheat: Solution & { fails: string[] }
}

/** Set by `reeval.probes.oracle.config.ts`: the bodies place the solutions and gate every cell. */
export const ORACLE = process.env.GENKIT_PROBE_ORACLE === '1'

/** Compare gate: every cell under the oracle and canary, report-only in real runs. */
export const gate = ORACLE ? 'all' : 'none'

const ORACLE_DIR = '~/.probe'

/**
 * Under the oracle config only, places `probe`'s two solutions under `~/.probe` with a runner the
 * fake harness calls as `sh ~/.probe/run.sh good|cheat`; a real agent never sees them.
 */
export async function placeSolutions(c: AttemptContext, probe: Probe): Promise<void> {
  if (!ORACLE) return
  for (const [side, solution] of [['good', probe.oracle], ['cheat', probe.cheat]] as const) {
    for (const [file, text] of Object.entries(solution.files ?? {})) await c.writeFile(`${ORACLE_DIR}/${side}/${file}`, text)
    await c.writeFile(`${ORACLE_DIR}/${side}.sh`, solution.exec ?? 'true')
  }
  await c.writeFile(
    `${ORACLE_DIR}/run.sh`,
    `set -e\nif [ -d ~/.probe/$1 ]; then cp -R ~/.probe/$1/. .; fi\nsh -e ~/.probe/$1.sh\n`,
  )
}

/** Why `probes` cannot be proven by the oracle and canary; empty when they can. */
export function probeErrors(probes: Probe[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const probe of probes) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(probe.name)) errors.push(`${probe.name}: name is not kebab-case`)
    if (seen.has(probe.name)) errors.push(`${probe.name}: duplicate name`)
    seen.add(probe.name)
    if (probe.checks.length === 0) errors.push(`${probe.name}: no checks`)
    if (new Set(probe.checks).size !== probe.checks.length) errors.push(`${probe.name}: duplicate check labels`)
    if (probe.cheat.fails.length === 0) errors.push(`${probe.name}: the cheat fails no check`)
    for (const fails of probe.cheat.fails) {
      if (!probe.checks.includes(fails)) errors.push(`${probe.name}: the cheat fails ${fails}, which is not a check`)
    }
  }
  return errors
}
