import fs from 'node:fs'
import { evaluate, expect, group } from 'reeval'
import { diagnosisErrors, type Bug } from './bugs.ts'
import { cli, control, mcp } from './environments.ts'

const prompt = (symptom: string) =>
  `You are on the support-desk Genkit app in this directory. Bug report: ${symptom}
Find the root cause and fix it in the app's source. Then write \`answer.json\` in the project root: { "file": "<path of the file that had the bug>", "snippet": "<the exact broken text you replaced, copied verbatim, one line is enough>", "cause": "<one sentence>" }. Don't change \`package.json\` or add dependencies.`

const verify = fs.readFileSync(new URL('./verify.ts', import.meta.url), 'utf8')

const parseAnswer = (text: string | null): unknown => {
  try {
    return JSON.parse(text ?? '')
  } catch {
    return null
  }
}

// The oracle config gates the control cell so a failing oracle or a passing canary sets the exit code.
const gate = process.env.GENKIT_EVAL_ORACLE === '1' ? 'all' : 'none'

/**
 * Registers one three-arm `evaluate.each` family over `bugs` under a group, so the arms get one
 * lift paired by bug. `tag` is added next to `genkit` so `--tag flows` and `--tag agents` select
 * a study. The pooled lift reads `insufficient` below 6 cases (with runs > 1) or 6 discordant
 * cases (at runs 1).
 */
export const study = (title: string, bugs: Bug[], tag: string) =>
  group(title, () => {
    evaluate.each(bugs)(
      '$name',
      { tags: ['genkit', tag], compare: { baseline: control, variants: [mcp, cli], gate } },
      async (c, bug) => {
        const healthy = (await c.readFile(bug.file)) ?? ''
        const count = healthy.split(bug.from).length - 1
        if (count !== 1) {
          throw new Error(`${bug.name}: expected the healthy snippet once in ${bug.file}, found ${count}`)
        }
        await c.writeFile(bug.file, healthy.replace(bug.from, () => bug.to))

        await c.send(prompt(bug.symptom))

        const answer = parseAnswer(await c.readFile('answer.json'))
        expect.soft(diagnosisErrors(answer, bug), 'names the cause').toEqual([])

        await c.writeFile('~/.verify.ts', verify)
        await expect
          .soft(c.exec(`node_modules/.bin/tsx ~/.verify.ts ${bug.name}`), 'flow works')
          .toSucceed()

        const fixed = (await c.readFile(bug.file)) ?? ''
        expect.soft(bug.keeps.filter((keep) => !keep.test(fixed)).map(String), 'keeps the flow').toEqual([])
      },
    )
  })
