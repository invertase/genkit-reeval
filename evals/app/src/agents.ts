import { agents } from '@genkit-ai/middleware';
import { AgentError, FileSessionStore, z, type AgentChat, type AgentResponse } from 'genkit/beta';
import { ai } from './ai.js';
import { createRefund } from './db.js';
import { lookupOrder } from './tools.js';

const store = new FileSessionStore('.genkit/sessions');

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
  description: 'Answers questions about an order: its status, delivery date, tracking code and total.',
  system:
    'You are the Northwind Supplies order desk. Answer questions about orders using the lookupOrder tool. ' +
    'Quote the status, ETA and tracking code exactly as the tool returns them. If an order is not found, say so.',
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

const TurnSchema = z.object({
  text: z.string(),
  finishReason: z.string(),
  sessionId: z.string().optional(),
  interrupts: z.array(z.object({ name: z.string(), input: z.unknown() })),
  error: z.string().optional().describe('Why the agent failed the turn, for example by running out of turns.'),
});

const toTurn = ({ text, finishReason, sessionId, interrupts }: AgentResponse): z.infer<typeof TurnSchema> => ({
  text,
  finishReason,
  sessionId,
  interrupts: interrupts.map(({ name, input }) => ({ name, input })),
});

/** Sends the message, or answers the pending approveRefund interrupt, and reports agent failures in `error` instead of throwing. */
const runTurn = async (chat: AgentChat, { message, respond }: z.infer<typeof TurnInputSchema>) => {
  try {
    if (respond) {
      const pending = chat.messages.at(-1)?.content.find((p) => p.toolRequest && p.metadata?.interrupt)?.toolRequest;
      if (!pending) throw new Error('No pending approveRefund interrupt in this session');
      const { name, ref } = pending;
      const res = await chat.resume({ respond: [{ toolResponse: { name, ref, output: respond } }] });
      return toTurn(res);
    }
    if (!message) throw new Error('Provide a message, or respond to a pending interrupt');
    return toTurn(await chat.send(message));
  } catch (error) {
    if (!(error instanceof AgentError)) throw error;
    return { ...toTurn(error.response), error: error.message };
  }
};

/** Runs one customer turn through the triage agent. Agents are not flows, so this is how the CLI reaches them. */
export const supportTurn = ai.defineFlow(
  { name: 'supportTurn', inputSchema: TurnInputSchema, outputSchema: TurnSchema },
  async (input) => {
    const chat = input.sessionId ? await triage.loadChat({ sessionId: input.sessionId }) : triage.chat();
    return runTurn(chat, input);
  },
);

/** Runs one turn on the refund desk, which pauses on approveRefund until a human answers. */
export const refundTurn = ai.defineFlow(
  { name: 'refundTurn', inputSchema: TurnInputSchema, outputSchema: TurnSchema },
  async (input) => {
    const chat = input.sessionId ? await refundAgent.loadChat({ sessionId: input.sessionId }) : refundAgent.chat();
    return runTurn(chat, input);
  },
);
