import { z } from 'genkit/beta';
import { ai } from './ai.js';
import { ORDERS } from './db.js';

/** Looks up an order by id in the orders database; returns null when there is no such order. */
export const lookupOrder = ai.defineTool(
  {
    name: 'lookupOrder',
    description:
      'Looks up the status, delivery ETA, tracking code, total and refund eligibility of an order by its id, for example A-1001. ' +
      'Returns null if there is no such order.',
    inputSchema: z.object({ orderId: z.string().describe('The order id, for example A-1001') }),
    outputSchema: z
      .object({
        status: z.string(),
        eta: z.string(),
        tracking: z.string().nullable(),
        total: z.number(),
        refundable: z.boolean(),
      })
      .nullable(),
  },
  async ({ orderId }) => ORDERS[orderId.trim().toUpperCase()] ?? null,
);
