// Placed in the sandbox after the agent's turn and run as
// `tsx --test --test-reporter=tap --test-name-pattern '^<task>:' ~/.verify-build.mts`. Node builtins only: nothing else is copied in.
// Each test is one requirement, named `<task>: <requirement>`.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

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

const RESULT = 'LATER_REQUEST_RESULT '

/**
 * Runs `body` in a new process, as a later request served by another server would, and returns what it passed to `reply`.
 * `body` sees the app as `app` and the database as `db`.
 */
const inLaterRequest = async (body: string): Promise<unknown> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'later-request-'))
  const script = path.join(dir, 'request.mts')
  await writeFile(
    script,
    `const app = await import(${JSON.stringify(path.resolve(process.cwd(), 'src/index.ts'))})\n` +
      `const db = await import(${JSON.stringify(path.resolve(process.cwd(), 'src/db.ts'))})\n` +
      `const reply = (value) => console.log(${JSON.stringify(RESULT)} + JSON.stringify(value))\n` +
      body,
  )
  try {
    const { stdout } = await promisify(execFile)(path.resolve(process.cwd(), 'node_modules/.bin/tsx'), [script], { maxBuffer: 1 << 24 })
    const line = stdout.split('\n').findLast((l) => l.startsWith(RESULT))
    assert.ok(line, `the later request printed no result: ${stdout.slice(-2000)}`)
    return JSON.parse(line.slice(RESULT.length))
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e
    const stderr = e instanceof Error && 'stderr' in e ? String(e.stderr) : String(e)
    assert.fail(`the later request failed: ${stderr.trim().split('\n').slice(-15).join('\n')}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

type LaterTurn = { sessionId?: string; text: string; finishReason: string; refunds?: Db['REFUNDS'][string][] }

/** Continues order desk conversation `sessionId` in a later request and sends it `message`. */
const sendLater = async (sessionId: string, message: string) =>
  (await inLaterRequest(
    `const chat = await app.orderAgent.loadChat({ sessionId: ${JSON.stringify(sessionId)} })\n` +
      `const res = await chat.send(${JSON.stringify(message)})\n` +
      'reply({ sessionId: res.sessionId, text: res.text, finishReason: res.finishReason })\n',
  )) as LaterTurn

test('build-order-memory: resumes by session id', async () => {
  const first = await app.orderAgent.chat().send('My order is A-1001.')
  assert.ok(first.sessionId, 'the first turn returned no session id')
  const second = await sendLater(first.sessionId, 'What is its status?')
  assert.equal(second.sessionId, first.sessionId, 'the session changed between requests')
  assertKnowsA1001(second.text, 'the later turn')
})

test('build-order-memory: keeps sessions apart', async () => {
  const one = await app.orderAgent.chat().send('My order is A-1001.')
  const two = await app.orderAgent.chat().send('My order is A-1002.')
  assert.ok(one.sessionId && two.sessionId, 'a first turn returned no session id')
  assert.notEqual(one.sessionId, two.sessionId, 'two conversations share a session id')
  const later = await sendLater(two.sessionId, 'What is its status?')
  assert.match(later.text, /processing/i, `the A-1002 conversation does not say processing: ${JSON.stringify(later.text)}`)
  assert.doesNotMatch(later.text, /shipped/i, `the A-1002 conversation talks about A-1001: ${JSON.stringify(later.text)}`)
  assert.ok(!compact(later.text).includes('NW-7F3K2Q'), `the A-1002 conversation gives A-1001's tracking code: ${JSON.stringify(later.text)}`)
  const back = await sendLater(one.sessionId, 'What is its status?')
  assert.match(back.text, /shipped/i, `the A-1001 conversation does not say shipped: ${JSON.stringify(back.text)}`)
  assert.doesNotMatch(back.text, /processing/i, `the A-1001 conversation talks about A-1002: ${JSON.stringify(back.text)}`)
})

/** Answers the pending `approveRefund` request of refund conversation `sessionId` in a later request. */
const decideLater = async (sessionId: string, approved: boolean) =>
  (await inLaterRequest(
    `const chat = await app.refundAgent.loadChat({ sessionId: ${JSON.stringify(sessionId)} })\n` +
      "const pending = chat.messages.flatMap((m) => m.content).filter((p) => p.toolRequest?.name === 'approveRefund').at(-1)?.toolRequest\n" +
      "if (!pending) throw new Error('the loaded conversation has no approveRefund request: ' + JSON.stringify(chat.messages))\n" +
      `const output = ${JSON.stringify({ approved, note: approved ? 'confirmed damage' : 'duplicate claim' })}\n` +
      "const res = await chat.resume({ respond: [{ toolResponse: { name: 'approveRefund', ref: pending.ref, output } }] })\n" +
      'reply({ sessionId: res.sessionId, text: res.text, finishReason: res.finishReason, refunds: Object.values(db.REFUNDS) })\n',
  )) as LaterTurn

/** Starts a refund conversation in this process and returns its session id once it pauses for approval. */
const refundPaused = async () => {
  const { refunds, result } = await refundsDuring(async () => (await refundAsked()).chat.sessionId)
  assert.deepEqual(refunds, [], 'a refund was issued before approval')
  assert.ok(result, 'the paused conversation has no session id')
  return result
}

test('build-refund-resume: pauses with a session id', async () => {
  await refundPaused()
})

test('build-refund-resume: approved in a later request', async () => {
  const later = await decideLater(await refundPaused(), true)
  assert.equal(later.finishReason, 'stop', `the approved turn ended with ${later.finishReason}: ${JSON.stringify(later.text)}`)
  const refunds = later.refunds ?? []
  assert.equal(refunds.length, 1, `the approval issued ${refunds.length} refunds: ${JSON.stringify(refunds)}`)
  assert.equal(refunds[0]?.orderId, 'A-1001', `refunded the wrong order: ${JSON.stringify(refunds)}`)
  assert.equal(refunds[0]?.amount, A1001_TOTAL, `refunded ${refunds[0]?.amount}, not the order total ${A1001_TOTAL}`)
})

test('build-refund-resume: declined in a later request', async () => {
  const later = await decideLater(await refundPaused(), false)
  assert.equal(later.finishReason, 'stop', `the declined turn ended with ${later.finishReason}: ${JSON.stringify(later.text)}`)
  assert.deepEqual(later.refunds, [], `a declined refund was issued: ${JSON.stringify(later.refunds)}`)
})

type Artifact = { name?: string; parts: { text?: string; data?: unknown }[] }
const isReceipt = (a: Artifact) => /^receipt-/.test(a.name ?? '')

/** The data an artifact holds: its data part, or JSON in its text part. */
const artifactData = (a: Artifact): unknown => {
  for (const part of a.parts) {
    if (part.data !== undefined) return part.data
    try {
      if (part.text !== undefined) return JSON.parse(part.text)
    } catch {
      continue
    }
  }
  return undefined
}

/** Runs an approved refund and returns the refund it issued with the receipts on the turn that issued it. */
const approvedReceipts = async () => {
  const { result, refunds } = await refundsDuring(() => refundDecided(true))
  const refundId = Object.entries(db.REFUNDS).find(([, r]) => r === refunds[0])?.[0]
  assert.ok(refundId, `the approval issued no refund: ${JSON.stringify(result.text)}`)
  return { receipts: result.artifacts.filter(isReceipt), refundId, refund: refunds[0] }
}

test('build-refund-receipt: approved refund has a receipt', async () => {
  const { receipts, refundId } = await approvedReceipts()
  const names = receipts.map((a) => a.name)
  assert.ok(names.includes(`receipt-${refundId}`), `no artifact named receipt-${refundId} on the approved turn: ${JSON.stringify(names)}`)
})

test('build-refund-receipt: receipt matches the refund', async () => {
  const { receipts, refundId, refund } = await approvedReceipts()
  const receipt = receipts.find((a) => a.name === `receipt-${refundId}`)
  assert.ok(receipt, `no artifact named receipt-${refundId}: ${JSON.stringify(receipts)}`)
  assert.deepEqual(artifactData(receipt), { refundId, orderId: refund?.orderId, amount: refund?.amount }, `the receipt does not describe ${refundId}`)
})

test('build-refund-receipt: declined refund has no receipt', async () => {
  const declined = await refundDecided(false)
  assert.deepEqual(declined.artifacts.filter(isReceipt), [], `a declined refund has a receipt: ${JSON.stringify(declined.artifacts)}`)
})

type Ai = typeof import('./app/src/ai.ts')
type DeskTurn = { text: string; messages: Message[] }
let customerRequest: ((message: string, customerId: string) => Promise<DeskTurn>) | undefined

/** Asks the order desk `message` in a request signed in as `customerId`, the way a flow serving that customer would. */
const askAsCustomer = async (customerId: string, message: string): Promise<DeskTurn> => {
  if (!customerRequest) {
    const { ai }: Ai = await import(path.resolve(process.cwd(), 'src/ai.ts'))
    const flow = ai.defineFlow('verifyCustomerRequest', async (text: string) => {
      const chat = app.orderAgent.chat()
      const res = await chat.send(text)
      return { text: res.text, messages: await conversation(app.orderAgent, chat, res.sessionId) }
    })
    customerRequest = async (text, id) => (await flow.run(text, { context: { customerId: id } })).result
  }
  return customerRequest(message, customerId)
}

/** A refusal that is not worded as not found: the order is someone else's, or its details could not be read. */
const WITHHELD =
  /belongs?\s+to\s+(?:another|a\s+different)|not\s+(?:associated|linked)\s+(?:with|to)\s+your|not\s+(?:authori[sz]ed|able\s+to\s+(?:share|access))|(?:don't|do\s+not)\s+have\s+access|(?:unable\s+to|(?:could(?:n't|\s+not)|can(?:no|')t)\s+)\s*(?:retrieve|get|access|look\s+up)/i

test('build-customer-scope: own order answered', async () => {
  const res = await askAsCustomer('C-100', 'Where is order A-1001?')
  assert.match(res.text, /shipped/i, `the reply does not say A-1001 shipped: ${JSON.stringify(res.text)}`)
  assert.ok(compact(res.text).includes('NW-7F3K2Q'), `the reply has no tracking code NW-7F3K2Q: ${JSON.stringify(res.text)}`)
})

test('build-customer-scope: foreign order refused', async () => {
  const res = await askAsCustomer('C-200', 'Where is order A-1001?')
  assert.ok(NOT_FOUND.test(res.text) || WITHHELD.test(res.text), `the reply does not say A-1001 was not found: ${JSON.stringify(res.text)}`)
  assert.doesNotMatch(res.text, /shipped/i, `the reply gives C-200 the status of A-1001: ${JSON.stringify(res.text)}`)
  assert.doesNotMatch(compact(res.text), /2026-10-22|NW-7F3K2Q/i, `the reply gives C-200 the ETA or tracking code of A-1001: ${JSON.stringify(res.text)}`)
})

test('build-customer-scope: tool reads the context', async () => {
  const res = await askAsCustomer('C-200', 'Where is order A-1001?')
  const lookups = toolCalls(res.messages).filter((c) => c.name === 'lookupOrder')
  assert.ok(lookups.length > 0, `the order desk never called lookupOrder: ${JSON.stringify(toolCalls(res.messages))}`)
  assert.deepEqual(lookups.filter((c) => c.output !== 'null'), [], 'lookupOrder returned A-1001 to customer C-200')
})

test('build-customer-scope: staff see every order', async () => {
  const res = await app.orderAgent.chat().send('Where is order A-1003?')
  assert.match(res.text, /delivered/i, `the reply does not say A-1003 was delivered: ${JSON.stringify(res.text)}`)
  assert.ok(compact(res.text).includes('NW-5D1MZT'), `the reply has no tracking code NW-5D1MZT: ${JSON.stringify(res.text)}`)
})
