import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BUGS, causeErrors, locationErrors } from './bugs.ts'
import { HEALTHY, isBuildStart, TASKS } from './tasks.ts'

const CAUSES: Record<string, string> = {
  'schema-drift':
    'TicketSummarySchema declares tags as z.string() instead of z.array(z.string()), so summarizeTicket returns one comma-separated string where the dashboard expects a list.',
  'prompt-var-typo':
    'prompts/greet.prompt references {{custmerName}} instead of {{customerName}}, a typo, so the input variable never renders and the name is empty.',
  'prompt-model-override':
    'prompts/greet.prompt pins model: googleai/gemini-1.5-flash in its front matter, a model the app never configured and Google no longer serves, so the greet flow fails instead of using the default gemini-2.5-flash.',
  'order-id-case':
    'lookupOrder reads ORDERS[orderId] without trimming and upper-casing the id, so a lowercase id like a-1001 is not found and the tool returns null.',
  'tool-requests-returned':
    'orderStatus passes returnToolRequests: true to generate, so the call returns the lookupOrder tool request instead of running it and the flow returns empty text.',
  'stop-sequence':
    "draftReply passes config stopSequences: ['\\n'] to generate, so the model stops at the first line break and the reply ends after its greeting line.",
  'delegation-dropped':
    'The agents() middleware on triage lists only orderAgent, so there is no delegate_to_refundAgent tool and refund requests are never delegated.',
  'session-not-loaded':
    'triage no longer passes the FileSessionStore as store, so its sessions are client-managed and loadChat({ sessionId }) throws instead of continuing the conversation.',
  'tool-choice-required':
    "refundAgent sets toolChoice: 'required', so after a declined approval the model must call a tool on every turn and can never return a final text reply before maxTurns.",
  'max-delegations-zero':
    'The agents() middleware on triage sets maxDelegations: 0, so every delegate_to_* call returns Delegation limit reached and no sub-agent ever looks up the order.',
  'max-turns-zero':
    'triage sets maxTurns: 0, so the first delegation tool call exceeds the turn limit and the agent aborts instead of answering.',
  'tool-output-drift':
    'orders.json stores A-1001 total as the string "149.99", which fails lookupOrder outputSchema total: z.number(), so orderAgent fails on that order.',
}

function fail(message: string): never {
  console.error(`oracle: ${message}`)
  process.exit(1)
}

const cheat = process.argv.includes('--cheat')

const readOrEmpty = (file: string) => {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
  } catch {
    return ''
  }
}

const taskFile = path.join(os.homedir(), '.task')
const taskName = fs.existsSync(taskFile) ? fs.readFileSync(taskFile, 'utf8').trim() : null
const buildStart = isBuildStart((file) => {
  const at = path.resolve(process.cwd(), file)
  return fs.existsSync(at) ? fs.readFileSync(at, 'utf8') : null
})
if (buildStart !== (taskName !== null)) fail(`~/.task is ${JSON.stringify(taskName)} but the workspace ${buildStart ? 'is' : 'is not'} a build start state`)
if (taskName !== null) {
  const task = TASKS.find((t) => t.name === taskName)
  if (!task) fail(`~/.task names no build task: ${JSON.stringify(taskName)}`)
  const files = cheat ? task.cheat.files : HEALTHY
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.resolve(process.cwd(), file), text)
  console.log(cheat ? `wrote a wrong ${task.name}, which must fail ${task.cheat.fails.join(', ')}` : `built ${task.name}`)
  process.exit(0)
}

const seeded = BUGS.filter((b) => readOrEmpty(b.file).split(b.to).length - 1 === 1)
const [bug, ...rest] = seeded
if (!bug || rest.length > 0) {
  fail(`expected exactly 1 seeded bug in ${process.cwd()}, found ${seeded.length}: ${seeded.map((b) => b.name).join(', ') || 'none'}`)
}

const decoy = BUGS.find((b) => b.file !== bug.file)
if (!decoy) fail('no decoy bug')
const named = cheat ? decoy : bug
const cause = CAUSES[named.name]
if (!cause) fail(`no cause sentence for ${named.name}; add it to CAUSES in oracle.ts`)
const evidence = `${named.file} contains ${JSON.stringify(named.to)}; the working text is ${JSON.stringify(named.from)}.`
const answer = { file: named.file, snippet: named.to, cause, evidence }
const file = path.resolve(process.cwd(), bug.file)
const broken = fs.readFileSync(file, 'utf8')
const healthy = broken.replace(bug.to, () => bug.from)
const checks = { 'locates the file': locationErrors(answer, bug), 'names the cause': causeErrors(answer, bug, healthy) }
for (const [check, errors] of Object.entries(checks)) {
  if (cheat ? errors.length === 0 : errors.length > 0) {
    fail(`${cheat ? 'cheat' : 'oracle'} answer for ${bug.name} ${cheat ? 'passes' : 'fails'} ${check}${cheat ? '' : `: ${errors.join('; ')}`}`)
  }
}

if (!cheat) fs.writeFileSync(file, healthy)

fs.writeFileSync(path.resolve(process.cwd(), 'answer.json'), JSON.stringify(answer, null, 2) + '\n')
console.log(`${cheat ? 'cheated' : 'fixed'} ${bug.name}`)
