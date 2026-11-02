import { readFileSync } from 'node:fs'
import { type AttemptContext, type ExecResult, evaluate, expect, type Turn } from 'reeval'
import { providerErrors } from '../../infra.ts'
import { docsArms } from '../environments.ts'
import { gate, placeSolutions, type Probe } from '../probe.ts'
import { GO_MODULE, PROBES } from './cases.ts'
import { arms } from './environments.ts'

const hidden = (file: string) => readFileSync(new URL(`./sandbox/hidden/${file}`, import.meta.url), 'utf8')
const probe = (name: string): Probe => {
  const found = PROBES.find((p) => p.name === name)
  if (!found) throw new Error(`no probe ${name}`)
  return found
}

const FIXED = 'agent ran without provider errors'
const RESULT = /^PROBE_RESULT (.*)$/m

/** The project's interpreter: the `.venv` the agent made, else the system `python3`. */
const python = (args: string) => `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python || echo python3); timeout 300 "$PY" ${args}`

/** What a hidden script printed after `PROBE_RESULT`, or why there is none. */
function result(run: ExecResult): { reply: string; session: string } | string {
  if (run.exitCode !== 0) return `exit ${run.exitCode}: ${run.stderr.trim().split('\n').slice(-3).join(' | ')}`
  const line = RESULT.exec(run.stdout)?.[1]
  if (line === undefined) return 'printed no result'
  const parsed: unknown = JSON.parse(line)
  const { reply, session } = parsed as { reply?: unknown; session?: unknown }
  return { reply: typeof reply === 'string' ? reply : '', session: typeof session === 'string' ? session : '' }
}

/** Which Genkit CLI subcommands the agent ran, what it fetched and how often it searched, recorded and never gated. */
function observeContext(c: AttemptContext, turn: Turn): void {
  const commands = new Set<string>()
  for (const event of turn.transcript) {
    if (event.type !== 'tool') continue
    for (const m of JSON.stringify(event.input ?? '').matchAll(/\bgenkit(?:\s+--[\w-]+)*\s+(docs:\w+|init:ai-tools|mcp|start|flow:run|trace:\w+)/g)) commands.add(m[1] ?? '')
    for (const m of JSON.stringify(event.input ?? '').matchAll(/\b(npx skills[^"\\]*|skills\.sh)/g)) commands.add(m[1] ?? '')
  }
  c.observe('genkit-commands', [...commands].slice(0, 20))
  c.observe('fetched-urls', turn.transcript.flatMap((e) => (e.type === 'web-fetch' ? [e.url] : [])).slice(0, 20))
  c.observe('web-searches', turn.transcript.filter((e) => e.type === 'web-search').length)
}

const AGENT_QUESTION =
  "Did the agent build the conversation with Genkit's agents API (an agent defined with a session store, such as `define_agent` in Python or `genkitx.DefineAgent` in Go) " +
  'rather than a hand-rolled loop over `generate` calls that stores the history itself?'

const go = (id: string, fixture: string) => arms(id, 'go', fixture)
const py = (id: string, fixture: string) => arms(id, 'python', fixture)

const GO_MOD_REQUIRES = new RegExp(`^\\s*(?:require\\s+)?${GO_MODULE.replaceAll('.', '\\.')}\\s+v\\d`, 'm')

const goNewApp = probe('go-new-app')
{
  const { control, skill, index } = go('go-new', 'go-empty')
  const docs = docsArms(control, 'go')
  evaluate(
    `agents: ${goNewApp.name}`,
    { compare: { baseline: control, variants: [skill, index, docs.open, docs.docsite, docs.llms, docs.index], gate } },
    async (c) => {
      await placeSolutions(c, goNewApp)
      const turn = await c.send(goNewApp.prompt)
      expect(providerErrors(turn), FIXED).toEqual([])
      observeContext(c, turn)
      const mirror = 'github.com/genkit-ai/genkit/go'
      c.observe('mirror-path-mentions', {
        written: turn.transcript.filter((e) => e.type === 'tool' && JSON.stringify(e.input ?? '').includes(mirror)).length,
        seen: turn.transcript.filter((e) => e.type === 'tool' && JSON.stringify(e.output ?? '').includes(mirror)).length,
        inDiff: turn.diff.patch.includes(mirror),
      })

      const mod = (await c.readFile('go.mod')) ?? ''
      expect(GO_MOD_REQUIRES.test(mod) ? [] : [`go.mod does not require ${GO_MODULE}`], 'requires the genkit module').toEqual([])

      const build = await c.exec('go build ./...')
      await expect(build, 'builds').toSucceed()
      const version = await c.exec(`go list -m -f '{{.Version}}' ${GO_MODULE}`)
      c.observe('genkit-go-version', version.stdout.trim() || null)

      const run = build.exitCode === 0 ? await c.exec('timeout 120 go run .') : undefined
      const runErrors = run === undefined ? ['does not build'] : run.exitCode !== 0 ? [`exit ${run.exitCode}: ${run.stderr.trim().slice(-300)}`] : run.stdout.trim().length < 20 ? [`prints ${JSON.stringify(run.stdout.trim())}`] : []
      expect(runErrors, 'runs and prints an answer').toEqual([])

      const bad = build.exitCode === 0 ? await c.exec('GEMINI_API_KEY=invalid timeout 120 go run .') : undefined
      expect(bad === undefined ? ['does not build'] : bad.exitCode === 0 ? ['exits 0 with an invalid key'] : [], 'calls the model').toEqual([])
    },
  )
}

const goAgentSession = probe('go-agent-session')
{
  const { control, skill, index } = go('go-session', 'go-support')
  evaluate(
    `agents: ${goAgentSession.name}`,
    { compare: { baseline: control, variants: [skill, index], gate }, questions: [{ question: AGENT_QUESTION, across: 'environment', task: true, diff: ['*.go'] }] },
    async (c) => {
      await placeSolutions(c, goAgentSession)
      const turn = await c.send(goAgentSession.prompt)
      expect(providerErrors(turn), FIXED).toEqual([])
      observeContext(c, turn)

      const grep = "grep -rEq --include=*.go --exclude=*_test.go --exclude-dir=.git"
      const imports = await c.exec(`${grep} 'genkit/go/(genkit|ai)/exp"' .`)
      expect(imports.exitCode === 0 ? [] : ['no Go file imports genkit/exp or ai/exp'], 'imports the agents packages').toEqual([])
      const optIn = await c.exec(`${grep} 'WithExperimental\\(' .`)
      expect(optIn.exitCode === 0 ? [] : ['no call to WithExperimental'], 'opts in to the experimental API').toEqual([])

      const build = await c.exec('go build ./...')
      await expect(build, 'builds').toSucceed()
      const version = await c.exec(`go list -m -f '{{.Version}}' ${GO_MODULE}`)
      c.observe('genkit-go-version', version.stdout.trim() || null)

      await c.writeFile('zz_probe_test.go', hidden('go-agent-session.go'))
      const test = await c.exec("go test -count=1 -timeout 300s -run '^TestTwoProcesses$' ./...")
      await expect(test, 'second process knows the order').toSucceed()
      c.observe('go-test-tail', `${test.stdout}\n${test.stderr}`.trim().slice(-600))

      await c.judge(AGENT_QUESTION, { task: true, transcript: 'tools', diff: ['*.go'] })
    },
  )
}

const pyToolCalling = probe('py-tool-calling')
{
  const { control, skill, index } = py('py-tool', 'py-support')
  const docs = docsArms(control, 'python')
  evaluate(
    `agents: ${pyToolCalling.name}`,
    { compare: { baseline: control, variants: [skill, index, docs.open, docs.docsite, docs.llms, docs.index], gate } },
    async (c) => {
      await placeSolutions(c, pyToolCalling)
      const turn = await c.send(pyToolCalling.prompt)
      expect(providerErrors(turn), FIXED).toEqual([])
      observeContext(c, turn)

      const tool = await c.exec("grep -rEq --include=*.py --exclude-dir=.venv '@ai\\.tool|\\.tool\\(|@tool' .")
      expect(tool.exitCode === 0 ? [] : ['no Python file defines a tool with the Genkit decorator'], 'defines a Genkit tool').toEqual([])

      const imported = await c.exec(python('-c "import app"'))
      await expect(imported, 'imports resolve').toSucceed()
      const version = await c.exec(python('-c "import importlib.metadata as m; print(m.version(\'genkit\'))"'))
      c.observe('genkit-py-version', version.stdout.trim() || null)

      await c.writeFile('~/.verify-py-tool.py', hidden('py-tool.py'))
      const run = await c.exec(python('~/.verify-py-tool.py "Where is order A-7731?"'))
      const out = result(run)
      c.observe('tool-run', typeof out === 'string' ? out.slice(0, 600) : out.reply.slice(0, 600))
      expect(typeof out === 'string' ? [out] : /back-?order/i.test(out.reply) ? [] : [`the reply does not say A-7731 is backordered: ${JSON.stringify(out.reply)}`], 'answers from the tool').toEqual([])
    },
  )
}

const pyAgentSession = probe('py-agent-session')
{
  const { control, skill, index } = py('py-session', 'py-support')
  evaluate(
    `agents: ${pyAgentSession.name}`,
    { compare: { baseline: control, variants: [skill, index], gate }, questions: [{ question: AGENT_QUESTION, across: 'environment', task: true, diff: ['*.py'] }] },
    async (c) => {
      await placeSolutions(c, pyAgentSession)
      const turn = await c.send(pyAgentSession.prompt)
      expect(providerErrors(turn), FIXED).toEqual([])
      observeContext(c, turn)

      const defined = await c.exec("grep -rEq --include=*.py --exclude-dir=.venv 'define_agent\\(' .")
      expect(defined.exitCode === 0 ? [] : ['no Python file calls define_agent'], 'defines the agent with define_agent').toEqual([])

      const imported = await c.exec(python('-c "import app"'))
      await expect(imported, 'imports resolve').toSucceed()
      const version = await c.exec(python('-c "import importlib.metadata as m; print(m.version(\'genkit\'))"'))
      c.observe('genkit-py-version', version.stdout.trim() || null)

      await c.writeFile('~/.verify-py-turn.py', hidden('py-turn.py'))
      const first = result(await c.exec(python('~/.verify-py-turn.py "" "My order id is A-7731."')))
      const second = typeof first === 'string' || first.session === '' ? undefined : result(await c.exec(python(`~/.verify-py-turn.py "${first.session}" "What is the status of my order?"`)))
      const errors =
        typeof first === 'string' ? [`first turn: ${first}`]
        : second === undefined ? ['the first turn returned no session id']
        : typeof second === 'string' ? [`second turn: ${second}`]
        : /back-?order/i.test(second.reply) ? []
        : [`the second process does not say A-7731 is backordered: ${JSON.stringify(second.reply)}`]
      c.observe('session-run', errors.map((e) => e.slice(0, 500)))
      expect(errors, 'second process knows the order').toEqual([])

      await c.judge(AGENT_QUESTION, { task: true, transcript: 'tools', diff: ['*.py'] })
    },
  )
}

const pySkillSetup = probe('py-skill-setup')
{
  // No skill arm: reeval installs the skill into the workspace itself, which would pass `adds Genkit guidance` by construction.
  const { control, index } = py('py-setup', 'py-empty')
  const GUIDANCE = /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$|(^|\/)SKILL\.md$|\.mdc$|(^|\/)\.cursorrules$|copilot-instructions\.md$|(^|\/)\.?mcp\.json$|(^|\/)\.(agents|claude|cursor|gemini)\//
  const PYTHON_API = /from genkit(_|\.| )|genkit_google_genai|genkit-google-genai|genkit\.exp|\.define_agent|@ai\.(tool|flow)|run_main/
  evaluate(
    `agents: ${pySkillSetup.name}`,
    {
      compare: { baseline: control, variants: [index], gate },
      questions: [{ question: 'Did the agent set the project up from official Genkit tooling (a Genkit skill, `genkit init:ai-tools`, the `genkit mcp` server or genkit.dev docs) rather than writing generic notes from memory?', across: 'environment', task: true, transcript: 'tools' }],
    },
    async (c) => {
      await placeSolutions(c, pySkillSetup)
      const turn = await c.send(pySkillSetup.prompt)
      expect(providerErrors(turn), FIXED).toEqual([])
      observeContext(c, turn)

      const paths = turn.diff.files.filter((f) => f.status !== 'deleted' && GUIDANCE.test(f.path)).map((f) => f.path)
      c.observe('guidance-files', paths.slice(0, 30))
      const texts = await Promise.all(paths.map(async (p) => ({ path: p, text: (await c.readFile(p)) ?? '' })))
      const genkit = texts.filter((t) => /genkit/i.test(t.text))
      expect(genkit.length > 0 ? [] : [`no new or changed guidance file mentions Genkit (${paths.join(', ') || 'none'})`], 'adds Genkit guidance').toEqual([])
      expect(genkit.some((t) => PYTHON_API.test(t.text)) ? [] : ['no guidance file shows the Genkit Python API'], 'guidance is for Python Genkit').toEqual([])
    },
  )
}
