import { type AttemptContext, evaluate, expect } from 'reeval'
import { CASES } from './skills-gate.cases.ts'
import { asSkillSubject, checkSkills, GENKIT_SKILLS, skillsCalled } from './skills.ts'

const harness = CASES.map((c) => c.harness)
const session = async (c: AttemptContext) => {
  await c.send('first')
  await c.send('second')
}

evaluate('gate', { harness }, async (c) => {
  await session(c)
  c.observe('skills-called', [...new Set(c.turns.flatMap((t) => skillsCalled(t)))])
  checkSkills(c.turns)
})

for (const name of GENKIT_SKILLS) {
  evaluate(`matcher ${name}`, { harness }, async (c) => {
    await session(c)
    c.observe('skills-called', [...new Set(c.turns.flatMap((t) => skillsCalled(t)))])
    expect(asSkillSubject({ transcript: c.turns.flatMap((t) => t.transcript), unreported: [] }), 'called').toHaveCalledSkill(name)
  })
}
