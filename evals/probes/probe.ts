import { type AttemptContext, expect, type Turn } from 'reeval'
import { providerErrors } from '../infra.ts'

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

/** The check label every probe carries: the agent was not stopped by a provider-side failure. */
export const PROVIDER_CHECK = 'agent ran without provider errors'

/** Fails the `PROVIDER_CHECK` when the turn hit a billing, quota or rate-limit error. */
export const noProviderErrors = (turn: Turn): void => expect(providerErrors(turn), PROVIDER_CHECK).toEqual([])

/** Marks the one line a hidden verify script prints for the eval to read: the marker, then a JSON object. */
export const RESULT_MARKER = 'PROBE_RESULT '

/** What a hidden verify script reported. */
export type ProbeResult = Record<string, unknown>

/** The last `PROBE_RESULT` line of a script's output as an object, or why there is none; never throws. */
export function parseResult(run: { exitCode: number; stdout: string; stderr: string }): ProbeResult | string {
  const line = run.stdout.split('\n').reverse().find((l) => l.startsWith(RESULT_MARKER))
  if (line === undefined) return `no result, exit ${run.exitCode}: ${(run.stderr || run.stdout).trim().slice(-400)}`
  try {
    const parsed: unknown = JSON.parse(line.slice(RESULT_MARKER.length))
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as ProbeResult
  } catch {}
  return `malformed result: ${line.slice(0, 300)}`
}

/** Set by `reeval.probes.oracle.config.ts`: the bodies place the solutions and gate every cell. */
export const ORACLE = process.env.GENKIT_PROBE_ORACLE === '1'

/** Compare gate: every cell under the oracle and canary, report-only in real runs. */
export const gate = ORACLE ? 'all' : 'observe'

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
    else if (!probe.checks.includes(PROVIDER_CHECK)) errors.push(`${probe.name}: checks lack "${PROVIDER_CHECK}"`)
    if (new Set(probe.checks).size !== probe.checks.length) errors.push(`${probe.name}: duplicate check labels`)
    if (probe.cheat.fails.length === 0) errors.push(`${probe.name}: the cheat fails no check`)
    for (const fails of probe.cheat.fails) {
      if (!probe.checks.includes(fails)) errors.push(`${probe.name}: the cheat fails ${fails}, which is not a check`)
    }
  }
  return errors
}
