// Placed in the sandbox after the agent's turn and run as
// `tsx --test --test-name-pattern '^<bug>$' ~/.verify.mts`. Node builtins only: nothing else is copied in.
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

type App = typeof import('./app/src/index.ts')
type Db = typeof import('./app/src/db.ts')
const app: App = await import(path.resolve(process.cwd(), 'src/index.ts'))
const db: Db = await import(path.resolve(process.cwd(), 'src/db.ts'))

/** Names of the tools the agent called in `sessionId`, read from the FileSessionStore snapshots under .genkit/sessions. */
const toolCalls = async (sessionId: string | undefined): Promise<string[]> => {
  const dir = path.resolve(process.cwd(), '.genkit/sessions/global')
  const names = new Set<string>()
  for (const file of (await readdir(dir)).filter((name) => name.endsWith('.json'))) {
    const snapshot = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
    if (snapshot.sessionId !== sessionId) continue
    for (const message of snapshot.state?.messages ?? []) {
      for (const part of message.content ?? []) if (part.toolRequest) names.add(part.toolRequest.name)
    }
  }
  return [...names]
}

const TRACKING = 'NW-7F3K2Q' // only the orders database knows A-1001's tracking code
const REFUND = 'I want a refund for order A-1001, it arrived broken.'

test('schema-drift', async () => {
  const out = await app.summarizeTicket({
    text: 'My order A-1002 arrived with a cracked monitor and the box was soaked. I need a replacement before Monday for a client demo.',
  })
  assert.ok(['low', 'medium', 'high'].includes(out.priority), `priority is ${JSON.stringify(out.priority)}`)
  assert.ok(Array.isArray(out.tags) && out.tags.length > 0, `tags is ${JSON.stringify(out.tags)}, not a list`)
})

test('tool-not-wired', async () => {
  const out = await app.orderStatus({ question: 'Where is order A-1001?' })
  assert.ok(out.includes(TRACKING), `reply has no tracking code: ${JSON.stringify(out)}`)
})

test('prompt-var-typo', async () => {
  const out = await app.greet({ customerName: 'Ada' })
  assert.ok(out.includes('Ada'), `reply does not use the name: ${JSON.stringify(out)}`)
})

test('truncated-output', async () => {
  const out = await app.draftReply({
    ticket:
      'Hi, I ordered three boxes of A4 paper two weeks ago (order A-1002) and the tracking page still says processing. Can you tell me what is going on and when it will ship?',
  })
  assert.notEqual(out.finishReason, 'length', 'the reply was cut off')
  assert.ok(out.text.length > 200, `reply is ${out.text.length} characters`)
})

test('history-dropped', async () => {
  const out = await app.chat({
    history: [
      { role: 'user', text: 'My name is Ada.' },
      { role: 'model', text: 'Nice to meet you, Ada. How can I help?' },
    ],
    message: 'What is my name?',
  })
  assert.ok(out.includes('Ada'), `reply does not recall the name: ${JSON.stringify(out)}`)
})

test('order-id-case', async () => {
  const out = await app.orderStatus({ question: 'where is order a-1001?' })
  assert.ok(out.includes(TRACKING), `reply has no tracking code: ${JSON.stringify(out)}`)
})

test('delegation-dropped', async () => {
  const out = await app.supportTurn({ message: REFUND })
  const calls = await toolCalls(out.sessionId)
  assert.ok(calls.includes('delegate_to_refundAgent'), out.error ?? `triage did not delegate: ${JSON.stringify(calls)}`)
})

test('approval-ignored', async () => {
  const asked = await app.refundTurn({ message: REFUND })
  assert.equal(asked.finishReason, 'interrupted', asked.error ?? 'no approval interrupt')
  const declined = await app.refundTurn({ sessionId: asked.sessionId, respond: { approved: false, note: 'duplicate claim' } })
  assert.deepEqual(db.REFUNDS, {}, 'a refund was issued after it was declined')
  assert.equal(declined.finishReason, 'stop', declined.error ?? 'declined turn did not finish')
})

test('session-not-loaded', async () => {
  const first = await app.supportTurn({ message: 'My order is A-1001.' })
  const second = await app.supportTurn({ message: 'What is its status?', sessionId: first.sessionId })
  assert.equal(second.sessionId, first.sessionId, 'the session changed between turns')
  assert.ok(second.text.includes(TRACKING), `second turn has no tracking code: ${JSON.stringify(second.text)}`)
})

test('max-turns', async () => {
  const out = await app.refundTurn({ message: REFUND })
  assert.equal(out.finishReason, 'interrupted', out.error ?? 'refund did not reach the approval interrupt')
})

test('tool-choice-none', async () => {
  const out = await app.supportTurn({ message: 'Where is order A-1001?' })
  const calls = await toolCalls(out.sessionId)
  assert.ok(calls.includes('delegate_to_orderAgent'), out.error ?? `triage did not delegate: ${JSON.stringify(calls)}`)
})

test('tool-output-drift', async () => {
  const out = await app.supportTurn({ message: 'Where is order A-1001?' })
  assert.ok(out.text.includes(TRACKING), out.error ?? `reply has no tracking code: ${JSON.stringify(out.text)}`)
})
