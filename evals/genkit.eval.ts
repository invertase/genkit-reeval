import fs from 'node:fs'
import { evaluate, expect } from 'reeval'
import { BUGS, causeErrors, locationErrors, missedKeeps, seed } from './bugs.ts'
import { control, directed, mcp, rules, skill } from './environments.ts'
import { providerErrors } from './infra.ts'

const prompt = (symptom: string) =>
  `You are on the support-desk Genkit app in this directory. Bug report: ${symptom}
Find the root cause and fix it in the app's source. Then write \`answer.json\` in the project root: { "file": "<path of the file that had the bug>", "snippet": "<the exact broken text you replaced, copied verbatim, one line is enough>", "cause": "<one sentence>", "evidence": "<what shows this is the cause>" }. Don't change \`package.json\` or add dependencies.`

const verify = fs.readFileSync(new URL('./verify.mts', import.meta.url), 'utf8')

const parseAnswer = (text: string | null): unknown => {
  try {
    return JSON.parse(text ?? '')
  } catch {
    return null
  }
}

// Set by reeval.oracle.config.ts: gates the control cell so a failing oracle sets the exit code; evals/canary-check.ts judges the canary.
const gate = process.env.GENKIT_EVAL_GATE === 'all' ? 'all' : 'observe'

const EVIDENCE_QUESTION =
  'Did the agent establish the root cause from evidence of running the application (flow output, a trace, an error message it observed) rather than inferring it from reading the source? ' +
  "The output holds the seeded bug as ground truth (`bug`: its file, the healthy text and the broken text), the agent's `answer.json` as written (`answer`, with `cause` and `evidence`), and its final message (`finalMessage`). The transcript lists its tool calls in order with their output. " +
  'Answer yes when the transcript shows the agent ran the app or inspected a trace and the diagnosis cites what it observed. ' +
  'Answer no when it ran something but the diagnosis does not use it, or when the diagnosis comes from reading code alone.'

const SUMMARY_QUESTION = "Does the agent's final message accurately describe the change it made?"

// One eval over 12 cases: the arms get one lift, paired by bug.
evaluate(
  'fixes a broken Genkit app',
  {
    cases: BUGS,
    // Every arm runs on every harness; reeval reports each variant's lift over the control arm.
    compare: {
      control,
      variants: [rules, mcp, directed, skill],
      gate,
    },
    // Asked after the run of each pair of arms on one harness, blind to which arm is which.
    questions: [
      {
        question:
          "Which attempt's answer.json evidence describes something observed by running the app (an output, an error, a trace) rather than inferred from reading the code?",
        across: 'environment',
        task: true,
        diff: true,
        transcript: 'tools',
      },
    ],
  },
  async (c, bug) => {
    // Seed: break the healthy fixture in the sandbox workspace before the agent starts.
    const healthy = (await c.readFile(bug.file)) ?? ''
    if (healthy.split(bug.from).length !== 2) throw new Error(`${bug.name}: healthy snippet not found once in ${bug.file}`)
    await c.writeFile(bug.file, seed(healthy, bug))

    // Send: one agent turn on the harness and environment of this cell.
    const turn = await c.send(prompt(bug.symptom))

    // Checks: each failed expect fails the attempt, and pass rate and lift count only these.
    expect(providerErrors(turn), 'agent ran without provider errors').toEqual([])
    expect(c, 'leaves package.json alone').not.toHaveChanged(['package.json', 'package-lock.json'])

    const answerText = await c.readFile('answer.json')
    const answer = parseAnswer(answerText)
    expect(locationErrors(answer, bug), 'locates the file').toEqual([])
    expect(causeErrors(answer, bug, healthy), 'names the cause').toEqual([])

    await c.writeFile('~/.verify.mts', verify)
    await expect(c.exec(`node_modules/.bin/tsx --test --test-name-pattern '^${bug.name}$' ~/.verify.mts`), 'flow works').toSucceed()

    const fixed = (await c.readFile(bug.file)) ?? ''
    expect(missedKeeps(bug.keeps, fixed), 'keeps the flow').toEqual([])

    // Judges: recorded in `judgements`, never asserted, so a model's opinion cannot move pass rate or lift.
    await c.judge(EVIDENCE_QUESTION, {
      on: {
        bug: { name: bug.name, file: bug.file, healthy: bug.from, broken: bug.to },
        answer: answerText,
        finalMessage: turn.text,
      },
      task: true,
      output: true,
      transcript: 'full',
      files: true,
      diff: [bug.file, 'answer.json'],
    })
    await c.judge(SUMMARY_QUESTION, { task: true, output: true, files: true, diff: true })
  },
)
