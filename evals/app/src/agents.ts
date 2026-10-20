import { agents } from '@genkit-ai/middleware';
import { AgentError, FileSessionStore, z, type AgentChat } from 'genkit/beta';
import { ai } from './ai.js';
import { createRefund, ORDERS } from './db.js';

const store = new FileSessionStore('.genkit/sessions');

const lookupOrder = ai.defineTool(
  {
    name: 'lookupOrder',
    description: 'Looks up the status, delivery ETA, total and refund eligibility of an order by its id, for example A-1001.',
    inputSchema: z.object({ orderId: z.string().describe('The order id, for example A-1001') }),
    outputSchema: z.object({ status: z.string(), eta: z.string(), total: z.number(), refundable: z.boolean() }),
  },
  async ({ orderId }) => {
    const order = ORDERS[orderId];
    if (!order) throw new Error(`Order ${orderId} not found`);
    return order;
  },
);

const issueRefund = ai.defineTool(
  {
    name: 'issueRefund',
    description: 'Refunds an amount to the customer for an order. Only call this after approveRefund returned approved.',
    inputSchema: z.object({ orderId: z.string(), amount: z.number() }),
    outputSchema: z.object({ refundId: z.string() }),
  },
  async ({ orderId, amount }) => ({ refundId: createRefund(orderId, amount) }),
);

const approveRefund = ai.defineInterrupt({
  name: 'approveRefund',
  description: 'Asks a human to approve a refund before it is issued.',
  inputSchema: z.object({ orderId: z.string(), amount: z.number(), reason: z.string() }),
  outputSchema: z.object({ approved: z.boolean(), note: z.string().optional() }),
});

/** Answers order status questions. */
export const orderAgent = ai.defineAgent({
  name: 'orderAgent',
  description: 'Answers questions about an order: its status, delivery date and total.',
  system:
    'You are the Northwind Supplies order desk. Answer questions about orders using the lookupOrder tool. ' +
    'Quote the status and ETA exactly as the tool returns them. If an order is not found, say so.',
  tools: [lookupOrder],
  maxTurns: 4,
});

/** Handles refund requests and pauses for human approval before refunding. */
export const refundAgent = ai.defineAgent({
  name: 'refundAgent',
  description: 'Handles refund requests for an order. Refunds need human approval.',
  system: 'Look up the order, then call approveRefund, then issueRefund only if approved. Never refund without approval.',
  tools: [lookupOrder, approveRefund, issueRefund],
  toolChoice: 'auto',
  maxTurns: 6,
  store,
});

/** Routes each customer message to the right specialist agent. */
export const triage = ai.defineAgent({
  name: 'triage',
  system: 'Delegate order questions to orderAgent and refund requests to refundAgent. Do not answer them yourself.',
  store,
  maxTurns: 5,
  toolChoice: 'auto',
  use: [agents({ agents: ['orderAgent', 'refundAgent'], maxDelegations: 3, historyLength: 4 })],
});

const TurnInputSchema = z.object({
  message: z.string().optional().describe('The customer message. Starts a session, or continues one with sessionId.'),
  sessionId: z.string().optional().describe('Continues this session instead of starting a new one.'),
  respond: z
    .object({ approved: z.boolean(), note: z.string().optional() })
    .optional()
    .describe("Answers the session's pending approveRefund interrupt."),
});

const AgentTurnSchema = z.object({
  text: z.string(),
  finishReason: z.string(),
  sessionId: z.string(),
  interrupts: z.array(z.object({ name: z.string(), input: z.unknown() })),
  toolCalls: z.array(z.string()),
  error: z.string().optional(),
});

/** One agent turn as `supportTurn` and `refundTurn` report it. */
export type AgentTurn = z.infer<typeof AgentTurnSchema>;

/** The session's stored messages, which carry the tool traffic that `chat.messages` leaves out. */
const stored = async (chat: AgentChat) =>
  chat.sessionId ? ((await store.getSnapshot({ sessionId: chat.sessionId }))?.state?.messages ?? []) : [];

/** Sends a message or answers the pending interrupt, and reports the turn instead of throwing on agent failure. */
const runTurn = async (chat: AgentChat, { message, respond }: z.infer<typeof TurnInputSchema>): Promise<AgentTurn> => {
  const before = (await stored(chat)).length;
  const report = async (turn: Partial<AgentTurn>): Promise<AgentTurn> => ({
    text: '',
    finishReason: 'unknown',
    sessionId: chat.sessionId ?? '',
    interrupts: [],
    toolCalls: (await stored(chat))
      .slice(before)
      .flatMap((m) => m.content.flatMap((p) => (p.toolRequest ? [p.toolRequest.name] : []))),
    ...turn,
  });

  try {
    if (respond) {
      const pending = (await stored(chat))
        .filter((m) => m.role === 'model')
        .at(-1)
        ?.content.find((p) => p.toolRequest && p.metadata?.interrupt);
      if (!pending?.toolRequest) throw new Error('No pending approveRefund interrupt in this session');
      const { name, ref } = pending.toolRequest;
      const res = await chat.resume({ respond: [{ toolResponse: { name, ref, output: respond } }] });
      return await report({ text: res.text, finishReason: res.finishReason });
    }
    if (!message) throw new Error('Provide a message, or respond to a pending interrupt');
    const res = await chat.send(message);
    return await report({
      text: res.text,
      finishReason: res.finishReason,
      interrupts: res.interrupts.map(({ name, input }) => ({ name, input })),
    });
  } catch (error) {
    if (!(error instanceof AgentError)) throw error;
    return report({ finishReason: 'failed', error: error.message });
  }
};

/** Runs one customer turn through the triage agent. Agents are not flows, so this is how the CLI reaches them. */
export const supportTurn = ai.defineFlow(
  { name: 'supportTurn', inputSchema: TurnInputSchema, outputSchema: AgentTurnSchema },
  async (input) => {
    const chat = input.sessionId ? await triage.loadChat({ sessionId: input.sessionId }) : triage.chat();
    return runTurn(chat, input);
  },
);

/** Runs one turn on the refund desk, which pauses on approveRefund until a human answers. */
export const refundTurn = ai.defineFlow(
  { name: 'refundTurn', inputSchema: TurnInputSchema, outputSchema: AgentTurnSchema },
  async (input) => {
    const chat = input.sessionId ? await refundAgent.loadChat({ sessionId: input.sessionId }) : refundAgent.chat();
    return runTurn(chat, input);
  },
);
