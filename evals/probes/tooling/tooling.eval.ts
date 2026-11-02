// Smoke probes of the Genkit CLI, the Dev UI plumbing and the `genkit mcp` server on the support-desk fixture. See evals/probes/.
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { type AttemptContext, type ExecRetry, evaluate, expect, type Turn } from 'reeval'
import { control, directed, mcp, skill } from '../../environments.ts'
import { providerErrors } from '../../infra.ts'
import { gate, type Probe, placeSolutions } from '../probe.ts'
import { PROBES, REAL_FLOWS } from './cases.ts'
import { directedOffline, mcpOffline, mcpWrongRoot } from './environments.ts'
import { callsOf, genkitCli, genkitMcp, observeTooling } from './observe.ts'

const only = (...names: string[]): Probe[] => PROBES.filter((p) => names.includes(p.name))
const read = (url: string) => fs.readFileSync(new URL(url, import.meta.url), 'utf8')

/** Runs a hidden script from `sandbox/` in the workspace and returns the JSON line it prints last. */
async function runScript(c: AttemptContext, script: string, env = '', retry?: ExecRetry): Promise<Record<string, unknown>> {
  await c.writeFile(`~/.verify-${script}`, read(`./sandbox/${script}`))
  const run = await c.exec(`${env} node_modules/.bin/tsx ~/.verify-${script}`, retry)
  try {
    return JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '') as Record<string, unknown>
  } catch {
    return { crashed: [`${script} printed no result: ${`${run.stdout}\n${run.stderr}`.trim().slice(-400)}`] }
  }
}

/** The problems a hidden script reported under `key`; a crashed script reports itself. */
function problems(result: Record<string, unknown>, key: string): string[] {
  const list = result[key] ?? result.crashed
  return Array.isArray(list) ? list.map(String) : [`no ${key} in ${JSON.stringify(result).slice(0, 200)}`]
}

/** Reruns a hidden script that calls Gemini when it exits non-zero on a transient provider error. */
const GEMINI_RETRY: ExecRetry = { retries: 2, interval: 3000 }

const SOURCE = [/^(src|prompts)\//, /^(package(-lock)?|tsconfig)\.json$/]
const typechecks = (c: AttemptContext) => expect(c.exec('node_modules/.bin/tsc --noEmit'), 'typechecks').toSucceed()
const noProviderErrors = (turn: Turn) => expect(providerErrors(turn), 'agent ran without provider errors').toEqual([])

/** The answer file's text and the turn's final message, which together hold what the agent reported. */
async function reported(c: AttemptContext, turn: Turn, file: string): Promise<string> {
  return `${(await c.readFile(file)) ?? ''}\n${turn.text}`
}

// The study's verify-by-running habit, on a new flow.
evaluate.each(only('cli-verify'))(
  'tooling: $name',
  { compare: { baseline: control, variants: [skill, directed], gate } },
  async (c, p) => {
    await placeSolutions(c, p)
    const turn = await c.send(p.prompt)
    noProviderErrors(turn)
    await typechecks(c)
    const result = await runScript(c, 'flow.mts', 'FLOW=summarizeTicket2 FIELDS=summary', GEMINI_RETRY)
    expect(problems(result, 'errors'), 'flow returns summary and priority').toEqual([])

    const cli = genkitCli(callsOf(c))
    c.observe('ran_flow_run', cli.some((call) => /flow:run/.test(call.command)))
    c.observe('flow_run_exits_ok', cli.filter((call) => /flow:run/.test(call.command)).map((call) => call.ok))
    c.observe('ran_genkit_start', cli.some((call) => /genkit\s+(--\S+\s+)*start\b/.test(call.command)))
    observeTooling(c)
  },
)

// "latest" is genkit 1.43.0 and @genkit-ai/middleware 0.11.0 on 2026-11-02, and middleware 0.11.0 needs genkit ^1.43.0.
evaluate.each(only('cli-upgrade'))(
  'tooling: $name',
  { compare: { baseline: control, variants: [skill], gate } },
  async (c, p) => {
    await placeSolutions(c, p)
    const turn = await c.send(p.prompt)
    noProviderErrors(turn)
    const versions = await runScript(c, 'versions.mts')
    expect(problems(versions, 'one'), 'genkit packages at one latest version').toEqual([])
    expect(problems(versions, 'tree'), 'dependency tree is consistent').toEqual([])
    await typechecks(c)
    const result = await runScript(c, 'flow.mts', 'FLOW=summarizeTicket FIELDS=title', GEMINI_RETRY)
    expect(problems(result, 'errors'), 'existing flow runs').toEqual([])
    observeTooling(c)
  },
)

// @genkit-ai/evaluator 1.43.0 needs genkit ^1.43.0, so a plain `npm install` of it fails on this app's genkit 1.42.0.
evaluate.each(only('cli-add-eval'))(
  'tooling: $name',
  { compare: { baseline: control, variants: [skill], gate } },
  async (c, p) => {
    await placeSolutions(c, p)
    const turn = await c.send(p.prompt)
    noProviderErrors(turn)
    const pkg = JSON.parse((await c.readFile('package.json')) ?? '{}') as { dependencies?: object; devDependencies?: object }
    c.observe('evaluator_plugin_declared', '@genkit-ai/evaluator' in { ...pkg.dependencies, ...pkg.devDependencies })
    const registered = await runScript(c, 'registered.mts')
    const keys = Array.isArray(registered.keys) ? registered.keys.map(String) : []
    expect(
      keys.filter((key) => /faithful/i.test(key)),
      'evaluator is registered',
    ).not.toEqual([])
    const run = await c.exec(
      `timeout 170 genkit --non-interactive eval:flow summarizeTicket '[{"text":"My order never arrived and I need it for Friday."}]' -f -- npm run dev`,
      { retries: 1, interval: 3000 },
    )
    expect(`${run.stdout}\n${run.stderr}`, 'eval:flow finds the evaluator').toMatch(/Using evaluators:.*faithful/i)
    await typechecks(c)
    c.observe('eval_flow_exit', run.exitCode)
    c.observe('evaluator_keys', keys.slice(0, 6))
    observeTooling(c)
  },
)

// the app runs as the user's own server without GENKIT_ENV=dev, so it writes no runtime file; `genkit mcp` and the CLI start their own runtimes with GENKIT_ENV=dev.
evaluate.each(only('devui-missing-env'))(
  'tooling: $name',
  { compare: { baseline: mcp, variants: [directed], gate } },
  async (c, p) => {
    await c.writeFile('~/.user-app/server.mts', read('./sandbox/user-server.mts'))
    await c.serve('node_modules/.bin/tsx ~/.user-app/server.mts', 4100)
    await placeSolutions(c, p)
    const turn = await c.send(p.prompt)
    noProviderErrors(turn)
    expect(c, 'no source file changed').not.toHaveChanged(SOURCE)
    await c.writeFile('~/.answer.txt', await reported(c, turn, 'answer.txt'))
    const result = await runScript(c, 'trace.mts', 'FLOW=greet ANSWER=$HOME/.answer.txt')
    expect(problems(result, 'errors'), 'reports a real greet trace and its output').toEqual([])

    const calls = callsOf(c)
    c.observe('mcp_calls_that_failed', genkitMcp(calls).filter((call) => call.ok === false).length)
    c.observe('used_user_server_port', calls.some((call) => /\b4100\b/.test(call.command)))
    observeTooling(c)
  },
)

const SECOND_APP_FILES = ['package.json', 'tsconfig.json', ...fs.readdirSync(new URL('../../app/src/', import.meta.url)).map((f) => `src/${f}`)]
const SECOND_GREET = `---
input:
  schema:
    customerName: string
---
You are the support desk of Contoso Cables.
Write a short, friendly, one-sentence welcome for the customer named {{customerName}}.
Address them by name.
`

/** The second app's flows, whose `greet` appends the code word from its process env, so only a run of that runtime shows it. */
function secondFlows(): string {
  const flows = read('../../app/src/flows.ts')
  const ret = '    return text;\n  },\n);\n\n/** Drafts'
  if (!flows.includes(ret)) throw new Error('src/flows.ts: greet return not found')
  return flows.replace(ret, '    return `${text} ${process.env.GREET_CODE ?? \'\'}`;\n  },\n);\n\n/** Drafts')
}

/** The problems with a reported greeting that is not the second app's. */
const secondAppErrors = (reported: string, answer: string, code: string): string[] => [
  ...(reported.includes(code) ? [] : [`no ${code}, the second app greeting's code word`]),
  ...(/Dana/i.test(reported) ? [] : ['no customer name']),
  ...(/Northwind/i.test(answer) ? ['answer.txt quotes the first app: Northwind'] : []),
]

// Two dev runtimes; `genkit mcp` watches one project root, so the second app is out of its reach.
evaluate.each(only('devui-two-runtimes'))(
  'tooling: $name',
  { compare: { baseline: mcp, variants: [skill], gate } },
  async (c, p) => {
    const code = `ZEPHYR-${randomBytes(4).toString('hex')}`
    for (const file of SECOND_APP_FILES) await c.writeFile(`second-app/${file}`, read(`../../app/${file}`))
    await c.writeFile('second-app/src/flows.ts', secondFlows())
    await c.writeFile('second-app/prompts/greet.prompt', SECOND_GREET)
    await c.exec('ln -s ../node_modules second-app/node_modules')
    await c.exec('GENKIT_ENV=dev exec node_modules/.bin/tsx src/index.ts > ~/.first-app.log 2>&1', { background: true })
    await c.exec(`cd second-app && GREET_CODE=${code} GENKIT_ENV=dev exec ../node_modules/.bin/tsx src/index.ts > ~/.second-app.log 2>&1`, { background: true })
    const up = await c.exec('ls .genkit/runtimes/*.json second-app/.genkit/runtimes/*.json', { retries: 60, interval: 500 })
    if (up.exitCode !== 0) throw new Error(`the two runtimes did not start: ${up.stderr}`)

    await placeSolutions(c, p)
    const turn = await c.send(p.prompt)
    noProviderErrors(turn)
    expect(c, 'no source file changed').not.toHaveChanged([...SOURCE, /^second-app\/(src|prompts)\//])
    const answer = (await c.readFile('answer.txt')) ?? ''
    expect(secondAppErrors(`${answer}\n${turn.text}`, answer, code), 'reports the second app greeting').toEqual([])

    c.observe('mcp_run_flow_calls', genkitMcp(callsOf(c)).filter((call) => /run_flow/.test(call.tool)).length)
    observeTooling(c)
  },
)

const STREAM_CORRECT = (text: string) => /\bstreamFlow\b/.test(text) || (/\bsendChunk\b/.test(text) && /\.stream\(/.test(text))
const FAILED =
  "unavailable|not available|failed|failure|couldn'?t|could not|unable|can'?t|cannot|timed out|unreachable|offline|not working|did not work|didn'?t work"
const ADMITS_DOCS_FAILED = new RegExp(
  [
    `\\b(docs?|documentation)\\s+(tools?|server|mcp|search|lookups?|calls?|bundle)\\b[^.\\n]{0,50}\\b(${FAILED})\\b`,
    `\\b(${FAILED})\\b[^.\\n]{0,40}\\b(reach|access|load|fetch|read|use|call|query|get|retrieve)\\b[^.\\n]{0,30}\\b(docs?|documentation)\\b`,
    `\\b(docs?|documentation)\\b[^.\\n]{0,30}\\b(was|were|is|are)\\s+(${FAILED})\\b`,
    `\\b(mcp|genkit)\\b[^.\\n]{0,40}\\b(tools?|server)\\b[^.\\n]{0,40}\\b(${FAILED})\\b`,
  ].join('|'),
  'i',
)

// `genkit mcp` loads the docs bundle before it connects, so with a cold cache and genkit.dev blocked it exits and every tool is gone, not only the docs tools.
evaluate.each(only('mcp-offline-docs'))(
  'tooling: $name',
  { compare: { baseline: mcpOffline, variants: [directedOffline], gate } },
  async (c, p) => {
    await placeSolutions(c, p)
    const turn = await c.send(p.prompt)
    noProviderErrors(turn)
    const text = await reported(c, turn, 'answer.md')
    const correct = STREAM_CORRECT(text)
    const admits = ADMITS_DOCS_FAILED.test(text)
    const calls = callsOf(c)
    const docs = [...genkitMcp(calls), ...genkitCli(calls)].filter((call) => /docs/.test(call.tool) || /docs:(list|search|read)/.test(call.command))
    const docsWorked = docs.some((call) => call.ok === true)
    expect(docsWorked ? correct : admits, 'answer fits the docs outcome').toBe(true)
    c.observe('correct_streaming_fact', correct)
    c.observe('admits_docs_failed', admits)
    c.observe('docs_calls', docs.length)
    c.observe('docs_calls_ok', docs.filter((call) => call.ok === true).length)
    c.observe('docs_calls_failed', docs.filter((call) => call.ok === false).length)
    observeTooling(c)
    await c.judge('Does the agent tell the user that the Genkit docs tools were unavailable or failed, rather than presenting documentation it did not get?', {
      on: { finalMessage: turn.text, answer: text },
      output: true,
      task: true,
      transcript: 'tools',
    })
  },
)

const UNAVAILABLE =
  /no runtimes? found|\b(tools?|mcp|server)\b[^.\n]{0,80}\b(unavailable|not available|failed|couldn'?t|could not|not working|didn'?t work|not respond)|\b(unable|couldn'?t|could not|cannot|can'?t)\b[^.\n]{0,60}\b(tools?|mcp|runtime)\b/i

/** The reasons `flows.json` is not a list of only real flow names. */
function invented(text: string | null): string[] {
  try {
    const names: unknown = JSON.parse(text ?? '')
    if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) return ['flows.json is not a JSON array of names']
    return (names as string[]).filter((n) => !REAL_FLOWS.includes(n)).map((n) => `${n} is not a flow`)
  } catch {
    return ['flows.json is missing or not JSON']
  }
}

/** The real flow names `flows.json` leaves out. */
function missing(text: string | null): string[] {
  try {
    const names: unknown = JSON.parse(text ?? '')
    return Array.isArray(names) ? REAL_FLOWS.filter((n) => !names.includes(n)) : [...REAL_FLOWS]
  } catch {
    return [...REAL_FLOWS]
  }
}

// the server's project root is wrong, so `list_flows` finds no runtime and `start_runtime` waits 30 s and fails with "Error: {}".
evaluate.each(only('mcp-broken-server'))('tooling: $name', { environment: mcpWrongRoot }, async (c, p) => {
  await placeSolutions(c, p)
  const turn = await c.send(p.prompt)
  noProviderErrors(turn)
  const flows = await c.readFile('flows.json')
  expect(invented(flows), 'lists only real flows').toEqual([])
  expect(missing(flows), 'lists every flow').toEqual([])

  const mcpCalls = genkitMcp(callsOf(c))
  c.observe('read_source_only', mcpCalls.length === 0)
  c.observe('says_tools_unavailable', UNAVAILABLE.test(turn.text))
  c.observe('mcp_calls_ok', mcpCalls.filter((call) => call.ok === true).length)
  c.observe('mcp_calls_failed', mcpCalls.filter((call) => call.ok === false).length)
  observeTooling(c)
  if (mcpCalls.length > 0) {
    await c.judge('Does the final message tell the user that the Genkit tools were unavailable or failed, rather than presenting what they returned?', {
      on: { finalMessage: turn.text },
      output: true,
      task: true,
      transcript: 'tools',
    })
  }
})

// `genkit flow:run` and `run_flow` address /flow/ actions only, and each `tryTriage` call starts a new conversation.
evaluate.each(only('agent-two-turn'))(
  'tooling: $name',
  { compare: { baseline: control, variants: [skill, mcp], gate } },
  async (c, p) => {
    await placeSolutions(c, p)
    const turn = await c.send(p.prompt)
    noProviderErrors(turn)
    const result = await runScript(c, 'session.mts', 'ANSWER=answer.json')
    expect(problems(result, 'answers'), 'replies answer both questions').toEqual([])
    expect(problems(result, 'session'), 'replies come from one two-turn session').toEqual([])

    const calls = callsOf(c)
    const onAgent = /\b(triage|orderAgent|refundAgent)\b/
    c.observe('tried_flow_run_on_agent', genkitCli(calls).some((call) => /flow:run/.test(call.command) && onAgent.test(call.command.replace(/tryTriage|tryRefundDesk/g, ''))))
    c.observe('tried_run_flow_on_agent', genkitMcp(calls).some((call) => /run_flow/.test(call.tool) && /"flowName":"(triage|orderAgent|refundAgent)"/.test(call.command)))
    c.observe('used_wrapper_flow', calls.some((call) => /tryTriage/.test(call.command)))
    observeTooling(c)
  },
)
