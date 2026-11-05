import fs from 'node:fs'
import { evaluate, expect } from 'reeval'
import { missedKeeps } from './bugs.ts'
import { control, directed, mcp, rules, skill } from './environments.ts'
import { providerErrors } from './infra.ts'
import { requirementErrors, TASKS, verifyErrors } from './tasks.ts'

const verify = fs.readFileSync(new URL('./verify-build.mts', import.meta.url), 'utf8')

// Set by reeval.oracle.config.ts: gates the control cell so a failing oracle sets the exit code; evals/canary-check.ts judges the canary.
const gate = process.env.GENKIT_EVAL_GATE === 'all' ? 'all' : 'observe'

const IDIOM_QUESTION =
  "Did the agent build the feature with Genkit's agents API (`ai.defineAgent`, `ai.defineInterrupt` for the approval step, the `agents()` middleware from `@genkit-ai/middleware` for delegation, a session store such as `FileSessionStore` for resumable conversations) " +
  'rather than hand-rolled `ai.generate` loops, flows posing as agents, or APIs Genkit no longer has such as `ai.chat()`? ' +
  'Judge only the parts the task needed: an order desk needs `defineAgent` with the tool; a refund desk also needs an interrupt; a front desk also needs delegation and a store; ' +
  'a conversation resumed in a later request needs a persistent store such as `FileSessionStore`; a refund receipt needs a session artifact; a customer-scoped lookup needs the tool to read the action context.'

// The pairwise judge has no API hints of its own and has called @genkit-ai/middleware a non-existent package.
const PAIR_QUESTION =
  "Which attempt's src/agents.ts is more idiomatic Genkit? " +
  'Idiomatic means `ai.defineAgent`, `ai.defineInterrupt` for a human approval step, the `agents()` middleware from `@genkit-ai/middleware` (a real package, already in package.json) for delegation, ' +
  'and a session store such as `FileSessionStore` for resumable conversations. Tools that wrap another agent\'s `.chat()`, hand-rolled `ai.generate` loops, and `ai.chat()` (removed from Genkit) are not idiomatic.'

// One eval over 7 cases: the arms get one lift, paired by task.
evaluate(
  'builds a Genkit feature',
  {
    cases: TASKS,
    compare: {
      control,
      variants: [rules, mcp, directed, skill],
      gate,
    },
    questions: [{ question: PAIR_QUESTION, across: 'environment', task: true, diff: true }],
  },
  async (c, task) => {
    for (const [file, text] of Object.entries(task.start)) {
      if (text !== null) {
        await c.writeFile(file, text)
        continue
      }
      // Placing an empty file first keeps the healthy text out of the judge's diff once the agent writes it again.
      await c.writeFile(file, '')
      const removed = await c.exec(`rm ${file}`)
      if (removed.exitCode !== 0) throw new Error(`${task.name}: could not remove ${file}: ${removed.stderr}`)
    }
    // Only the oracle reads it, since two tasks share a start state; a real agent could read its home dir.
    if (gate === 'all') await c.writeFile('~/.task', task.name)

    const turn = await c.send(task.prompt)
    expect(providerErrors(turn), 'agent ran without provider errors').toEqual([])
    expect(c, 'leaves package.json alone').not.toHaveChanged(['package.json', 'package-lock.json'])

    await expect(c.exec('node_modules/.bin/tsc --noEmit'), 'typechecks').toSucceed()

    await c.writeFile('~/.verify-build.mts', verify)
    const run = await c.exec(`node_modules/.bin/tsx --test --test-reporter=tap --test-name-pattern '^${task.name}:' ~/.verify-build.mts`)
    expect(verifyErrors(run, task), 'verify ran').toEqual([])
    for (const [check, errors] of Object.entries(requirementErrors(run.stdout, task, `${run.stdout}\n${run.stderr}`))) {
      expect(errors, check).toEqual([])
    }

    const built = (await c.readFile(task.file)) ?? ''
    expect(missedKeeps(task.keeps, built), 'keeps the flows').toEqual([])

    // Recorded in `judgements`, never asserted: pass and lift stay on the checks.
    await c.judge(IDIOM_QUESTION, { task: true, output: true, files: true, diff: ['src/agents.ts'], contents: ['src/agents.ts'] })
  },
)
