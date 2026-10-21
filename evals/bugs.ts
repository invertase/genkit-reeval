import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** One seeded bug: swapping `from` for `to` in `file` breaks exactly one flow or agent scenario. */
export type Bug = {
  /** kebab-case; the eval name and the key in `verify.mts` */
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
}

/** Seeded bugs for the support-desk app, flows first, then agents. */
export const BUGS: Bug[] = [
  {
    name: 'schema-drift',
    kind: 'flow',
    file: 'src/flows.ts',
    from: "tags: z.array(z.string()).describe('Up to three lowercase topic tags'),",
    to: "tags: z.string().describe('Up to three lowercase topic tags, comma separated'),",
    symptom:
      'Since this week summarizeTicket returns the tags as one comma-separated string such as "shipping, damage" instead of a list of tags. ' +
      'The triage dashboard reads tags as a list and now shows nothing. It happens for every ticket, for example one about a cracked monitor that arrived damaged.',
    keeps: [/name: 'summarizeTicket'/, /priority: z\.enum\(\['low', 'medium', 'high'\]\)/],
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
  },
  {
    name: 'prompt-model-override',
    kind: 'flow',
    file: 'prompts/greet.prompt',
    from: '---\ninput:',
    to: '---\nmodel: googleai/gemini-1.5-flash\ninput:',
    symptom:
      'The greet flow now fails with an error for every customer, for example "Grace", instead of returning a welcome. ' +
      'The other flows, such as summarizeTicket, still work. I expected a one-sentence welcome that addresses the customer by name.',
    keeps: [/\{\{\s*customerName\s*\}\}/, /customerName: string/],
  },
  {
    name: 'order-id-case',
    kind: 'flow',
    file: 'src/tools.ts',
    from: 'const order = ORDERS[orderId.trim().toUpperCase()] ?? null;',
    to: 'const order = ORDERS[orderId] ?? null;',
    symptom:
      'Some customers with valid orders are told their order does not exist. ' +
      'One customer asked the orderStatus flow "where is order a-1001?" and got that answer, but A-1001 is in our system and has shipped. ' +
      'I expected the reply to give the status and delivery date.',
    keeps: [/name: 'lookupOrder'/, /ORDERS/],
  },
  {
    name: 'tool-requests-returned',
    kind: 'flow',
    file: 'src/flows.ts',
    from: 'tools: [lookupOrder],',
    to: 'tools: [lookupOrder],\n      returnToolRequests: true,',
    symptom:
      'The orderStatus flow returns an empty answer for "Where is order A-1001?". There is no error, just an empty string. ' +
      'The order is in our system and has shipped. I expected the reply to give the status, delivery date and tracking code.',
    keeps: [/name: 'orderStatus'/, /tools:\s*\[[^\]]*lookupOrder/],
  },
  {
    name: 'stop-sequence',
    kind: 'flow',
    file: 'src/flows.ts',
    from: 'prompt: ticket,\n    });',
    to: "prompt: ticket,\n      config: { stopSequences: ['\\n'] },\n    });",
    symptom:
      'The replies that draftReply writes for customer tickets stop after the first line, usually just "Dear customer," or "Hi there,". ' +
      'There is no error, and the reason it reports for stopping looks normal. ' +
      'I expected a complete reply that explains the next steps and signs off from the support team.',
    keeps: [/name: 'draftReply'/, /finishReason: response\.finishReason/],
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
    keeps: [/name: 'triage'/, /agents: \[[^\]]*'orderAgent'/, /name: 'refundAgent'/],
  },
  {
    name: 'session-not-loaded',
    kind: 'agent',
    file: 'src/agents.ts',
    from: "Do not answer them yourself.',\n  store,\n  maxTurns:",
    to: "Do not answer them yourself.',\n  maxTurns:",
    symptom:
      'In the support chat a customer says "My order is A-1001." and then, in the same conversation, sends "What is its status?". ' +
      'The follow-up fails: the chat cannot be picked up again by its session id, so the customer has to start over and repeat the order number. ' +
      'Single questions still get answered.',
    keeps: [/name: 'triage'/, /use: \[\s*agents\(/],
  },
  {
    name: 'tool-choice-required',
    kind: 'agent',
    file: 'src/agents.ts',
    from: "toolChoice: 'auto',\n  maxTurns: 6,",
    to: "toolChoice: 'required',\n  maxTurns: 6,",
    symptom:
      'On the refund desk a customer wrote "I want a refund for order A-1001, it arrived broken." The desk asked for approval as usual, ' +
      'and the supervisor declined it as a duplicate claim. After that the desk never gives the customer a final answer: ' +
      'it fails, asks for approval again, or keeps working on the order. A declined refund should end with a short reply to the customer.',
    keeps: [/name: 'refundAgent'/, /name: 'approveRefund'/, /tools: \[[^\]]*approveRefund[^\]]*issueRefund[^\]]*\]/],
  },
  {
    name: 'max-delegations-zero',
    kind: 'agent',
    file: 'src/agents.ts',
    from: 'maxDelegations: 3',
    to: 'maxDelegations: 0',
    symptom:
      'In the support chat I ask "Where is order A-1003?" and the assistant answers politely but without any details, ' +
      'saying it cannot get the information right now. There is no error. ' +
      'It happens for every order and every refund request, although the order desk on its own still answers correctly.',
    keeps: [/name: 'triage'/, /agents: \[[^\]]*'orderAgent'[^\]]*'refundAgent'/],
  },
  {
    name: 'max-turns-zero',
    kind: 'agent',
    file: 'src/agents.ts',
    from: 'maxTurns: 5,',
    to: 'maxTurns: 0,',
    symptom:
      'Every question in the support chat that needs order details, such as "Where is order A-1001?", now fails with an error instead of a reply. ' +
      'A plain "hello" still gets a friendly answer, and the order desk on its own answers order questions correctly.',
    keeps: [/name: 'triage'/, /use: \[\s*agents\(/],
  },
  {
    name: 'tool-output-drift',
    kind: 'agent',
    file: 'src/orders.json',
    from: '"total": 149.99',
    to: '"total": "149.99"',
    symptom:
      'This week the support chat started failing on some orders. A customer asked "Where is order A-1001?" and the assistant said it could not retrieve the order details, ' +
      'although A-1001 is in our system and has shipped. Questions about other orders, such as A-1002, still get the real status and delivery date.',
    keeps: [/"A-1001": \{[^}]*"eta": "2026-10-22"/],
  },
]

const workspacePath = (file: string) => file.replace(/^\/reeval\/workspace\//, '').replace(/^(\.\/)+/, '')

const field = (answer: unknown, key: string): string => {
  const value = typeof answer === 'object' && answer !== null ? Reflect.get(answer, key) : undefined
  return typeof value === 'string' ? value : ''
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The healthy text of `bug.file` with `bug` seeded into it. */
export const seed = (healthy: string, bug: Bug): string => healthy.replace(bug.from, () => bug.to)

/**
 * Why `answer` (the parsed `answer.json`) does not locate `bug`; empty when it does. The answer
 * locates the bug when its `file` is `bug.file`, ignoring a leading `./` or `/reeval/workspace/`.
 */
export function locationErrors(answer: unknown, bug: Bug): string[] {
  const file = workspacePath(field(answer, 'file'))
  return file === bug.file ? [] : [`file ${JSON.stringify(file)} is not ${JSON.stringify(bug.file)}`]
}

/**
 * Why `answer` does not name `bug`'s broken text; empty when it does. `healthy` is the healthy
 * `bug.file`. Ignoring whitespace runs, the `snippet` must occur in the seeded file and not in the
 * healthy one, so it overlaps the seeded change: a whole broken line passes, a fragment the two
 * versions share (such as `maxTurns:`) or the healthy text does not.
 */
export function causeErrors(answer: unknown, bug: Bug, healthy: string): string[] {
  const snippet = collapse(field(answer, 'snippet'))
  if (snippet === '') return ['snippet is empty']
  const shown = JSON.stringify(snippet)
  if (!collapse(seed(healthy, bug)).includes(snippet)) return [`snippet ${shown} is not in the broken ${bug.file}`]
  if (collapse(healthy).includes(snippet)) return [`snippet ${shown} is also in the healthy ${bug.file}`]
  return []
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = new URL('./app/', import.meta.url)
  const verify = readFileSync(new URL('./verify.mts', import.meta.url), 'utf8')
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
    for (const file of [bug.file, `./${bug.file}`, `/reeval/workspace/${bug.file}`]) {
      for (const e of locationErrors({ file }, bug)) errors.push(`${bug.name}: own file rejected: ${e}`)
    }
    const seededLine = seed(source, bug).split('\n').find((line) => line.trim() !== '' && !source.split('\n').includes(line))
    for (const snippet of [bug.to, ` ${bug.to.replace(/\n\s*/g, '\n')} `, ...(seededLine ? [seededLine] : [])]) {
      for (const e of causeErrors({ snippet }, bug, source)) errors.push(`${bug.name}: own snippet ${JSON.stringify(snippet)} rejected: ${e}`)
    }
    for (const snippet of ['', bug.from]) {
      if (causeErrors({ snippet }, bug, source).length === 0) errors.push(`${bug.name}: snippet ${JSON.stringify(snippet)} is accepted`)
    }
    for (const other of BUGS) {
      if (other.file !== bug.file && locationErrors({ file: other.file }, bug).length === 0) {
        errors.push(`${bug.name}: ${other.name}'s file (${other.file}) is accepted`)
      }
      if (other !== bug && causeErrors({ snippet: other.to }, bug, source).length === 0) {
        errors.push(`${bug.name}: ${other.name}'s snippet is accepted`)
      }
    }
    if (/genkit|trace|mcp|\bcli\b/i.test(bug.symptom)) errors.push(`${bug.name}: symptom mentions tooling`)
    if (!verify.includes(`test('${bug.name}'`)) errors.push(`${bug.name}: no test('${bug.name}') in verify.mts`)
    const seeded = seed(source, bug)
    for (const other of BUGS) {
      if (other !== bug && other.file === bug.file && count(seeded, other.to) > 0) {
        errors.push(`${bug.name}: seeding it also seeds ${other.name}, so the oracle cannot tell them apart`)
      }
    }
  }
  for (const kind of ['flow', 'agent'] as const) {
    const n = BUGS.filter((b) => b.kind === kind).length
    if (n !== 6) errors.push(`${n} ${kind} bugs, expected 6`)
  }
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log('OK')
}
