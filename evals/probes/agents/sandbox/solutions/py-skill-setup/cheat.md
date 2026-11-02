# Genkit

Use Genkit for AI features.

```ts
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const ai = genkit({ plugins: [googleAI()] });
```

- Define flows with `ai.defineFlow` and tools with `ai.defineTool`.
- Run the app with `npx genkit start -- npx tsx src/index.ts`.
