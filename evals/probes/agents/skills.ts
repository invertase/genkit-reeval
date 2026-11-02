import { expect, type Turn } from 'reeval'

/** The skills `npx skills add genkit-ai/skills` installs, one per Genkit language. */
export const GENKIT_SKILLS = ['developing-genkit-js', 'developing-genkit-go', 'developing-genkit-python', 'developing-genkit-dart'] as const

/** What `toHaveCalledSkill` reads of a turn. */
export type SkillSubject = Pick<Turn, 'transcript' | 'unreported'>

/** Harness kinds whose recorded transcripts show a skill load; every other harness is observed only. */
const GATED_HARNESSES = ['claude-code']

/** Whether the skill checks gate on the harness with this cell id. */
export const gatesSkills = (harness: string): boolean => GATED_HARNESSES.some((kind) => harness === kind || harness.startsWith(`${kind}:`))

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * `turn` as `toHaveCalledSkill` should read it. Claude Code reports a load as `Skill` with
 * `{ skill }`, a key the matcher ignores, so the name is copied to `name`, which it reads.
 */
export function asSkillSubject(turn: SkillSubject): SkillSubject {
  return {
    unreported: turn.unreported,
    transcript: turn.transcript.map((e) => {
      if (e.type !== 'tool' || (e.tool !== 'Skill' && e.tool !== 'skill') || !isRecord(e.input)) return e
      const { skill, id, name } = e.input
      if (typeof skill !== 'string' || typeof id === 'string' || typeof name === 'string') return e
      return { ...e, input: { ...e.input, name: skill.slice(skill.lastIndexOf(':') + 1) } }
    }),
  }
}

/** A call's target as the matcher reads it: the first of these keys, else the input, cut at 300 characters. */
const targetOf = (input: unknown): string => {
  if (!isRecord(input)) return String(input ?? '').slice(0, 300)
  for (const key of ['path', 'file_path', 'filePath', 'pattern', 'glob_pattern', 'command', 'url', 'query']) {
    const value = input[key]
    if (typeof value === 'string') return value.slice(0, 300)
  }
  return JSON.stringify(input).slice(0, 300)
}

/** The Genkit skills a turn loaded, for the `skills-called` observation; the gates use the matcher. */
export function skillsCalled(turn: SkillSubject): string[] {
  const calls = asSkillSubject(turn).transcript.flatMap((e) => (e.type === 'tool' ? [e] : []))
  return GENKIT_SKILLS.filter((name) =>
    calls.some((e) => {
      if ((e.tool === 'skill' || e.tool === 'Skill' || e.tool === 'load_skill') && isRecord(e.input) && (e.input.id === name || e.input.name === name)) return true
      return targetOf(e.input).includes(`skills/${name}/`)
    }),
  )
}

/** The label of the session-wide check that the agent used the Python Genkit skill. */
export const PYTHON_SKILL_CHECK = 'session used the Python Genkit skill'

/** The label of the check that the last turn used none of the other languages' Genkit skills. */
export const OTHER_SKILL_CHECK = 'no other-language Genkit skill'

/**
 * Gates the skill use of a two-turn session. A skill loaded on an earlier turn stays in context
 * and is not loaded again, so the Python skill counts from any turn; another language's skill
 * counts only when the last turn loaded it.
 */
export function checkSkills(turns: readonly Turn[]): void {
  const session = asSkillSubject({ transcript: turns.flatMap((t) => t.transcript), unreported: [...new Set(turns.flatMap((t) => t.unreported))] })
  expect(session, PYTHON_SKILL_CHECK).toHaveCalledSkill('developing-genkit-python')
  const last = turns.at(-1)
  if (last === undefined) return
  for (const other of GENKIT_SKILLS.filter((name) => name !== 'developing-genkit-python')) expect(asSkillSubject(last), OTHER_SKILL_CHECK).not.toHaveCalledSkill(other)
}
