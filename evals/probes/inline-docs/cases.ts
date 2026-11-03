import { FIXED_CHECKS, HEALTHY, type Task, TASKS } from '../../tasks.ts'
import type { Probe } from '../probe.ts'

/** The study's build task this suite reruns: its start state, prompt and hidden checks, unchanged. */
export const TASK: Task = (() => {
  const task = TASKS.find((t) => t.name === 'build-triage')
  if (!task) throw new Error('no build-triage task in evals/tasks.ts')
  return task
})()

/** The headline check: the agent delegated with the `agents()` middleware rather than tools of its own. */
export const USES_AGENTS = 'uses agents() delegation'

const replaceOnce = (text: string, from: string, to: string): string => {
  if (text.split(from).length !== 2) throw new Error(`${JSON.stringify(from)} not found once in src/agents.ts`)
  return text.replace(from, () => to)
}

const WRAPPER_TOOLS = `
const askOrderDesk = ai.defineTool(
  {
    name: 'askOrderDesk',
    description: 'Hands an order question (status, delivery date, tracking code) to the order desk agent and returns its reply. Put the order id in the question.',
    inputSchema: z.object({ question: z.string() }),
    outputSchema: z.object({ reply: z.string() }),
  },
  async ({ question }) => ({ reply: (await orderAgent.chat().send(question)).text }),
);

const askRefundDesk = ai.defineTool(
  {
    name: 'askRefundDesk',
    description: 'Hands a refund request to the refund desk agent and returns its reply. Put the order id and the reason in the request.',
    inputSchema: z.object({ request: z.string() }),
    outputSchema: z.object({ reply: z.string(), finishReason: z.string() }),
  },
  async ({ request }) => {
    const res = await refundAgent.chat().send(request);
    return { reply: res.text, finishReason: res.finishReason };
  },
);
`

/** The healthy app with triage's `agents()` middleware swapped for tools that wrap each desk's `chat()`. */
const handRolledTriage = replaceOnce(
  replaceOnce(
    replaceOnce(HEALTHY['src/agents.ts'], "import { agents } from '@genkit-ai/middleware';\n", ''),
    '\n/** Routes each customer message',
    `${WRAPPER_TOOLS}\n/** Routes each customer message`,
  ),
  "  use: [agents({ agents: ['orderAgent', 'refundAgent'], maxDelegations: 3, historyLength: 4 })],\n",
  '  tools: [askOrderDesk, askRefundDesk],\n',
)

/** Every check label the eval records, in order: the study's fixed checks around the task's own, then the idiom check. */
export const CHECKS = [...FIXED_CHECKS.slice(0, 4), ...TASK.checks, ...FIXED_CHECKS.slice(4), USES_AGENTS]

/** The one probe: the study's `build-triage`, judged on whether the agent used `agents()`. */
export const PROBES: Probe[] = [
  {
    name: TASK.name,
    prompt: TASK.prompt,
    checks: CHECKS,
    oracle: { files: { 'src/agents.ts': HEALTHY['src/agents.ts'], 'src/index.ts': HEALTHY['src/index.ts'] } },
    cheat: { files: { 'src/agents.ts': handRolledTriage, 'src/index.ts': HEALTHY['src/index.ts'] }, fails: [USES_AGENTS] },
  },
]

