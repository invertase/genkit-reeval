// Placed in the sandbox after the agent's turn and run as
// `tsx --test --test-name-pattern '^<bug>$' ~/.verify.mts`. Node builtins only: nothing else is copied in.
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

type App = typeof import('./app/src/index.ts')
type Db = typeof import('./app/src/db.ts')
const app: App = await import(path.resolve(process.cwd(), 'src/index.ts'))
const db: Db = await import(path.resolve(process.cwd(), 'src/db.ts'))

/** Names of the tools triage called in `sessionId`, read from the session's latest snapshot. */
const triageToolCalls = async (sessionId: string | undefined): Promise<string[]> => {
  assert.ok(sessionId, 'triage returned no session id')
  const snapshot = await app.triage.getSnapshot({ sessionId })
  return (snapshot?.state?.messages ?? []).flatMap((m) => m.content.flatMap((p) => (p.toolRequest ? [p.toolRequest.name] : [])))
}

const TRACKING = 'NW-7F3K2Q' // only the orders database knows A-1001's tracking code
/** Triage paraphrases the order desk, so any one field of the order proves the lookup reached it. */
const ORDER_FACTS: Record<string, RegExp> = {
  'A-1001': /shipped|2026-10-22|NW-7F3K2Q/i,
  'A-1003': /delivered|2026-10-18|NW-5D1MZT/i,
}
const assertKnowsOrder = (text: string, orderId: string, what: string) =>
  assert.match(text, ORDER_FACTS[orderId]!, `${what} has no status, ETA or tracking code for ${orderId}: ${JSON.stringify(text)}`)
const REFUND = 'I want a refund for order A-1001, it arrived broken.'

test('schema-drift', async () => {
  const out = await app.summarizeTicket({
    text: 'My order A-1002 arrived with a cracked monitor and the box was soaked. I need a replacement before Monday for a client demo.',
  })
  assert.ok(['low', 'medium', 'high'].includes(out.priority), `priority is ${JSON.stringify(out.priority)}`)
  assert.ok(Array.isArray(out.tags) && out.tags.length > 0, `tags is ${JSON.stringify(out.tags)}, not a list`)
})

test('prompt-var-typo', async () => {
  const out = await app.greet({ customerName: 'Ada' })
  assert.ok(out.includes('Ada'), `reply does not use the name: ${JSON.stringify(out)}`)
})

test('prompt-model-override', async () => {
  const out = await app.greet({ customerName: 'Grace' })
  assert.ok(out.includes('Grace'), `reply does not use the name: ${JSON.stringify(out)}`)
})

test('order-id-case', async () => {
  const out = await app.orderStatus({ question: 'where is order a-1001?' })
  assert.ok(out.includes(TRACKING), `reply has no tracking code: ${JSON.stringify(out)}`)
})

test('tool-requests-returned', async () => {
  const out = await app.orderStatus({ question: 'Where is order A-1001?' })
  assert.ok(out.includes(TRACKING), `reply has no tracking code: ${JSON.stringify(out)}`)
})

test('stop-sequence', async () => {
  const out = await app.draftReply({
    ticket:
      'Hi, I ordered three boxes of A4 paper two weeks ago (order A-1002) and the tracking page still says processing. Can you tell me what is going on and when it will ship?',
  })
  assert.ok(out.text.length > 200, `reply is ${out.text.length} characters (${out.finishReason}): ${JSON.stringify(out.text)}`)
})

test('delegation-dropped', async () => {
  const res = await app.triage.chat().send(REFUND)
  const calls = await triageToolCalls(res.sessionId)
  assert.ok(calls.includes('delegate_to_refundAgent'), `triage did not delegate: ${JSON.stringify(calls)}`)
})

test('session-not-loaded', async () => {
  const first = await app.triage.chat().send('My order is A-1001.')
  assert.ok(first.sessionId, 'the first turn returned no session id')
  const chat = await app.triage.loadChat({ sessionId: first.sessionId })
  const second = await chat.send('What is the status of my order?')
  assert.equal(second.sessionId, first.sessionId, 'the session changed between turns')
  assertKnowsOrder(second.text, 'A-1001', 'the second turn')
})

test('tool-choice-required', async () => {
  const chat = app.refundAgent.chat()
  const asked = await chat.send(REFUND)
  const interrupt = asked.interrupts[0]
  assert.equal(asked.finishReason, 'interrupted', `no approval interrupt: ${JSON.stringify(asked.text)}`)
  assert.ok(interrupt?.name === 'approveRefund', `interrupted on ${interrupt?.name}, not approveRefund`)
  const declined = await chat.resume({ respond: [interrupt.respond({ approved: false, note: 'duplicate claim' })] })
  assert.deepEqual(db.REFUNDS, {}, 'a refund was issued after it was declined')
  assert.equal(declined.finishReason, 'stop', `declined turn ended with ${declined.finishReason}: ${JSON.stringify(declined.text)}`)
})

test('max-delegations-zero', async () => {
  const res = await app.triage.chat().send('Where is order A-1003?')
  assertKnowsOrder(res.text, 'A-1003', 'the reply')
})

test('max-turns-zero', async () => {
  const res = await app.triage.chat().send('Where is order A-1001?')
  assert.equal(res.finishReason, 'stop')
  assertKnowsOrder(res.text, 'A-1001', 'the reply')
})

test('tool-output-drift', async () => {
  const res = await app.triage.chat().send('Where is order A-1001?')
  assertKnowsOrder(res.text, 'A-1001', 'the reply')
})
