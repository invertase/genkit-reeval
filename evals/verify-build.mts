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

test('build-triage', async () => {
  const refund = await app.triage.chat().send(REFUND)
  assert.ok(refund.sessionId, 'triage returned no session id')
  const snapshot = await app.triage.getSnapshot({ sessionId: refund.sessionId })
  const calls = (snapshot?.state?.messages ?? []).flatMap((m) => m.content.flatMap((p) => (p.toolRequest ? [p.toolRequest.name] : [])))
  assert.ok(calls.includes('delegate_to_refundAgent'), `triage did not delegate the refund: ${JSON.stringify(calls)}`)

  const first = await app.triage.chat().send('My order is A-1001.')
  assert.ok(first.sessionId, 'the first turn returned no session id')
  const chat = await app.triage.loadChat({ sessionId: first.sessionId })
  const second = await chat.send('What is its status?')
  assert.equal(second.sessionId, first.sessionId, 'the session changed between turns')
  assertKnowsOrder(second.text, 'A-1001', 'the second turn')
})
