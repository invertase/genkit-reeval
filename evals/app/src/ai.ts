import { googleAI } from '@genkit-ai/google-genai';
import { genkit } from 'genkit/beta';

/** The Genkit instance every flow and agent in this app shares. */
export const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-2.5-flash', { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }),
  promptDir: new URL('../prompts/', import.meta.url).pathname,
});
