import { agents } from '@genkit-ai/middleware';
import { FileSessionStore, z } from 'genkit/beta';
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
  system:
    'Look up the order, then call approveRefund, then issueRefund only if approved. Never refund without approval. ' +
    'The refund amount is always the order total as lookupOrder returns it; never ask the customer for an amount.',
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

/** Lets the CLI exercise triage: `genkit flow:run` runs flows, not agents. */
export const tryTriage = ai.defineFlow(
  { name: 'tryTriage', inputSchema: z.string(), outputSchema: z.string() },
  async (message) => (await triage.chat().send(message)).text,
);

/** Lets the CLI exercise the refund desk: `genkit flow:run` runs flows, not agents. */
export const tryRefundDesk = ai.defineFlow(
  { name: 'tryRefundDesk', inputSchema: z.string(), outputSchema: z.string() },
  async (message) => (await refundAgent.chat().send(message)).text,
);
