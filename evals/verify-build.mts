// Placed in the sandbox after the agent's turn and run as
// `tsx --test --test-reporter=tap --test-name-pattern '^<task>:' ~/.verify-build.mts`. Node builtins only: nothing else is copied in.
// Each test is one requirement, named `<task>: <requirement>`.
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

type App = typeof import('./app/src/index.ts')
type Db = typeof import('./app/src/db.ts')
const app: App = await import(path.resolve(process.cwd(), 'src/index.ts'))
const db: Db = await import(path.resolve(process.cwd(), 'src/db.ts'))

type Message = { content: { toolRequest?: { name: string; input?: unknown }; toolResponse?: { name: string; output?: unknown } }[] }
type Agent = { getSnapshot(lookup: { sessionId: string }): Promise<{ state?: { messages?: Message[] } } | undefined> }

/** The conversation so far: the store's latest snapshot when the agent has a store, else the history the chat holds. */
const conversation = async (agent: Agent, chat: { messages: Message[] }, sessionId: string | undefined): Promise<Message[]> => {
  const stored = sessionId ? await agent.getSnapshot({ sessionId }).catch(() => undefined) : undefined
  return stored?.state?.messages?.length ? stored.state.messages : chat.messages
}

type Call = { name: string; input: string; output: string | undefined }

/** Every tool call in `messages`, each paired with the output it got back. */
const toolCalls = (messages: Message[]): Call[] => {
  const parts = messages.flatMap((m) => m.content)
  const responses = parts.flatMap((p) => (p.toolResponse ? [p.toolResponse] : []))
  return parts.flatMap((p) => {
    if (!p.toolRequest) return []
    const { name, input } = p.toolRequest
    const at = responses.findIndex((r) => r.name === name)
    const [response] = at < 0 ? [] : responses.splice(at, 1)
    return [{ name, input: JSON.stringify(input ?? null), output: response && JSON.stringify(response.output ?? null) }]
  })
}

/** Line breaks can fall inside a date or tracking code, so those are matched with all whitespace removed. */
const compact = (text: string) => text.replace(/\s+/g, '')
const TRACKING_CODE = /NW-[A-Z0-9]{6}/i
const NOT_FOUND =
  /not\s+(?:be\s+)?found|can(?:no|')t\s+(?:find|locate)|could(?:n't|\s+not)\s+(?:find|locate)|unable\s+to\s+(?:find|locate)|no\s+(?:such\s+)?order|does(?:n't|\s+not)\s+exist|not\s+in\s+(?:our|the)\s+system|no\s+record/i
const ANY_ORDER_STATUS = /\b(?:shipped|processing|delivered)\b/i
const ANY_ORDER_ETA = /2026-10-(?:22|25|18)/

/** Triage paraphrases the order desk, so any one field of the order proves the lookup reached it. */
const knowsA1001 = (text: string) => /shipped/i.test(text) || /2026-10-22|NW-7F3K2Q/i.test(compact(text))
const assertKnowsA1001 = (text: string, what: string) =>
  assert.ok(knowsA1001(text), `${what} has no status, ETA or tracking code for A-1001: ${JSON.stringify(text)}`)

const REFUND = 'I want a refund for order A-1001, it arrived broken.'
const A1001_TOTAL = 149.99

/** The refunds issued while `run` ran. */
const refundsDuring = async <T,>(run: () => Promise<T>): Promise<{ result: T; refunds: Db['REFUNDS'][string][] }> => {
  const before = new Set(Object.keys(db.REFUNDS))
  const result = await run()
  return { result, refunds: Object.entries(db.REFUNDS).flatMap(([id, r]) => (before.has(id) ? [] : [r])) }
}

/** Starts a refund conversation and returns the chat with the turn that should pause for approval. */
const refundAsked = async () => {
  const chat = app.refundAgent.chat()
  const asked = await chat.send(REFUND)
  const interrupt = asked.interrupts[0]
  assert.equal(asked.finishReason, 'interrupted', `no approval interrupt: ${JSON.stringify(asked.text)}`)
  assert.ok(interrupt?.name === 'approveRefund', `interrupted on ${interrupt?.name}, not approveRefund`)
  return { chat, interrupt }
}

/** Starts a refund conversation and answers its `approveRefund` request with `approved`. */
const refundDecided = async (approved: boolean) => {
  const { chat, interrupt } = await refundAsked()
  return chat.resume({ respond: [interrupt.respond({ approved, note: approved ? 'confirmed damage' : 'duplicate claim' })] })
}

test('build-order-desk: shipped order', async () => {
  const res = await app.orderAgent.chat().send('Where is order A-1001?')
  assert.match(res.text, /shipped/i, `the reply does not say A-1001 shipped: ${JSON.stringify(res.text)}`)
  assert.ok(compact(res.text).includes('NW-7F3K2Q'), `the reply has no tracking code NW-7F3K2Q: ${JSON.stringify(res.text)}`)
})

test('build-order-desk: processing order', async () => {
  const res = await app.orderAgent.chat().send('Where is order A-1002?')
  assert.match(res.text, /processing/i, `the reply does not say A-1002 is processing: ${JSON.stringify(res.text)}`)
  assert.ok(compact(res.text).includes('2026-10-25'), `the reply has no ETA 2026-10-25: ${JSON.stringify(res.text)}`)
  assert.doesNotMatch(compact(res.text), TRACKING_CODE, `the reply gives A-1002, which has none, a tracking code: ${JSON.stringify(res.text)}`)
})

test('build-order-desk: unknown order', async () => {
  const res = await app.orderAgent.chat().send('Where is order A-9999?')
  assert.match(res.text, NOT_FOUND, `the reply does not say A-9999 was not found: ${JSON.stringify(res.text)}`)
  assert.doesNotMatch(res.text, ANY_ORDER_STATUS, `the reply gives A-9999 a real order's status: ${JSON.stringify(res.text)}`)
  assert.doesNotMatch(compact(res.text), ANY_ORDER_ETA, `the reply gives A-9999 a real order's ETA: ${JSON.stringify(res.text)}`)
  assert.doesNotMatch(compact(res.text), TRACKING_CODE, `the reply gives A-9999 a tracking code: ${JSON.stringify(res.text)}`)
})

test('build-order-desk: looks the order up', async () => {
  const chat = app.orderAgent.chat()
  const res = await chat.send('Where is order A-1001?')
  const calls = toolCalls(await conversation(app.orderAgent, chat, res.sessionId))
  assert.ok(calls.some((c) => c.name === 'lookupOrder'), `the order desk never called lookupOrder: ${JSON.stringify(calls)}`)
})

test('build-refund-desk: pauses for approval', async () => {
  const { refunds } = await refundsDuring(async () => {
    const { interrupt } = await refundAsked()
    const input: unknown = interrupt.input
    const field = (key: string) => (typeof input === 'object' && input !== null ? Reflect.get(input, key) : undefined)
    assert.equal(field('orderId'), 'A-1001', `approveRefund asks about ${JSON.stringify(input)}, not A-1001`)
    assert.equal(field('amount'), A1001_TOTAL, `approveRefund asks for ${JSON.stringify(input)}, not the order total ${A1001_TOTAL}`)
  })
  assert.deepEqual(refunds, [], 'a refund was issued before approval')
})

test('build-refund-desk: declined refunds nothing', async () => {
  const { result: declined, refunds } = await refundsDuring(() => refundDecided(false))
  assert.deepEqual(refunds, [], 'a refund was issued after it was declined')
  assert.equal(declined.finishReason, 'stop', `declined turn ended with ${declined.finishReason}: ${JSON.stringify(declined.text)}`)
})

test('build-refund-desk: approved refunds the order total', async () => {
  const { refunds } = await refundsDuring(() => refundDecided(true))
  assert.equal(refunds.length, 1, `the approved refund issued ${refunds.length} refunds: ${JSON.stringify(refunds)}`)
  assert.equal(refunds[0]?.orderId, 'A-1001', `refunded the wrong order: ${JSON.stringify(refunds)}`)
  assert.equal(refunds[0]?.amount, A1001_TOTAL, `refunded ${refunds[0]?.amount}, not the order total ${A1001_TOTAL}`)
})

/** The desks' own tools: triage calling one means it served the customer itself. */
const DESK_TOOLS = new Set(['lookupOrder', 'approveRefund', 'issueRefund'])
const isRefundDesk = (name: string) => !DESK_TOOLS.has(name) && /refund/i.test(name)
const isOrderDesk = (name: string) => !DESK_TOOLS.has(name) && /order/i.test(name) && !/refund/i.test(name)

/** Sends `message` to a new triage conversation and returns the reply with every tool call triage made. */
const triageTurn = async (message: string) => {
  const chat = app.triage.chat()
  const res = await chat.send(message)
  return { res, calls: toolCalls(await conversation(app.triage, chat, res.sessionId)) }
}

test('build-triage: delegates orders', async () => {
  const { res, calls } = await triageTurn('Where is order A-1001?')
  const log = JSON.stringify(calls)
  assert.deepEqual(calls.filter((c) => DESK_TOOLS.has(c.name)).map((c) => c.name), [], `triage answered the order question itself: ${log}`)
  assert.ok(!calls.some((c) => isRefundDesk(c.name)), `triage sent an order question to the refund desk: ${log}`)
  const toOrderDesk = calls.filter((c) => isOrderDesk(c.name) && /A-1001/i.test(c.input))
  assert.ok(toOrderDesk.length > 0, `triage did not hand A-1001 to the order desk: ${log}`)
  assert.ok(toOrderDesk.some((c) => c.output && knowsA1001(c.output)), `the order desk returned nothing about A-1001: ${log}`)
  assertKnowsA1001(res.text, 'the order reply')
})

test('build-triage: delegates refunds', async () => {
  const { result: turn, refunds } = await refundsDuring(() => triageTurn(REFUND))
  const log = JSON.stringify(turn.calls)
  assert.deepEqual(turn.calls.filter((c) => DESK_TOOLS.has(c.name)).map((c) => c.name), [], `triage handled the refund itself: ${log}`)
  const toRefundDesk = turn.calls.filter((c) => isRefundDesk(c.name) && /A-1001/i.test(c.input))
  assert.ok(toRefundDesk.length > 0, `triage did not hand the A-1001 refund to the refund desk: ${log}`)
  assert.ok(toRefundDesk.every((c) => c.output !== undefined), `the refund desk never answered triage: ${log}`)
  assert.deepEqual(refunds, [], 'a refund was issued without human approval')
  assert.match(turn.res.text, /refund/i, `the refund reply does not address the refund: ${JSON.stringify(turn.res.text)}`)
})

test('build-triage: resumes by session id', async () => {
  const first = await app.triage.chat().send('My order is A-1001.')
  assert.ok(first.sessionId, 'the first turn returned no session id')
  const chat = await app.triage.loadChat({ sessionId: first.sessionId })
  const second = await chat.send('What is its status?')
  assert.equal(second.sessionId, first.sessionId, 'the session changed between turns')
  assertKnowsA1001(second.text, 'the second turn')
})
