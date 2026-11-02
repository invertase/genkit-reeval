import { fileURLToPath } from 'node:url'
import type { Turn } from 'reeval'

/** The skills `npx skills add genkit-ai/skills` installs, one per Genkit language. */
export const GENKIT_SKILLS = ['developing-genkit-js', 'developing-genkit-go', 'developing-genkit-python', 'developing-genkit-dart'] as const

/** What `toHaveCalledSkill` reads of a turn. */
export type SkillSubject = Pick<Turn, 'transcript' | 'unreported'>

/** Harness kinds whose transcripts show a skill load, as a `skill` call or a read of its `SKILL.md`; the others are observed only. */
const GATED_HARNESSES = ['claude-code', 'codex']

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

const targetOf = (input: unknown): string => {
  if (!isRecord(input)) return typeof input === 'string' ? input : ''
  for (const key of ['path', 'file_path', 'filePath', 'pattern', 'glob_pattern', 'command', 'url', 'query']) {
    const value = input[key]
    if (typeof value === 'string') return value
  }
  return JSON.stringify(input)
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tool = (name: string, input: unknown): SkillSubject => ({ unreported: [], transcript: [{ type: 'tool', tool: name, input, output: '', ok: true } as SkillSubject['transcript'][number]] })
  const cases: [string, SkillSubject, string[]][] = [
    ['Claude Code Skill load', tool('Skill', { skill: 'developing-genkit-python' }), ['developing-genkit-python']],
    ['namespaced Skill load', tool('Skill', { skill: 'genkit:developing-genkit-go' }), ['developing-genkit-go']],
    ['skill load by name', tool('skill', { name: 'developing-genkit-js' }), ['developing-genkit-js']],
    ['read of the installed SKILL.md', tool('read', { path: '/work/.agents/skills/developing-genkit-python/SKILL.md' }), ['developing-genkit-python']],
    ['read through the Claude Code symlink', tool('read', { file_path: '.claude/skills/developing-genkit-dart/SKILL.md' }), ['developing-genkit-dart']],
    ['shell cat of a SKILL.md', tool('bash', { command: 'cat .agents/skills/developing-genkit-go/SKILL.md' }), ['developing-genkit-go']],
    ['unrelated skill', tool('Skill', { skill: 'pdf' }), []],
    ['skill name in prose only', tool('bash', { command: 'echo developing-genkit-python' }), []],
    ['listing of the skills directory', tool('bash', { command: 'ls .agents/skills' }), []],
  ]
  const errors = cases.flatMap(([label, subject, want]) => {
    const got = skillsCalled(subject)
    return got.join() === want.join() ? [] : [`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`]
  })
  const normalized = asSkillSubject(tool('Skill', { skill: 'x' })).transcript[0]
  if (normalized?.type !== 'tool' || !isRecord(normalized.input) || normalized.input.name !== 'x') errors.push('asSkillSubject does not copy skill to name')
  for (const harness of ['claude-code:claude-sonnet-5', 'codex:gpt-5.6-luna']) if (!gatesSkills(harness)) errors.push(`gatesSkills(${harness}) should be true`)
  for (const harness of ['fake', 'antigravity:gemini-3.8-flash-medium', 'cursor:composer-2.5', 'claude-codex']) if (gatesSkills(harness)) errors.push(`gatesSkills(${harness}) should be false`)
  for (const e of errors) console.error(e)
  console.log(errors.length === 0 ? `skills ok: ${cases.length + 6} cases` : `skills: ${errors.length} mismatches`)
  process.exit(errors.length === 0 ? 0 : 1)
}
