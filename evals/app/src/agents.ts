import { googleAI } from '@genkit-ai/google-genai';
import { agents } from '@genkit-ai/middleware';
import { AgentError, FileSessionStore, z, type AgentChat, type GenkitBeta, type MessageData } from 'genkit/beta';
import { createRefund, ORDERS } from './db.js';

const model = googleAI.model('gemini-2.5-flash');
const store = new FileSessionStore('.genkit/sessions');

const TurnInputSchema = z.object({
  message: z.string().optional().describe('The customer message. Starts a session, or continues one with sessionId.'),
  sessionId: z.string().optional().describe('Continues this session instead of starting a new one.'),
  respond: z
    .object({ approved: z.boolean(), note: z.string().optional() })
    .optional()
    .describe('Answers the session\'s pending approveRefund interrupt.'),
});

const AgentTurnSchema = z.object({
  text: z.string(),
  finishReason: z.string(),
  sessionId: z.string(),
  snapshotId: z.string(),
  interrupts: z.array(z.object({ name: z.string(), input: z.unknown() })),
  toolCalls: z.array(z.string()),
  messageCount: z.number(),
  error: z.string().optional(),
});

/** Result of one agent turn, as returned by `supportTurn` and `refundTurn`. */
export type AgentTurn = z.infer<typeof AgentTurnSchema>;
type TurnInput = z.infer<typeof TurnInputSchema>;

/** Full transcript of a session, including tool traffic that `chat.messages` hides. */
const transcript = async (sessionId: string | undefined): Promise<MessageData[]> =>
  sessionId ? ((await store.getSnapshot({ sessionId }))?.state?.messages ?? []) : [];

/** Sends a message or resumes the pending interrupt, and reports the turn without throwing on agent failure. */
const runTurn = async (chat: AgentChat, { message, respond }: TurnInput): Promise<AgentTurn> => {
  const before = (await transcript(chat.sessionId)).length;
  const summarize = async (partial: Partial<AgentTurn>): Promise<AgentTurn> => ({
    text: '',
    finishReason: 'unknown',
    sessionId: chat.sessionId ?? '',
    snapshotId: chat.snapshotId ?? '',
    interrupts: [],
    toolCalls: (await transcript(chat.sessionId))
      .slice(before)
      .flatMap((m) => m.content.flatMap((p) => (p.toolRequest ? [p.toolRequest.name] : []))),
    messageCount: chat.messages.length,
    ...partial,
  });

  try {
    if (respond) {
      const pending = (await transcript(chat.sessionId))
        .filter((m) => m.role === 'model')
        .at(-1)
        ?.content.find((p) => p.toolRequest && p.metadata?.interrupt);
      if (!pending?.toolRequest) throw new Error('No pending approveRefund interrupt in this session');
      const { name, ref } = pending.toolRequest;
      const res = await chat.resume({ respond: [{ toolResponse: { name, ref, output: respond } }] });
      return await summarize({ text: res.text, finishReason: res.finishReason });
    }
    if (!message) throw new Error('Provide a message, or respond to a pending interrupt');
    const res = await chat.send(message);
    return await summarize({
      text: res.text,
      finishReason: res.finishReason,
      interrupts: res.interrupts.map(({ name, input }) => ({ name, input })),
    });
  } catch (error) {
    if (!(error instanceof AgentError)) throw error;
    return summarize({ finishReason: 'failed', error: error.message });
  }
};

/** Defines the support agents, their tools and the two flows that expose them to the CLI and the Dev UI. */
export const defineSupportAgents = (ai: GenkitBeta) => {
  const lookupOrder = ai.defineTool(
    {
      name: 'lookupOrder',
      description: 'Looks up the status, delivery ETA, total and refund eligibility of an order by its id, for example A-1001.',
      inputSchema: z.object({ orderId: z.string().describe('The order id, for example A-1001') }),
      outputSchema: z.object({
        status: z.string(),
        eta: z.string(),
        total: z.number(),
        refundable: z.boolean(),
      }),
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
  const orderAgent = ai.defineAgent({
    name: 'orderAgent',
    description: 'Answers questions about an order: its status, delivery date and total.',
    system:
      'You are the Northwind Supplies order desk. Answer questions about orders using the lookupOrder tool. ' +
      'Quote the status and ETA exactly as the tool returns them. If an order is not found, say so.',
    tools: [lookupOrder],
    maxTurns: 4,
    model,
    config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  });

  /** Handles refund requests and pauses for human approval before refunding. */
  const refundAgent = ai.defineAgent({
    name: 'refundAgent',
    description: 'Handles refund requests for an order. Refunds need human approval.',
    system: 'Look up the order, then call approveRefund, then issueRefund only if approved. Never refund without approval.',
    tools: [lookupOrder, approveRefund, issueRefund],
    toolChoice: 'auto',
    maxTurns: 6,
    model,
    config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    store,
  });

  /** Routes each customer message to the right specialist agent. */
  const triage = ai.defineAgent({
    name: 'triage',
    system: 'Delegate order questions to orderAgent and refund requests to refundAgent. Do not answer them yourself.',
    store,
    maxTurns: 5,
    toolChoice: 'auto',
    model,
    config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    use: [agents({ agents: ['orderAgent', 'refundAgent'], maxDelegations: 3, historyLength: 4 })],
  });

  /** Runs one customer turn through the triage agent. */
  const supportTurn = ai.defineFlow(
    { name: 'supportTurn', inputSchema: TurnInputSchema, outputSchema: AgentTurnSchema },
    async (input) => {
      const { sessionId } = input;
      const chat = sessionId ? await triage.loadChat({ sessionId }) : triage.chat();
      return runTurn(chat, input);
    },
  );

  /** Runs one turn on the refund desk, which pauses on approveRefund until a human answers. */
  const refundTurn = ai.defineFlow(
    { name: 'refundTurn', inputSchema: TurnInputSchema, outputSchema: AgentTurnSchema },
    async (input) => {
      const { sessionId } = input;
      const chat = sessionId ? await refundAgent.loadChat({ sessionId }) : refundAgent.chat();
      return runTurn(chat, input);
    },
  );

  return { orderAgent, refundAgent, triage, supportTurn, refundTurn };
};
