import { genkit } from 'genkit'
import { googleAI } from '@genkit-ai/google-genai'

const ai = genkit({ plugins: [googleAI()], model: googleAI.model('gemini-flash-latest') })

/** Answers one message. Each call starts from nothing: the assistant remembers no earlier message. */
export async function reply(message: string): Promise<string> {
  const { text } = await ai.generate({ system: 'You are a helpful assistant. Answer briefly.', prompt: message })
  return text
}
