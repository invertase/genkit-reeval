import { readFileSync } from 'node:fs'
import { evaluate, expect } from 'reeval'
import { missedKeeps } from '../../bugs.ts'
import { requirementErrors, verifyErrors } from '../../tasks.ts'
import { readWorkspace } from '../docs/checks.ts'
import { gate, noProviderErrors, placeSolutions } from '../probe.ts'
import { PROBES, TASK, USES_AGENTS } from './cases.ts'
import { observeSearch, usesAgentsMiddleware } from './checks.ts'
import { stock, tsdoc } from './environments.ts'

const verify = readFileSync(new URL('../../verify-build.mts', import.meta.url), 'utf8')

evaluate(
  'inline-docs',
  { cases: PROBES, compare: { control: stock, variants: [tsdoc], gate }, tags: ['agents-tsdoc'] },
  async (c, probe) => {
    for (const [file, text] of Object.entries(TASK.start)) {
      if (text === null) throw new Error(`${TASK.name}: removes ${file}, which this eval does not place`)
      await c.writeFile(file, text)
    }
    await placeSolutions(c, probe)

    const turn = await c.send(probe.prompt)
    noProviderErrors(turn)
    observeSearch(c)
    expect(c, 'leaves package.json alone').not.toHaveChanged(['package.json', 'package-lock.json'])

    await expect(c.exec('node_modules/.bin/tsc --noEmit'), 'typechecks').toSucceed()

    await c.writeFile('~/.verify-build.mts', verify)
    const run = await c.exec(`node_modules/.bin/tsx --test --test-reporter=tap --test-name-pattern '^${TASK.name}:' ~/.verify-build.mts`)
    expect(verifyErrors(run, TASK), 'verify ran').toEqual([])
    for (const [check, errors] of Object.entries(requirementErrors(run.stdout, TASK, `${run.stdout}\n${run.stderr}`))) {
      expect(errors, check).toEqual([])
    }

    expect(missedKeeps(TASK.keeps, (await c.readFile(TASK.file)) ?? ''), 'keeps the flows').toEqual([])

    expect(usesAgentsMiddleware(await readWorkspace(c)), USES_AGENTS).toBe(true)
  },
)
