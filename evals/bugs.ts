import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** One seeded bug: swapping `from` for `to` in `file` breaks exactly one flow or agent scenario. */
export type Bug = {
  /** kebab-case; the eval name and the key in `verify.ts` */
  name: string
  /** `flow` bugs make up the flows study, `agent` bugs the agents study */
  kind: 'flow' | 'agent'
  /** workspace-relative file the bug lives in */
  file: string
  /** exact healthy snippet, unique in `file` */
  from: string
  /** exact broken snippet, absent from the healthy `file` */
  to: string
  /** the bug report the agent gets; never names the tooling */
  symptom: string
  /** must still match `file` after the fix (anti-cheat) */
  keeps: RegExp[]
  /**
   * What `verify.ts` calls the app with; every string in it appears literally there. For agent
   * bugs, `turns` are sent in order to `flow`, each later turn with the previous `sessionId`; a
   * string turn is a `message`, an object turn is the rest of the input (e.g. `respond`).
   */
  verifyInput: unknown
}

/** Seeded bugs for the support-desk app, flows first, then agents. */
export const BUGS: Bug[] = [
  {
    name: 'schema-drift',
    kind: 'flow',
    file: 'src/index.ts',
    from: "'Set priority to low, medium or high, where high means the customer is blocked.',",
    to: "'Set priority to P0, P1 or P2, where P0 means the customer is blocked.',",
    symptom:
      'I run summarizeTicket on a ticket about a cracked monitor that arrived damaged, and instead of a summary I get an error saying the model output does not match the expected format. ' +
      'It used to return a title, a priority of low, medium or high, and some tags; the dashboard still expects those three priorities. It fails on every ticket I try.',
    keeps: [/name: 'summarizeTicket'/, /z\.enum\(\['low', 'medium', 'high'\]\)/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: {
      text: 'My order A-1002 arrived with a cracked monitor and the box was soaked. I need a replacement before Monday for a client demo.',
    },
  },
  {
    name: 'tool-not-wired',
    kind: 'flow',
    file: 'src/index.ts',
    from: 'tools: [getOrderStatus],',
    to: 'tools: [],',
    symptom:
      'I ask the orderStatus flow "Where is order A-1001?" and it replies that it cannot look up orders, or it makes up a vague answer. ' +
      'The order is in our system and is marked shipped. I expected the reply to give the real status and delivery date.',
    keeps: [/name: 'orderStatus'/, /name: 'getOrderStatus'/, /tools:\s*\[[^\]]*getOrderStatus/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: { question: 'Where is order A-1001?' },
  },
  {
    name: 'prompt-var-typo',
    kind: 'flow',
    file: 'prompts/greet.prompt',
    from: '{{customerName}}',
    to: '{{custmerName}}',
    symptom:
      'The greet flow for customer "Ada" returns a generic welcome like "Welcome to Northwind Supplies!" that never uses her name. ' +
      'Other customers get the same nameless greeting. I expected a one-sentence welcome that addresses the customer by name.',
    keeps: [/\{\{\s*customerName\s*\}\}/, /customerName: string/],
    verifyInput: { customerName: 'Ada' },
  },
  {
    name: 'truncated-output',
    kind: 'flow',
    file: 'src/index.ts',
    from: 'prompt: ticket,\n      config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },',
    to: 'prompt: ticket,\n      config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 24 },',
    symptom:
      'The replies that draftReply writes for customer tickets are far too short and end abruptly, usually right after the greeting. ' +
      'I expected a complete reply that explains the next steps and signs off from the support team.',
    keeps: [/name: 'draftReply'/, /finishReason: response\.finishReason/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: {
      ticket:
        'Hi, I ordered three boxes of A4 paper two weeks ago (order A-1002) and the tracking page still says processing. Can you tell me what is going on and when it will ship?',
    },
  },
  {
    name: 'history-dropped',
    kind: 'flow',
    file: 'src/index.ts',
    from: 'messages: history.map(({ role, text }) => ({ role, content: [{ text }] })),',
    to: 'messages: [],',
    symptom:
      'In the chat flow the assistant forgets everything from earlier in the conversation. ' +
      'I tell it my name is Ada, then ask "What is my name?" and it says it does not know. ' +
      'I expected it to remember what I said earlier.',
    keeps: [/name: 'chat'/, /history\.map|\.\.\.history|messages:[^\n]*history/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: {
      history: [
        { role: 'user', text: 'My name is Ada.' },
        { role: 'model', text: 'Nice to meet you, Ada. How can I help?' },
      ],
      message: 'What is my name?',
    },
  },
  {
    name: 'order-id-case',
    kind: 'flow',
    file: 'src/index.ts',
    from: 'async ({ orderId }) => ORDERS[orderId.trim().toUpperCase()] ?? null,',
    to: 'async ({ orderId }) => ORDERS[orderId] ?? null,',
    symptom:
      'Some customers with valid orders are told their order does not exist. ' +
      'One customer asked the orderStatus flow "where is order a-1001?" and got that answer, but A-1001 is in our system and has shipped. ' +
      'I expected the reply to give the status and delivery date.',
    keeps: [/name: 'orderStatus'/, /name: 'getOrderStatus'/, /tools:\s*\[[^\]]*getOrderStatus/, /ORDERS/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: { question: 'where is order a-1001?' },
  },
  {
    name: 'delegation-dropped',
    kind: 'agent',
    file: 'src/agents.ts',
    from: "agents: ['orderAgent', 'refundAgent']",
    to: "agents: ['orderAgent']",
    symptom:
      'In the support chat I write "I want a refund for order A-1001, it arrived broken" and the assistant never hands it to the refund desk. ' +
      'It says it cannot process refunds or just asks me for more details, and no refund approval request ever shows up. ' +
      'Questions about where an order is still get answered correctly. Refunds worked through this chat before.',
    keeps: [/name: 'triage'/, /agents: \[[^\]]*'orderAgent'/, /name: 'refundAgent'/, /name: 'supportTurn'/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: { flow: 'supportTurn', turns: ['I want a refund for order A-1001, it arrived broken.'] },
  },
  {
    name: 'approval-ignored',
    kind: 'agent',
    file: 'src/agents.ts',
    from: 'const res = await chat.resume({ respond: [{ toolResponse: { name, ref, output: respond } }] });',
    to: 'const res = await chat.resume({ respond: [{ toolResponse: { name, ref, output: { approved: true } } }] });',
    symptom:
      'On the refund desk a customer wrote "I want a refund for order A-1001, it arrived broken." The desk asked for approval as usual, ' +
      'and the supervisor declined it as a duplicate claim. The customer still got the refund. ' +
      'A refund that a supervisor declines must never go out.',
    keeps: [/name: 'refundAgent'/, /name: 'refundTurn'/, /name: 'approveRefund'/, /tools: \[[^\]]*approveRefund[^\]]*issueRefund[^\]]*\]/, /chat\.resume\(/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: {
      flow: 'refundTurn',
      turns: ['I want a refund for order A-1001, it arrived broken.', { respond: { approved: false, note: 'duplicate claim' } }],
    },
  },
  {
    name: 'session-not-loaded',
    kind: 'agent',
    file: 'src/agents.ts',
    from: 'const chat = sessionId ? await triage.loadChat({ sessionId }) : triage.chat();',
    to: 'const chat = triage.chat();',
    symptom:
      'In the support chat a customer says "My order is A-1001." and then, in the same conversation, sends "What is its status?". ' +
      'The assistant acts as if it never saw the first message and asks which order they mean. ' +
      'We send the same session id with the follow-up, but every message behaves like a brand new conversation.',
    keeps: [/name: 'triage'/, /name: 'supportTurn'/, /triage\.loadChat\(|triage\.chat\(\{[^}]*sessionId/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: { flow: 'supportTurn', turns: ['My order is A-1001.', 'What is its status?'] },
  },
  {
    name: 'max-turns',
    kind: 'agent',
    file: 'src/agents.ts',
    from: 'maxTurns: 6,',
    to: 'maxTurns: 1,',
    symptom:
      'On the refund desk, refund requests fail before the approval prompt ever appears. ' +
      'For "I want a refund for order A-1001, it arrived broken" the desk returns an error instead of asking a person to approve. ' +
      'It used to look up the order and then ask for approval. Now no refund request gets that far.',
    keeps: [/name: 'refundAgent'/, /name: 'refundTurn'/, /tools: \[[^\]]*approveRefund[^\]]*issueRefund[^\]]*\]/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: { flow: 'refundTurn', turns: ['I want a refund for order A-1001, it arrived broken.'] },
  },
  {
    name: 'tool-choice-none',
    kind: 'agent',
    file: 'src/agents.ts',
    from: "maxTurns: 5,\n    toolChoice: 'auto',",
    to: "maxTurns: 5,\n    toolChoice: 'none',",
    symptom:
      'In the support chat I ask "Where is order A-1001?" and get a generic reply like "I am not able to look up orders". ' +
      'The assistant never consults the order desk, although it used to give the real status and delivery date. ' +
      'It happens on every order question.',
    keeps: [/name: 'triage'/, /use: \[\s*agents\(/, /name: 'supportTurn'/, /googleAI\.model\('gemini-2\.5-flash'\)/],
    verifyInput: { flow: 'supportTurn', turns: ['Where is order A-1001?'] },
  },
  {
    name: 'tool-output-drift',
    kind: 'agent',
    file: 'src/db.ts',
    from: '"total": 149.99',
    to: '"total": "149.99"',
    symptom:
      'This week the support chat started failing on some orders. A customer asked "Where is order A-1001?" and the assistant said it could not retrieve the order details, ' +
      'although A-1001 is in our system and has shipped. Questions about other orders, such as A-1002, still get the real status and delivery date.',
    keeps: [/"A-1001": \{[^}]*"eta": "2026-10-22"/, /export const ORDERS/],
    verifyInput: { flow: 'supportTurn', turns: ['Where is order A-1001?'] },
  },
]

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

const workspacePath = (file: string) => file.replace(/^\/reeval\/workspace\//, '').replace(/^(\.\/)+/, '')

/**
 * Why `answer` (the parsed `answer.json`) does not locate `bug`; empty when it does. The answer
 * locates the bug when `file` is `bug.file` and `snippet` overlaps `bug.to` (one contains the other,
 * whitespace collapsed). A snippet inside `bug.to` must also be absent from `bug.from`, so a quote of
 * an unchanged neighbouring line does not count.
 */
export function diagnosisErrors(answer: unknown, bug: Bug): string[] {
  const field = (key: string) => {
    const value = typeof answer === 'object' && answer !== null ? Reflect.get(answer, key) : undefined
    return typeof value === 'string' ? value : ''
  }
  const errors: string[] = []
  const file = workspacePath(field('file'))
  if (file !== bug.file) errors.push(`file ${JSON.stringify(file)} is not ${JSON.stringify(bug.file)}`)
  const snippet = squash(field('snippet'))
  const broken = squash(bug.to)
  const located = snippet.includes(broken) || (snippet !== '' && broken.includes(snippet) && !squash(bug.from).includes(snippet))
  if (!located) errors.push(`snippet ${JSON.stringify(snippet)} does not quote the broken ${JSON.stringify(broken)}`)
  return errors
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1

const strings = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : typeof value === 'object' && value !== null
      ? Object.values(value).flatMap(strings)
      : []

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = new URL('./app/', import.meta.url)
  const verify = readFileSync(new URL('./verify.ts', import.meta.url), 'utf8')
  const errors: string[] = []
  for (const bug of BUGS) {
    const source = readFileSync(new URL(bug.file, appDir), 'utf8')
    const fromCount = count(source, bug.from)
    const toCount = count(source, bug.to)
    if (fromCount !== 1) errors.push(`${bug.name}: from occurs ${fromCount} times in ${bug.file}, expected 1`)
    if (toCount !== 0) errors.push(`${bug.name}: to occurs ${toCount} times in ${bug.file}, expected 0`)
    if (source.replace(bug.from, bug.to) === source) errors.push(`${bug.name}: from -> to changes nothing`)
    for (const keep of bug.keeps) {
      if (!keep.test(source)) errors.push(`${bug.name}: keeps ${keep} does not match the healthy ${bug.file}`)
    }
    for (const e of diagnosisErrors({ file: bug.file, snippet: bug.to }, bug)) errors.push(`${bug.name}: own answer rejected: ${e}`)
    for (const other of BUGS) {
      if (other !== bug && diagnosisErrors({ file: other.file, snippet: other.to }, bug).length === 0) {
        errors.push(`${bug.name}: ${other.name}'s answer is accepted`)
      }
    }
    if (/genkit|trace|mcp|\bcli\b/i.test(bug.symptom)) errors.push(`${bug.name}: symptom mentions tooling`)
    if (!verify.includes(`'${bug.name}':`)) errors.push(`${bug.name}: no check keyed '${bug.name}' in verify.ts`)
    for (const s of strings(bug.verifyInput)) {
      if (!verify.includes(s)) errors.push(`${bug.name}: verifyInput string not in verify.ts: ${JSON.stringify(s)}`)
    }
  }
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log('OK')
}
