import fs from 'node:fs'
import path from 'node:path'
import { BUGS, diagnosisErrors } from './bugs.ts'

const CAUSES: Record<string, string> = {
  'schema-drift':
    'TicketSummarySchema declares tags as z.string() instead of z.array(z.string()), so summarizeTicket returns one comma-separated string where the dashboard expects a list.',
  'tool-not-wired':
    'getOrderStatus is defined but not passed in the tools array of the orderStatus generate call, so the model never calls the tool and cannot read the order status.',
  'prompt-var-typo':
    'prompts/greet.prompt references {{custmerName}} instead of {{customerName}}, a typo, so the input variable never renders and the name is empty.',
  'truncated-output':
    "draftReply sets config maxOutputTokens: 24, so the model stops early with finishReason 'length' and the reply is truncated.",
  'history-dropped':
    'The chat flow sends only the latest message and drops the history turns, so the model has no prior context and cannot recall earlier facts.',
  'order-id-case':
    'getOrderStatus looks up ORDERS[orderId] without trimming and upper-casing the id, so a lowercase id like a-1001 is not found.',
  'delegation-dropped':
    'The triage agent() delegation list in agents() omits refundAgent, so there is no delegate_to_refundAgent tool and refund requests are never delegated.',
  'approval-ignored':
    'runTurn resumes the approveRefund interrupt with a hardcoded { approved: true } instead of the human respond payload, so a declined refund is still issued.',
  'session-not-loaded':
    'The supportTurn flow ignores the sessionId and never calls loadChat, so triage.chat() starts a new session every turn and loses the earlier messages.',
  'max-turns':
    'refundAgent has maxTurns: 1, so the agent aborts with Exceeded maximum tool call iterations before it can look up the order and reach the approveRefund interrupt.',
  'tool-choice-none':
    "triage sets toolChoice: 'none', so the model is not allowed to call tools and never delegates to orderAgent or refundAgent.",
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

const seeded = BUGS.filter((b) => readOrEmpty(b.file).split(b.to).length - 1 === 1)
const [bug, ...rest] = seeded
if (!bug || rest.length > 0) {
  fail(`expected exactly 1 seeded bug in ${process.cwd()}, found ${seeded.length}: ${seeded.map((b) => b.name).join(', ') || 'none'}`)
}

const decoy = BUGS[(BUGS.indexOf(bug) + 1) % BUGS.length]
if (!decoy) fail('no decoy bug')
const named = cheat ? decoy : bug
const cause = CAUSES[named.name]
if (!cause) fail(`no cause sentence for ${named.name}; add it to CAUSES in oracle.ts`)
const evidence = `${named.file} contains ${JSON.stringify(named.to)}; the working text is ${JSON.stringify(named.from)}.`
const answer = { file: named.file, snippet: named.to, cause, evidence }
const errors = diagnosisErrors(answer, bug)
if (cheat ? errors.length === 0 : errors.length > 0) {
  fail(`${cheat ? 'cheat' : 'oracle'} answer for ${bug.name} is ${cheat ? 'accepted' : `rejected: ${errors.join('; ')}`}`)
}

if (!cheat) {
  const file = path.resolve(process.cwd(), bug.file)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(bug.to, () => bug.from))
}

fs.writeFileSync(path.resolve(process.cwd(), 'answer.json'), JSON.stringify(answer, null, 2) + '\n')
console.log(`${cheat ? 'cheated' : 'fixed'} ${bug.name}`)
