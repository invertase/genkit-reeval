import { agents } from '@genkit-ai/middleware';
import { genkit, z } from 'genkit/beta';

const ai = genkit({});
let refunds = 0;
const issueRefund = ai.defineTool(
  { name: 'issueRefund', description: 'Refunds an order.', inputSchema: z.object({ orderId: z.string() }), outputSchema: z.string() },
  async () => {
    refunds++;
    return 'R-1001';
  },
);
const approveRefund = ai.defineInterrupt({
  name: 'approveRefund',
  description: 'Asks a human to approve a refund.',
  inputSchema: z.object({ orderId: z.string() }),
  outputSchema: z.object({ approved: z.boolean() }),
});
const refundModel = ai.defineModel({ name: 'refund-model' }, async (req) => {
  const answered = req.messages.some((m) => m.content.some((p) => p.toolResponse?.name === 'approveRefund'));
  const name = answered ? 'issueRefund' : 'approveRefund';
  return { message: { role: 'model', content: [{ toolRequest: { name, input: { orderId: 'A-1001' } } }] } };
});
const refundAgent = ai.defineAgent({ name: 'refundAgent', description: 'Handles refunds.', model: refundModel, tools: [approveRefund, issueRefund] });

const frontModel = ai.defineModel({ name: 'front-model' }, async (req) => {
  const tool = req.messages.flatMap((m) => m.content).find((p) => p.toolResponse);
  if (tool) return { message: { role: 'model', content: [{ text: `front desk saw: ${JSON.stringify(tool.toolResponse!.output)}` }] } };
  return { message: { role: 'model', content: [{ toolRequest: { name: 'delegate_to_refundAgent', input: { task: 'Refund order A-1001' } } }] } };
});
const triage = ai.defineAgent({ name: 'triage', model: frontModel, use: [agents({ agents: ['refundAgent'] })] });

const direct = await refundAgent.chat().send('Refund A-1001');
console.log('refundAgent direct:', JSON.stringify({ finishReason: direct.finishReason, interrupts: direct.interrupts.map((i) => i.name) }));

const res = await triage.chat().send('I want a refund for order A-1001, it arrived broken.');
console.log('triage via agents():', JSON.stringify({ finishReason: res.finishReason, interrupts: res.interrupts.map((i) => i.name), refunds, text: res.text }, null, 2));
