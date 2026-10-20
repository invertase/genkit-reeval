// Copied alone into the sandbox and run there as `tsx ~/.verify.ts <bug-name>`: node builtins only.
// Inputs mirror each bug's `verifyInput` in bugs.ts, whose self-check enforces it.
import path from 'node:path'

type AgentTurn = {
  text: string
  finishReason: string
  sessionId: string
  snapshotId: string
  interrupts: { name: string; input: unknown }[]
  toolCalls: string[]
  messageCount: number
  error?: string
}
type Turn = (input: {
  message?: string
  sessionId?: string
  respond?: { approved: boolean; note?: string }
}) => Promise<AgentTurn>

type App = {
  summarizeTicket: (input: { text: string }) => Promise<unknown>
  orderStatus: (input: { question: string }) => Promise<unknown>
  greet: (input: { customerName: string }) => Promise<unknown>
  draftReply: (input: { ticket: string }) => Promise<unknown>
  chat: (input: { history: { role: 'user' | 'model'; text: string }[]; message: string }) => Promise<unknown>
  supportTurn: Turn
  refundTurn: Turn
}

/** Thrown by a check; its message is the one-line reason the bug is not fixed. */
class Unfixed extends Error {}

function fail(reason: string): never {
  throw new Unfixed(reason)
}

const prop = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined

const ok = (turn: AgentTurn, label = 'turn') => {
  if (turn.error) fail(`${label} failed: ${turn.error}`)
  return turn
}

const ETA = '2026-10-22'

/** True when `text` gives A-1001's delivery date in any common format. */
const mentionsEta = (text: string) =>
  [
    /2026-10-22/,
    /\b22(nd)?\s+Oct(ober)?,?\s+2026/i,
    /\bOct(ober)?\.?\s+22(nd)?,?\s+2026/i,
    /\b22\/10\/2026\b/,
    /\b10\/22\/2026\b/,
  ].some((format) => format.test(text))

/** One structural check per bug. Each resolves to its success line or throws `Unfixed`. */
const CHECKS: Record<string, (app: App) => Promise<string>> = {
  'schema-drift': async (app) => {
    const out = await app.summarizeTicket({
      text: 'My order A-1002 arrived with a cracked monitor and the box was soaked. I need a replacement before Monday for a client demo.',
    })
    const priority = prop(out, 'priority')
    const title = prop(out, 'title')
    if (priority !== 'low' && priority !== 'medium' && priority !== 'high') {
      fail(`priority must be low, medium or high, got ${JSON.stringify(priority)}`)
    }
    if (typeof title !== 'string' || title.trim() === '') fail(`title must be a non-empty string, got ${JSON.stringify(title)}`)
    return 'summarizeTicket returned a valid priority and title'
  },

  'tool-not-wired': async (app) => {
    const out = await app.orderStatus({ question: 'Where is order A-1001?' })
    if (typeof out !== 'string') fail(`expected a string, got ${typeof out}`)
    if (!mentionsEta(out)) fail(`output does not contain the order's ETA ${ETA}: ${JSON.stringify(out)}`)
    return 'orderStatus reported the ETA from the database'
  },

  'prompt-var-typo': async (app) => {
    const out = await app.greet({ customerName: 'Ada' })
    if (typeof out !== 'string') fail(`expected a string, got ${typeof out}`)
    if (!out.includes('Ada')) fail(`output does not contain the customer name "Ada": ${JSON.stringify(out)}`)
    return 'greet used the customer name'
  },

  'truncated-output': async (app) => {
    const out = await app.draftReply({
      ticket:
        'Hi, I ordered three boxes of A4 paper two weeks ago (order A-1002) and the tracking page still says processing. Can you tell me what is going on and when it will ship?',
    })
    const finishReason = prop(out, 'finishReason')
    const text = prop(out, 'text')
    if (finishReason === 'length') fail('finishReason is "length": the reply was cut off')
    if (typeof text !== 'string') fail(`expected text to be a string, got ${typeof text}`)
    if (text.length <= 200) fail(`expected text longer than 200 characters, got ${text.length}`)
    return `draftReply finished with ${JSON.stringify(finishReason)} and ${text.length} characters`
  },

  'history-dropped': async (app) => {
    const out = await app.chat({
      history: [
        { role: 'user', text: 'My name is Ada.' },
        { role: 'model', text: 'Nice to meet you, Ada. How can I help?' },
      ],
      message: 'What is my name?',
    })
    if (typeof out !== 'string') fail(`expected a string, got ${typeof out}`)
    if (!out.includes('Ada')) fail(`output does not recall the name "Ada" from history: ${JSON.stringify(out)}`)
    return 'chat recalled the name from history'
  },

  'order-id-case': async (app) => {
    const out = await app.orderStatus({ question: 'where is order a-1001?' })
    if (typeof out !== 'string') fail(`expected a string, got ${typeof out}`)
    if (!mentionsEta(out)) fail(`output does not contain the order's ETA ${ETA}: ${JSON.stringify(out)}`)
    return 'orderStatus found the lowercase order id'
  },

  'delegation-dropped': async (app) => {
    const out = await app.supportTurn({ message: 'I want a refund for order A-1001, it arrived broken.' })
    if (!out.toolCalls.includes('delegate_to_refundAgent')) {
      fail(`triage did not delegate to refundAgent; toolCalls: ${JSON.stringify(out.toolCalls)}`)
    }
    return 'triage delegated the refund request to refundAgent'
  },

  'approval-ignored': async (app) => {
    const asked = ok(await app.refundTurn({ message: 'I want a refund for order A-1001, it arrived broken.' }), 'refund request')
    if (asked.finishReason !== 'interrupted') fail(`expected finishReason 'interrupted', got ${JSON.stringify(asked.finishReason)}`)
    if (!asked.interrupts.some((i) => i.name === 'approveRefund')) {
      fail(`no approveRefund interrupt; interrupts: ${JSON.stringify(asked.interrupts.map((i) => i.name))}`)
    }
    const declined = ok(
      await app.refundTurn({ sessionId: asked.sessionId, respond: { approved: false, note: 'duplicate claim' } }),
      'declined resume',
    )
    if (declined.toolCalls.includes('issueRefund')) fail('issueRefund ran after the refund was declined')
    if (/\bR-\d+/.test(declined.text)) fail(`reply quotes a refund id: ${JSON.stringify(declined.text)}`)
    if (declined.finishReason !== 'stop') fail(`expected finishReason 'stop', got ${JSON.stringify(declined.finishReason)}`)
    return 'declined refund finished without issuing'
  },

  'session-not-loaded': async (app) => {
    const first = ok(await app.supportTurn({ message: 'My order is A-1001.' }), 'first turn')
    const second = ok(
      await app.supportTurn({ message: 'What is its status?', sessionId: first.sessionId }),
      'second turn',
    )
    if (second.sessionId !== first.sessionId) fail(`session changed: ${first.sessionId} then ${second.sessionId}`)
    if (!mentionsEta(second.text)) fail(`second turn does not give the order's ETA ${ETA}: ${JSON.stringify(second.text)}`)
    return 'second turn continued the session and knew the order'
  },

  'max-turns': async (app) => {
    const out = ok(await app.refundTurn({ message: 'I want a refund for order A-1001, it arrived broken.' }))
    if (out.finishReason !== 'interrupted') fail(`expected finishReason 'interrupted', got ${JSON.stringify(out.finishReason)}`)
    return 'refund reached the approval interrupt'
  },

  'tool-output-drift': async (app) => {
    const out = ok(await app.supportTurn({ message: 'Where is order A-1001?' }))
    if (!out.toolCalls.includes('delegate_to_orderAgent')) {
      fail(`triage did not delegate to orderAgent; toolCalls: ${JSON.stringify(out.toolCalls)}`)
    }
    if (!mentionsEta(out.text)) fail(`reply does not give the order's ETA ${ETA}: ${JSON.stringify(out.text)}`)
    return 'triage reported the ETA from orderAgent'
  },

  'tool-choice-none': async (app) => {
    const out = ok(await app.supportTurn({ message: 'Where is order A-1001?' }))
    if (!out.toolCalls.includes('delegate_to_orderAgent')) {
      fail(`triage did not delegate to orderAgent; toolCalls: ${JSON.stringify(out.toolCalls)}`)
    }
    return 'triage delegated the order question to orderAgent'
  },
}

const name = process.argv[2]
if (!name) {
  console.error(`usage: tsx verify.ts <bug-name>  (one of: ${Object.keys(CHECKS).join(', ')})`)
  process.exit(2)
}
const check = CHECKS[name]
if (!check) {
  console.error(`${name}: unknown bug`)
  process.exit(1)
}

const main = async () => {
  const app: App = await import(path.resolve(process.cwd(), 'src/index.ts'))
  console.log(`${name}: ${await check(app)}`)
  process.exit(0)
}

main().catch((err: unknown) => {
  const reason = err instanceof Unfixed ? err.message : `threw: ${err instanceof Error ? err.message : String(err)}`
  console.error(`${name}: ${reason}`)
  process.exit(1)
})
