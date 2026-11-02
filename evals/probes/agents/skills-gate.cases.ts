import { readFileSync } from 'node:fs'
import { fakeHarness } from 'reeval/harness'
import { OTHER_SKILL_CHECK, PYTHON_SKILL_CHECK } from './skills.ts'

type Replayed = { tool: string; input: unknown; output: unknown; ok: boolean }

/** The tool calls of a Claude Code run recorded in `evals/.history`, cut to three events, one a real `Skill {skill}` load of `developing-genkit-js`. */
const recorded: Replayed[] = readFileSync(new URL('./fixtures/claude-code-skill-load.jsonl', import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Replayed)
  .map(({ tool, input, output, ok }) => ({ tool, input, output, ok }))

const renamed = recorded.map((e) => (e.tool === 'Skill' ? { ...e, input: { skill: 'developing-genkit-python' } } : e))

const PY = 'developing-genkit-python'
const JS = 'developing-genkit-js'
const read = (skill: string) => `true; echo .agents/skills/${skill}/SKILL.md`

/** One synthetic or replayed two-turn session and what the gate must say of it. */
export type GateCase = {
  id: string
  /** the fake agent for the session; each of its two turns reports `tools`, or runs its own `script` step */
  harness: ReturnType<typeof fakeHarness>
  /** the Genkit skills reeval's matcher must find across the session */
  seen: string[]
  /** the labels `checkSkills` must fail */
  fails: string[]
}

type Fake = NonNullable<Parameters<typeof fakeHarness>[0]>
const agent = (id: string, options: Fake) => fakeHarness({ ...options, id })
const turns = (id: string, first: string, second: string) => agent(id, { script: [[{ exec: first }], [{ exec: second }]] })

/** The gate's table: reeval's matcher decides what each session shows; `skills-gate.check.ts` runs it. */
export const CASES: GateCase[] = [
  { id: 'claude-skill-load-both-turns', harness: agent('claude-skill-load-both-turns', { tools: [{ tool: 'Skill', input: { skill: PY }, output: 'ok' }] }), seen: [PY], fails: [] },
  { id: 'claude-namespaced-skill-load', harness: agent('claude-namespaced-skill-load', { tools: [{ tool: 'Skill', input: { skill: 'genkit:developing-genkit-go' }, output: 'ok' }] }), seen: ['developing-genkit-go'], fails: [PYTHON_SKILL_CHECK, OTHER_SKILL_CHECK] },
  { id: 'replayed-claude-code-js-skill', harness: agent('replayed-claude-code-js-skill', { tools: recorded }), seen: [JS], fails: [PYTHON_SKILL_CHECK, OTHER_SKILL_CHECK] },
  { id: 'replayed-claude-code-python-skill', harness: agent('replayed-claude-code-python-skill', { tools: renamed }), seen: [PY], fails: [] },
  { id: 'python-skill-loaded-on-turn-1-only', harness: turns('python-skill-loaded-on-turn-1-only', read(PY), 'true'), seen: [PY], fails: [] },
  { id: 'js-skill-turn-1-python-skill-turn-2', harness: turns('js-skill-turn-1-python-skill-turn-2', read(JS), read(PY)), seen: [JS, PY], fails: [] },
  { id: 'js-skill-loaded-on-turn-2', harness: turns('js-skill-loaded-on-turn-2', read(PY), read(JS)), seen: [PY, JS], fails: [OTHER_SKILL_CHECK] },
  { id: 'no-skill-loaded', harness: turns('no-skill-loaded', 'true', 'true'), seen: [], fails: [PYTHON_SKILL_CHECK] },
  { id: 'skills-directory-listed-only', harness: turns('skills-directory-listed-only', 'true; ls .agents/skills', 'true'), seen: [], fails: [PYTHON_SKILL_CHECK] },
  { id: 'skill-read-after-cd-is-missed', harness: turns('skill-read-after-cd-is-missed', `true; cd .agents/skills/${PY} && cat SKILL.md`, 'true'), seen: [], fails: [PYTHON_SKILL_CHECK] },
  { id: 'path-past-300-characters-is-missed', harness: turns('path-past-300-characters-is-missed', `true; echo ${'x'.repeat(300)} .agents/skills/${PY}/SKILL.md`, 'true'), seen: [], fails: [PYTHON_SKILL_CHECK] },
  { id: 'mention-of-another-skills-path-counts', harness: turns('mention-of-another-skills-path-counts', read(PY), 'true; echo rm -rf .agents/skills/developing-genkit-js/'), seen: [PY, JS], fails: [OTHER_SKILL_CHECK] },
]
