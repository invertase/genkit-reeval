import fs from 'node:fs'
import { evaluate, expect } from 'reeval'
import { control, mcp, rules, skill } from './environments.ts'
import { TASKS } from './tasks.ts'

const verify = fs.readFileSync(new URL('./verify-build.mts', import.meta.url), 'utf8')

// Set by reeval.oracle.config.ts: gates the control cell so a failing oracle or a passing canary sets the exit code.
const gate = process.env.GENKIT_EVAL_GATE === 'all' ? 'all' : 'none'

const IDIOM_QUESTION =
  "Did the agent build the feature with Genkit's agents API (`ai.defineAgent`, `ai.defineInterrupt` for the approval step, the `agents()` middleware from `@genkit-ai/middleware` for delegation, a session store such as `FileSessionStore` for resumable conversations) " +
  'rather than hand-rolled `ai.generate` loops, flows posing as agents, or APIs Genkit no longer has such as `ai.chat()`? ' +
  'Judge only the parts the task needed: an order desk needs `defineAgent` with the tool; a refund desk also needs an interrupt; a front desk also needs delegation and a store.'

// The pairwise judge has no API hints of its own and has called @genkit-ai/middleware a non-existent package.
const PAIR_QUESTION =
  "Which attempt's src/agents.ts is more idiomatic Genkit? " +
  'Idiomatic means `ai.defineAgent`, `ai.defineInterrupt` for a human approval step, the `agents()` middleware from `@genkit-ai/middleware` (a real package, already in package.json) for delegation, ' +
  'and a session store such as `FileSessionStore` for resumable conversations. Tools that wrap another agent\'s `.chat()`, hand-rolled `ai.generate` loops, and `ai.chat()` (removed from Genkit) are not idiomatic.'

// One family of 3 cases: the arms get one lift, paired by task.
evaluate.each(TASKS)(
  'builds a Genkit feature: $name',
  {
    compare: {
      baseline: control,
      variants: [rules, mcp, skill],
      gate,
      questions: [{ question: PAIR_QUESTION, across: 'environment' }],
    },
  },
  async (c, task) => {
    await c.sandbox() // 0.9.0 does not start it on readFile: invertase/reeval#384
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

    await c.send(task.prompt)

    await expect.soft(c.exec('node_modules/.bin/tsc --noEmit'), 'typechecks').toSucceed()

    await c.writeFile('~/.verify-build.mts', verify)
    await expect
      .soft(c.exec(`node_modules/.bin/tsx --test --test-name-pattern '^${task.name}$' ~/.verify-build.mts`), 'agent works')
      .toSucceed()

    const built = (await c.readFile(task.file)) ?? ''
    expect.soft(task.keeps.filter((keep) => !keep.test(built)).map(String), 'keeps the flows').toEqual([])

    // Recorded in `judgements`, never asserted: pass and lift stay on the three checks.
    await c.judge(IDIOM_QUESTION, { include: ['src/agents.ts'], files: ['src/agents.ts'] })
  },
)
