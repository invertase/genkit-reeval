import { fileURLToPath } from 'node:url';
import { googleAI } from '@genkit-ai/google-genai';
import { genkit } from 'genkit/beta';

/** The Genkit instance every flow and agent in this app shares. */
export const ai = genkit({
  plugins: [googleAI()],
  // Thinking tokens count against maxOutputTokens, so thinking is off to let a token cap cut the reply itself.
  model: googleAI.model('gemini-2.5-flash', { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }),
  promptDir: fileURLToPath(new URL('../prompts/', import.meta.url)),
});
