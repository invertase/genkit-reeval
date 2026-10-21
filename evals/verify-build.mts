// Placed in the sandbox after the agent's turn and run as
// `tsx --test --test-name-pattern '^<task>$' ~/.verify-build.mts`. Node builtins only: nothing else is copied in.
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'

type App = typeof import('./app/src/index.ts')
type Db = typeof import('./app/src/db.ts')
const app: App = await import(path.resolve(process.cwd(), 'src/index.ts'))
const db: Db = await import(path.resolve(process.cwd(), 'src/db.ts'))

/** Triage paraphrases the order desk, so any one field of the order proves the lookup reached it. */
const ORDER_FACTS: Record<string, RegExp> = {
  'A-1001': /shipped|2026-10-22|NW-7F3K2Q/i,
}
const assertKnowsOrder = (text: string, orderId: string, what: string) =>
  assert.match(text, ORDER_FACTS[orderId]!, `${what} has no status, ETA or tracking code for ${orderId}: ${JSON.stringify(text)}`)
const REFUND = 'I want a refund for order A-1001, it arrived broken.'

/** Starts a refund conversation and answers its `approveRefund` request with `approved`. */
const refundDecided = async (approved: boolean) => {
  const chat = app.refundAgent.chat()
  const asked = await chat.send(REFUND)
  const interrupt = asked.interrupts[0]
  assert.equal(asked.finishReason, 'interrupted', `no approval interrupt: ${JSON.stringify(asked.text)}`)
  assert.ok(interrupt?.name === 'approveRefund', `interrupted on ${interrupt?.name}, not approveRefund`)
  return chat.resume({ respond: [interrupt.respond({ approved, note: approved ? 'confirmed damage' : 'duplicate claim' })] })
}

test('build-order-desk', async () => {
  const res = await app.orderAgent.chat().send('Where is order A-1001?')
  assertKnowsOrder(res.text, 'A-1001', 'the reply')
})

test('build-refund-desk', async () => {
  const declined = await refundDecided(false)
  assert.deepEqual(db.REFUNDS, {}, 'a refund was issued after it was declined')
  assert.equal(declined.finishReason, 'stop', `declined turn ended with ${declined.finishReason}: ${JSON.stringify(declined.text)}`)

  await refundDecided(true)
  const refunds = Object.values(db.REFUNDS)
  assert.equal(refunds.length, 1, `approved refund issued ${refunds.length} refunds: ${JSON.stringify(db.REFUNDS)}`)
  assert.equal(refunds[0]?.orderId, 'A-1001', `refunded the wrong order: ${JSON.stringify(db.REFUNDS)}`)
})

type Call = { name: string; input: string; output: string | undefined }

/** Every tool call triage made in one session, each paired with the output it got back. */
const triageCalls = async (sessionId: string): Promise<Call[]> => {
  const snapshot = await app.triage.getSnapshot({ sessionId })
  const parts = (snapshot?.state?.messages ?? []).flatMap((m) => m.content)
  const responses = parts.flatMap((p) => (p.toolResponse ? [p.toolResponse] : []))
  return parts.flatMap((p) => {
    if (!p.toolRequest) return []
    const { name, input } = p.toolRequest
    const at = responses.findIndex((r) => r.name === name)
    const [response] = at < 0 ? [] : responses.splice(at, 1)
    return [{ name, input: JSON.stringify(input ?? null), output: response && JSON.stringify(response.output ?? null) }]
  })
}

/** The desks' own tools: triage calling one means it served the customer itself. */
const DESK_TOOLS = new Set(['lookupOrder', 'approveRefund', 'issueRefund'])
const isRefundDesk = (name: string) => !DESK_TOOLS.has(name) && /refund/i.test(name)
const isOrderDesk = (name: string) => !DESK_TOOLS.has(name) && /order/i.test(name) && !/refund/i.test(name)

test('build-triage', async () => {
  const order = await app.triage.chat().send('Where is order A-1001?')
  assert.ok(order.sessionId, 'the order turn returned no session id')
  const orderCalls = await triageCalls(order.sessionId)
  const orderLog = JSON.stringify(orderCalls)
  assert.deepEqual(orderCalls.filter((c) => DESK_TOOLS.has(c.name)).map((c) => c.name), [], `triage answered the order question itself: ${orderLog}`)
  assert.ok(!orderCalls.some((c) => isRefundDesk(c.name)), `triage sent an order question to the refund desk: ${orderLog}`)
  const toOrderDesk = orderCalls.filter((c) => isOrderDesk(c.name) && /A-1001/i.test(c.input))
  assert.ok(toOrderDesk.length > 0, `triage did not hand A-1001 to the order desk: ${orderLog}`)
  assert.ok(toOrderDesk.some((c) => c.output && ORDER_FACTS['A-1001']!.test(c.output)), `the order desk returned nothing about A-1001: ${orderLog}`)
  assertKnowsOrder(order.text, 'A-1001', 'the order reply')

  const refund = await app.triage.chat().send(REFUND)
  assert.ok(refund.sessionId, 'the refund turn returned no session id')
  const refundCalls = await triageCalls(refund.sessionId)
  const refundLog = JSON.stringify(refundCalls)
  assert.deepEqual(refundCalls.filter((c) => DESK_TOOLS.has(c.name)).map((c) => c.name), [], `triage handled the refund itself: ${refundLog}`)
  const toRefundDesk = refundCalls.filter((c) => isRefundDesk(c.name) && /A-1001/i.test(c.input))
  assert.ok(toRefundDesk.length > 0, `triage did not hand the A-1001 refund to the refund desk: ${refundLog}`)
  assert.ok(toRefundDesk.every((c) => c.output !== undefined), `the refund desk never answered triage: ${refundLog}`)
  assert.deepEqual(db.REFUNDS, {}, 'a refund was issued without human approval')
  assert.match(refund.text, /refund/i, `the refund reply does not address the refund: ${JSON.stringify(refund.text)}`)

  const first = await app.triage.chat().send('My order is A-1001.')
  assert.ok(first.sessionId, 'the first turn returned no session id')
  const chat = await app.triage.loadChat({ sessionId: first.sessionId })
  const second = await chat.send('What is its status?')
  assert.equal(second.sessionId, first.sessionId, 'the session changed between turns')
  assertKnowsOrder(second.text, 'A-1001', 'the second turn')
})
