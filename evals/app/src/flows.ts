import { z } from 'genkit/beta';
import { ai } from './ai.js';
import { ORDERS } from './db.js';

const TicketSummarySchema = z.object({
  title: z.string().describe('Short title for the ticket, under ten words'),
  priority: z.enum(['low', 'medium', 'high']).describe('How urgent the ticket is'),
  tags: z.array(z.string()).describe('Up to three lowercase topic tags'),
});

/** Turns a raw support ticket into a title, a priority and topic tags. */
export const summarizeTicket = ai.defineFlow(
  { name: 'summarizeTicket', inputSchema: z.object({ text: z.string() }), outputSchema: TicketSummarySchema },
  async ({ text }) => {
    const { output } = await ai.generate({
      system:
        'You triage support tickets for Northwind Supplies, an office supplies retailer. ' +
        'Set priority to low, medium or high, where high means the customer is blocked.',
      prompt: text,
      output: { schema: TicketSummarySchema },
    });
    if (!output) throw new Error('summarizeTicket: model returned no structured output');
    return output;
  },
);

const getOrderStatus = ai.defineTool(
  {
    name: 'getOrderStatus',
    description: 'Looks up the shipping status and delivery ETA of an order by its id, for example A-1001.',
    inputSchema: z.object({ orderId: z.string().describe('The order id, for example A-1001') }),
    outputSchema: z.object({ status: z.string(), eta: z.string() }).nullable(),
  },
  async ({ orderId }) => ORDERS[orderId.trim().toUpperCase()] ?? null,
);

/** Answers a customer's question about an order using the orders database. */
export const orderStatus = ai.defineFlow(
  { name: 'orderStatus', inputSchema: z.object({ question: z.string() }), outputSchema: z.string() },
  async ({ question }) => {
    const { text } = await ai.generate({
      system:
        'You are the Northwind Supplies support assistant. Answer questions about orders using the getOrderStatus tool. ' +
        'Quote the status and ETA exactly as the tool returns them. If an order is not found, say so.',
      prompt: question,
      tools: [getOrderStatus],
    });
    return text;
  },
);

/** Welcomes a customer by name using the greet dotprompt. */
export const greet = ai.defineFlow(
  { name: 'greet', inputSchema: z.object({ customerName: z.string() }), outputSchema: z.string() },
  async ({ customerName }) => {
    const { text } = await ai.prompt('greet')({ customerName });
    return text;
  },
);

/** Drafts a full reply to a ticket and reports why the model stopped generating. */
export const draftReply = ai.defineFlow(
  {
    name: 'draftReply',
    inputSchema: z.object({ ticket: z.string() }),
    outputSchema: z.object({ text: z.string(), finishReason: z.string() }),
  },
  async ({ ticket }) => {
    const response = await ai.generate({
      system:
        'You are a support agent at Northwind Supplies. Draft a complete, polite reply to the customer: ' +
        'greet them, acknowledge the problem, explain the next steps in two or three sentences, and sign off as the Northwind support team.',
      prompt: ticket,
    });
    return { text: response.text, finishReason: response.finishReason };
  },
);

const ChatMessageSchema = z.object({ role: z.enum(['user', 'model']), text: z.string() });

/** Multi-turn support chat; the caller keeps the history. */
export const chat = ai.defineFlow(
  {
    name: 'chat',
    inputSchema: z.object({ history: z.array(ChatMessageSchema), message: z.string() }),
    outputSchema: z.string(),
  },
  async ({ history, message }) => {
    const { text } = await ai.generate({
      system:
        'You are the Northwind Supplies support assistant. Keep replies to one or two sentences. ' +
        'Use what the customer told you earlier in the conversation, such as their name or order id.',
      messages: history.map(({ role, text }) => ({ role, content: [{ text }] })),
      prompt: message,
    });
    return text;
  },
);
