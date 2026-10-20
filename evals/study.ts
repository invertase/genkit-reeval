import fs from 'node:fs'
import { evaluate, expect, group, type Turn } from 'reeval'
import { diagnosisErrors, type Bug } from './bugs.ts'
import { cli, control, mcp, rules } from './environments.ts'

const prompt = (symptom: string) =>
  `You are on the support-desk Genkit app in this directory. Bug report: ${symptom}
Find the root cause and fix it in the app's source. Then write \`answer.json\` in the project root: { "file": "<path of the file that had the bug>", "snippet": "<the exact broken text you replaced, copied verbatim, one line is enough>", "cause": "<one sentence>", "evidence": "<what shows this is the cause>" }. Don't change \`package.json\` or add dependencies.`

const verify = fs.readFileSync(new URL('./verify.ts', import.meta.url), 'utf8')

const parseAnswer = (text: string | null): unknown => {
  try {
    return JSON.parse(text ?? '')
  } catch {
    return null
  }
}

// Set by reeval.oracle.config.ts: gates the control cell so a failing oracle or a passing canary sets the exit code.
const gate = process.env.GENKIT_EVAL_GATE === 'all' ? 'all' : 'none'

const clip = (text: string, max = 300) => (text.length > max ? `${text.slice(0, max)}…` : text)

const show = (value: unknown) => clip(typeof value === 'string' ? value : JSON.stringify(value) ?? '')

/** The turn's tool calls and edits as one line each, in order: reeval 0.9.0's judge state has no transcript. */
const toolLog = (turn: Turn): string[] =>
  turn.transcript.flatMap((e) =>
    e.type === 'tool'
      ? [`${e.tool} ${show(e.input)} -> ${e.ok ? 'ok' : 'failed'}: ${show(e.output)}`]
      : e.type === 'file-edit'
        ? [`edit ${e.path} (${e.kind})`]
        : e.type === 'error'
          ? [`error: ${clip(e.message)}`]
          : [],
  )

const EVIDENCE_QUESTION =
  'Did the agent establish the root cause from evidence of running the application (flow output, a trace, an error message it observed) rather than inferring it from reading the source? ' +
  'The output holds the seeded bug as ground truth (`bug`: its file, the healthy text and the broken text), the agent\'s `answer.json` as written (`answer`, with `cause` and `evidence`), its final message (`finalMessage`) and its tool calls in order (`toolCalls`). ' +
  'Answer yes when the tool calls show the agent ran the app or inspected a trace and the diagnosis cites what it observed. ' +
  'Answer no when it ran something but the diagnosis does not use it, or when the diagnosis comes from reading code alone.'

const SUMMARY_QUESTION = "Does the agent's final message accurately describe the change it made?"

/**
 * Registers one four-arm `evaluate.each` family over `bugs` under a group, so the arms get one
 * lift paired by bug. `tag` is added next to `genkit` so `--tag flows` and `--tag agents` select
 * a study. The pooled lift reads `insufficient` below 6 cases (with runs > 1) or 6 discordant
 * cases (at runs 1).
 */
export const study = (title: string, bugs: Bug[], tag: string) =>
  group(title, () => {
    evaluate.each(bugs)(
      '$name',
      { tags: ['genkit', tag], compare: { baseline: control, variants: [rules, mcp, cli], gate } },
      async (c, bug) => {
        const healthy = (await c.readFile(bug.file)) ?? ''
        const count = healthy.split(bug.from).length - 1
        if (count !== 1) {
          throw new Error(`${bug.name}: expected the healthy snippet once in ${bug.file}, found ${count}`)
        }
        await c.writeFile(bug.file, healthy.replace(bug.from, () => bug.to))

        const turn = await c.send(prompt(bug.symptom))

        const answerText = await c.readFile('answer.json')
        expect.soft(diagnosisErrors(parseAnswer(answerText), bug), 'names the cause').toEqual([])

        await c.writeFile('~/.verify.ts', verify)
        await expect
          .soft(c.exec(`node_modules/.bin/tsx ~/.verify.ts ${bug.name}`), 'flow works')
          .toSucceed()

        const fixed = (await c.readFile(bug.file)) ?? ''
        expect.soft(bug.keeps.filter((keep) => !keep.test(fixed)).map(String), 'keeps the flow').toEqual([])

        // Recorded in `judgements`, never asserted: pass, lift and family_lift stay on the three checks.
        await c.judge(EVIDENCE_QUESTION, {
          on: {
            bug: { name: bug.name, file: bug.file, healthy: bug.from, broken: bug.to },
            answer: answerText,
            finalMessage: turn.text,
            toolCalls: toolLog(turn),
          },
          include: [bug.file, 'answer.json'],
        })
        await c.judge(SUMMARY_QUESTION)
      },
    )
  })
