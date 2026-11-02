import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { type AttemptContext, type ExecResult, evaluate, expect } from 'reeval'
import { docsArms } from '../environments.ts'
import { gate, noProviderErrors, type ProbeResult, parseResult, placeSolutions, type Probe } from '../probe.ts'
import { callsOf, isShell, observeGenkitCommands, observeWeb } from '../transcript.ts'
import { GO_MODULE, PROBES } from './cases.ts'
import { arms } from './environments.ts'

const hidden = (file: string) => readFileSync(new URL(`./sandbox/hidden/${file}`, import.meta.url), 'utf8')
const probe = (name: string): Probe => {
  const found = PROBES.find((p) => p.name === name)
  if (!found) throw new Error(`no probe ${name}`)
  return found
}

/** The project's interpreter: the `.venv` the agent made, else the system `python3`. */
const python = (args: string) => `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python || echo python3); timeout 300 "$PY" ${args}`

/** What a hidden script printed after `PROBE_RESULT`, or why there is none. */
function result(run: ExecResult): { reply: string; session: string } | string {
  const parsed: ProbeResult | string = parseResult(run)
  if (typeof parsed === 'string') return parsed
  const { reply, session } = parsed
  return { reply: typeof reply === 'string' ? reply : '', session: typeof session === 'string' ? session : '' }
}

const VERBS = ['held', 'waiting', 'queued', 'stored', 'parked']
const FIRST = ['Juniper', 'Marlowe', 'Cobalt', 'Harbor', 'Willow', 'Tamarack', 'Quarry', 'Sable', 'Alder', 'Fennel', 'Granite']
const SECOND = ['Northgate', 'Millbrook', 'Ridgeway', 'Stonebridge', 'Larkspur', 'Foxglove', 'Ashford', 'Bramley', 'Corvin', 'Dunmore', 'Elmwood', 'Fairhaven']
const pick = (words: string[]) => words[randomInt(words.length)] ?? ''

const randomStatus = () => {
  const marks = [pick(FIRST), pick(SECOND)]
  return { status: `${pick(VERBS)} at the ${marks.join(' ')} depot`, marks }
}

/** Replaces the workspace's `orders.json` with a target order and four decoys, all with random ids and statuses, and returns the target; the app must read the file when the tool runs. */
async function placeOrder(c: AttemptContext) {
  const ids = new Set<string>()
  while (ids.size < 5) ids.add(`A-${randomInt(1000, 10000)}`)
  const [target = '', ...decoys] = [...ids]
  const order = { id: target, eta: '2026-12-04', ...randomStatus() }
  const table: Record<string, { status: string; eta: string }> = { [target]: { status: order.status, eta: order.eta } }
  for (const id of decoys) table[id] = { status: randomStatus().status, eta: '2026-12-04' }
  await c.writeFile('orders.json', `${JSON.stringify(table, null, 2)}\n`)
  return order
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')
const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`

/** Whether `reply` names both random words of `order`'s status, as whole words. */
const givesStatus = (reply: string, order: { marks: string[] }) => order.marks.every((mark) => new RegExp(`\\b${mark}\\b`, 'i').test(reply))

/** The lines a unified `patch` adds, per file whose path matches `paths`; environment-placed files are not in a turn's diff. */
function addedGuidance(patch: string, paths: RegExp): Record<string, string> {
  const added: Record<string, string[]> = {}
  let file: string | undefined
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '')
      file = path === '/dev/null' || !paths.test(path) ? undefined : path
    } else if (file !== undefined && line.startsWith('+')) (added[file] ??= []).push(line.slice(1))
  }
  return Object.fromEntries(Object.entries(added).map(([path, lines]) => [path, lines.join('\n')]))
}

/** Which Genkit CLI commands and skills installs the agent ran, what it fetched and how often it searched, recorded and never gated. */
function observeContext(c: AttemptContext): void {
  const calls = callsOf(c)
  observeGenkitCommands(c)
  const installs = calls.filter(isShell).flatMap((call) => [...call.command.matchAll(/\b(npx skills[^"\\]*|skills\.sh)/g)].map((m) => m[1] ?? ''))
  c.observe('skills-installs', [...new Set(installs)].slice(0, 20))
  observeWeb(c)
  const conflicts = c.turns.flatMap((t) => t.transcript).flatMap((e) => {
    if (e.type !== 'tool' || !/\b(pip3?|uv)\b/.test(JSON.stringify(e.input ?? ''))) return []
    const out = JSON.stringify(e.output ?? '')
    return /conflict|ResolutionImpossible/i.test(out) ? [out.slice(0, 300)] : []
  })
  c.observe('install-conflicts', conflicts.slice(0, 5))
}

const AGENT_QUESTION =
  "Did the agent build the conversation with Genkit's agents API (an agent defined with a session store, such as `define_agent` in Python or `genkitx.DefineAgent` in Go) " +
  'rather than a hand-rolled loop over `generate` calls that stores the history itself?'

const go = (id: string, fixture: string) => arms(id, 'go', fixture)
const py = (id: string, fixture: string) => arms(id, 'python', fixture)

const GO_MOD_REQUIRES = new RegExp(`^\\s*(?:require\\s+)?${GO_MODULE.replaceAll('.', '\\.')}\\s+v\\d`, 'm')

const goNewApp = probe('go-new-app')
{
  const { control, skill } = go('go-new', 'go-empty')
  const docs = docsArms(control, 'go', 'go-new')
  evaluate(
    `agents: ${goNewApp.name}`,
    { compare: { baseline: control, variants: [skill, docs.open, docs.docsite, docs.llms, docs.index], gate } },
    async (c) => {
      await placeSolutions(c, goNewApp)
      const turn = await c.send(goNewApp.prompt)
      noProviderErrors(turn)
      observeContext(c)
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
  const { control, skill } = go('go-session', 'go-support')
  const { index } = docsArms(control, 'go', 'go-session')
  evaluate(
    `agents: ${goAgentSession.name}`,
    { compare: { baseline: control, variants: [skill, index], gate }, questions: [{ question: AGENT_QUESTION, across: 'environment', task: true, diff: ['*.go'] }] },
    async (c) => {
      await placeSolutions(c, goAgentSession)
      const turn = await c.send(goAgentSession.prompt)
      noProviderErrors(turn)
      observeContext(c)

      const grep = "grep -rEq --include=*.go --exclude=*_test.go --exclude-dir=.git"
      const imports = await c.exec(`${grep} 'genkit/go/(genkit|ai)/exp"' .`)
      expect(imports.exitCode === 0 ? [] : ['no Go file imports genkit/exp or ai/exp'], 'imports the agents packages').toEqual([])
      const optIn = await c.exec(`${grep} 'WithExperimental\\(' .`)
      expect(optIn.exitCode === 0 ? [] : ['no call to WithExperimental'], 'opts in to the experimental API').toEqual([])

      const build = await c.exec('go build ./...')
      await expect(build, 'builds').toSucceed()
      const version = await c.exec(`go list -m -f '{{.Version}}' ${GO_MODULE}`)
      c.observe('genkit-go-version', version.stdout.trim() || null)

      const order = await placeOrder(c)
      await c.writeFile('zz_probe_test.go', hidden('go-agent-session.go'))
      const test = await c.exec(`PROBE_ORDER_ID=${order.id} go test -count=1 -timeout 300s -run '^TestProbeTwoProcesses$' .`)
      await expect(test, 'second process knows the order').toSucceed()
      c.observe('go-test-tail', `${test.stdout}\n${test.stderr}`.trim().slice(-600))

      await c.judge(AGENT_QUESTION, { task: true, transcript: 'tools', diff: ['*.go'] })
    },
  )
}

const pyToolCalling = probe('py-tool-calling')
{
  const { control, skill } = py('py-tool', 'py-support')
  const docs = docsArms(control, 'python', 'py-tool')
  evaluate(
    `agents: ${pyToolCalling.name}`,
    { compare: { baseline: control, variants: [skill, docs.open, docs.docsite, docs.llms, docs.index], gate } },
    async (c) => {
      await placeSolutions(c, pyToolCalling)
      const turn = await c.send(pyToolCalling.prompt)
      noProviderErrors(turn)
      observeContext(c)

      const tool = await c.exec("grep -rEq --include=*.py --exclude-dir=.venv '@ai\\.tool|\\.tool\\(|@tool' .")
      expect(tool.exitCode === 0 ? [] : ['no Python file defines a tool with the Genkit decorator'], 'defines a Genkit tool').toEqual([])

      const imported = await c.exec(python('-c "import app"'))
      await expect(imported, 'imports resolve').toSucceed()
      const version = await c.exec(python('-c "import importlib.metadata as m; print(m.version(\'genkit\'))"'))
      c.observe('genkit-py-version', version.stdout.trim() || null)

      await c.writeFile('~/.verify-py-tool.py', hidden('py-tool.py'))
      const order = await placeOrder(c)
      const run = await c.exec(python(`~/.verify-py-tool.py ${shellQuote(`Where is order ${order.id}? Reply with its status.`)}`))
      const out = result(run)
      c.observe('tool-run', typeof out === 'string' ? out.slice(0, 600) : out.reply.slice(0, 600))
      expect(typeof out === 'string' ? [out] : givesStatus(out.reply, order) ? [] : [`the reply does not give the status ${order.status} of ${order.id}: ${JSON.stringify(out.reply)}`], 'answers from the tool').toEqual([])
    },
  )
}

const pyAgentSession = probe('py-agent-session')
{
  const { control, skill } = py('py-session', 'py-support')
  const { index } = docsArms(control, 'python', 'py-session')
  evaluate(
    `agents: ${pyAgentSession.name}`,
    { compare: { baseline: control, variants: [skill, index], gate }, questions: [{ question: AGENT_QUESTION, across: 'environment', task: true, diff: ['*.py'] }] },
    async (c) => {
      await placeSolutions(c, pyAgentSession)
      const turn = await c.send(pyAgentSession.prompt)
      noProviderErrors(turn)
      observeContext(c)

      const defined = await c.exec("grep -rEq --include=*.py --exclude-dir=.venv 'define_agent\\(' .")
      expect(defined.exitCode === 0 ? [] : ['no Python file calls define_agent'], 'defines the agent with define_agent').toEqual([])

      const imported = await c.exec(python('-c "import app"'))
      await expect(imported, 'imports resolve').toSucceed()
      const version = await c.exec(python('-c "import importlib.metadata as m; print(m.version(\'genkit\'))"'))
      c.observe('genkit-py-version', version.stdout.trim() || null)

      await c.writeFile('~/.verify-py-turn.py', hidden('py-turn.py'))
      const order = await placeOrder(c)
      const first = result(await c.exec(python(`~/.verify-py-turn.py '' ${shellQuote(`My order id is ${order.id}. What is its status?`)}`)))
      const second = typeof first === 'string' || first.session === '' ? undefined : result(await c.exec(python(`~/.verify-py-turn.py ${shellQuote(first.session)} ${shellQuote('What order id did I give you earlier? Reply with only the id.')}`)))
      const errors =
        typeof first === 'string' ? [`first turn: ${first}`]
        : !givesStatus(first.reply, order) ? [`the first turn does not give the status ${order.status} of ${order.id}: ${JSON.stringify(first.reply)}`]
        : second === undefined ? ['the first turn returned no session id']
        : typeof second === 'string' ? [`second turn: ${second}`]
        : squash(second.reply).includes(squash(order.id)) ? []
        : [`the second process does not recall ${order.id}: ${JSON.stringify(second.reply)}`]
      c.observe('session-run', errors.map((e) => e.slice(0, 500)))
      expect(errors, 'second process knows the order').toEqual([])

      await c.judge(AGENT_QUESTION, { task: true, transcript: 'tools', diff: ['*.py'] })
    },
  )
}

const pySkillSetup = probe('py-skill-setup')
{
  const { control, skill } = py('py-setup', 'py-empty')
  const { index } = docsArms(control, 'python', 'py-setup')
  const GUIDANCE = /(^|\/)(AGENTS|CLAUDE|GEMINI|GENKIT)\.md$|(^|\/)SKILL\.md$|\.mdc$|(^|\/)\.cursorrules$|copilot-instructions\.md$|(^|\/)\.?mcp\.json$|(^|\/)\.(agents|claude|cursor|gemini)\//
  const PYTHON_API = /from genkit(_|\.| )|genkit_google_genai|genkit-google-genai|genkit\.exp|\.define_agent|@ai\.(tool|flow)|run_main/
  evaluate(
    `agents: ${pySkillSetup.name}`,
    {
      compare: { baseline: control, variants: [skill, index], gate },
      questions: [{ question: 'Did the agent set the project up from official Genkit tooling (a Genkit skill, `genkit init:ai-tools`, the `genkit mcp` server or genkit.dev docs) rather than writing generic notes from memory?', across: 'environment', task: true, transcript: 'tools' }],
    },
    async (c) => {
      await placeSolutions(c, pySkillSetup)
      const turn = await c.send(pySkillSetup.prompt)
      noProviderErrors(turn)
      observeContext(c)

      const added = addedGuidance(turn.diff.patch, GUIDANCE)
      c.observe('guidance-files', Object.keys(added).slice(0, 30))
      const genkit = Object.entries(added).filter(([, text]) => /genkit/i.test(text))
      expect(genkit.length > 0 ? [] : [`no line the agent added to a guidance file mentions Genkit (${Object.keys(added).join(', ') || 'none'})`], 'adds Genkit guidance').toEqual([])
      expect(genkit.some(([, text]) => PYTHON_API.test(text)) ? [] : ['no line the agent added to a guidance file shows the Genkit Python API'], 'guidance is for Python Genkit').toEqual([])
    },
  )
}
