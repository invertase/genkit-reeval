import { readFileSync } from 'node:fs'
import { PROVIDER_CHECK, type Probe } from '../probe.ts'
import { CHECK } from './checks.ts'

/** The probes whose project starts from `fixtures/js-seed` instead of an empty one. */
export const SEEDED = ['chat-session']

/** Versions the oracle and the canary install; an agent installs whatever the registry's `latest` is. */
export const PINS = {
  genkit: '1.43.0',
  googleGenai: '1.43.0',
  mcp: '1.43.0',
  anthropic: '0.6.0',
  middleware: '0.11.0',
  legacyGoogleai: '1.28.0',
  legacyMcp: '1.14.1',
  anthropicSdk: '0.97.1',
} as const

const fixture = JSON.parse(readFileSync(new URL('../fixtures/js-empty/package.json', import.meta.url), 'utf8')) as Record<string, unknown>

/** The fixture's `package.json` with `dependencies` and extra `scripts` added. */
const packageJson = (dependencies: Record<string, string>, scripts: Record<string, string> = {}): string =>
  `${JSON.stringify({ ...fixture, scripts: { ...(fixture.scripts as object), ...scripts }, dependencies }, null, 2)}\n`

const INSTALL = 'npm install --no-audit --no-fund'

const GEMINI = { genkit: PINS.genkit, '@genkit-ai/google-genai': PINS.googleGenai }

const HAIKU_ORACLE = `import { genkit } from 'genkit'
import { googleAI } from '@genkit-ai/google-genai'

const ai = genkit({ plugins: [googleAI()] })

const { text } = await ai.generate({
  model: googleAI.model('gemini-flash-latest'),
  prompt: 'Write a haiku about the sea.',
})
console.log(text)
`

const HAIKU_CHEAT = `import { genkit } from 'genkit'
import { gemini25FlashLite, googleAI } from '@genkit-ai/googleai'

const ai = genkit({ plugins: [googleAI()], model: gemini25FlashLite })

const { text } = await ai.generate('Write a haiku about the sea.')
console.log(text)
`

const STRUCTURED_ORACLE = `import { genkit, z } from 'genkit'
import { googleAI } from '@genkit-ai/google-genai'

const ai = genkit({ plugins: [googleAI()] })

const Contact = z.object({ name: z.string(), email: z.string() })

export const extractContact = ai.defineFlow(
  { name: 'extractContact', inputSchema: z.string(), outputSchema: Contact },
  async (message) => {
    const { output } = await ai.generate({
      model: googleAI.model('gemini-flash-latest'),
      prompt: \`Extract the sender's name and email address from this message:\\n\\n\${message}\`,
      output: { schema: Contact },
    })
    if (!output) throw new Error('The model returned no structured output')
    return output
  },
)
`

const STRUCTURED_CHEAT = `import { genkit, z } from 'genkit'
import { googleAI } from '@genkit-ai/google-genai'

const ai = genkit({ plugins: [googleAI()] })

const Contact = z.object({ name: z.string(), email: z.string() })

export const extractContact = ai.defineFlow(
  { name: 'extractContact', inputSchema: z.string(), outputSchema: Contact },
  async (message) => {
    const { text } = await ai.generate({
      model: googleAI.model('gemini-flash-latest'),
      prompt: \`Reply with only a JSON object with the keys name and email, the sender of this message:\\n\\n\${message}\`,
    })
    return Contact.parse(JSON.parse(text.replace(/^\\s*\`\`\`(?:json)?\\s*|\\s*\`\`\`\\s*$/g, '')))
  },
)
`

const MCP_ORACLE = `import { genkit, z } from 'genkit'
import { createMcpServer } from '@genkit-ai/mcp'

const ai = genkit({})

ai.defineTool(
  {
    name: 'add',
    description: 'Adds two numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    outputSchema: z.number(),
  },
  async ({ a, b }) => a + b,
)

await createMcpServer(ai, { name: 'math', version: '1.0.0' }).start()
`

const MCP_CHEAT = `import { genkit, z } from 'genkit'
import { mcpServer } from 'genkitx-mcp'

const ai = genkit({})

ai.defineTool(
  {
    name: 'add',
    description: 'Adds two numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    outputSchema: z.number(),
  },
  async ({ a, b }) => a + b,
)

await mcpServer(ai, { name: 'math', version: '1.0.0' }).start()
`

const ANTHROPIC_ORACLE = `import { genkit, z } from 'genkit'
import { anthropic } from '@genkit-ai/anthropic'

const ai = genkit({ plugins: [anthropic()] })

export const askClaude = ai.defineFlow(
  { name: 'askClaude', inputSchema: z.string(), outputSchema: z.string() },
  async (question) => {
    const { text } = await ai.generate({ model: anthropic.model('claude-sonnet-4-6'), prompt: question })
    return text
  },
)
`

const ANTHROPIC_CHEAT = `import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function askClaude(question: string): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1024,
    messages: [{ role: 'user', content: question }],
  })
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}
`

const FALLBACK_ORACLE = `import { genkit } from 'genkit'
import { googleAI } from '@genkit-ai/google-genai'
import { fallback } from '@genkit-ai/middleware'

const ai = genkit({ plugins: [googleAI()] })

const { text } = await ai.generate({
  model: googleAI.model('gemini-flash-latest'),
  prompt: 'Tell me a short joke about programmers.',
  use: [fallback({ models: [googleAI.model('gemini-flash-lite-latest')] })],
})
console.log(text)
`

const FALLBACK_CHEAT = `import { genkit } from 'genkit'
import { googleAI } from '@genkit-ai/google-genai'

const ai = genkit({ plugins: [googleAI()] })

const prompt = 'Tell me a short joke about programmers.'
let text: string
try {
  text = (await ai.generate({ model: googleAI.model('gemini-flash-latest'), prompt })).text
} catch {
  text = (await ai.generate({ model: googleAI.model('gemini-flash-lite-latest'), prompt })).text
}
console.log(text)
`

const MEDIA_ORACLE = `import { genkit, z } from 'genkit'
import { googleAI } from '@genkit-ai/google-genai'

const ai = genkit({ plugins: [googleAI()] })

export const speak = ai.defineFlow(
  { name: 'speak', inputSchema: z.string(), outputSchema: z.string() },
  async (text) => {
    const { media } = await ai.generate({
      model: googleAI.model('gemini-3.8-flash-tts'),
      prompt: text,
      config: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
    })
    if (!media) throw new Error('The model returned no audio')
    return media.url
  },
)

export const drawImage = ai.defineFlow(
  { name: 'drawImage', inputSchema: z.string(), outputSchema: z.string() },
  async (description) => {
    const { media } = await ai.generate({
      model: googleAI.model('gemini-nano-banana-2.1'),
      prompt: description,
      config: { responseModalities: ['IMAGE'] },
    })
    if (!media) throw new Error('The model returned no image')
    return media.url
  },
)
`

const MEDIA_CHEAT = MEDIA_ORACLE.replace('gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts').replace(
  /model: googleAI\.model\('gemini-nano-banana-2\.1'\),\n      prompt: description,\n      config: \{ responseModalities: \['IMAGE'\] \},/,
  "model: googleAI.model('imagen-3.0-generate-002'),\n      prompt: description,",
)

const CHAT_ORACLE = `import { FileSessionStore, genkit } from 'genkit/beta'
import { googleAI } from '@genkit-ai/google-genai'

const ai = genkit({ plugins: [googleAI()], model: googleAI.model('gemini-flash-latest') })

const assistant = ai.defineAgent({
  name: 'assistant',
  system: 'You are a helpful assistant. Answer briefly.',
  store: new FileSessionStore('.genkit/sessions'),
})

export async function turn(sessionId: string | undefined, message: string): Promise<{ reply: string; sessionId: string }> {
  const chat = assistant.chat(sessionId === undefined ? {} : { sessionId })
  const res = await chat.send(message)
  return { reply: res.text, sessionId: res.sessionId ?? '' }
}
`

const CHAT_CHEAT = `import { randomUUID } from 'node:crypto'
import { genkit } from 'genkit'
import { googleAI } from '@genkit-ai/google-genai'
import type { MessageData } from 'genkit'

const ai = genkit({ plugins: [googleAI()], model: googleAI.model('gemini-flash-latest') })

const sessions = new Map<string, MessageData[]>()

export async function turn(sessionId: string | undefined, message: string): Promise<{ reply: string; sessionId: string }> {
  const id = sessionId ?? randomUUID()
  const history = sessions.get(id) ?? []
  const { text, messages } = await ai.generate({
    system: 'You are a helpful assistant. Answer briefly.',
    messages: history,
    prompt: message,
  })
  sessions.set(id, messages)
  return { reply: text, sessionId: id }
}
`

/** The docs suite's probes: from an empty JS project, does the docs channel get an agent to the current API? */
export const PROBES: Probe[] = [
  {
    name: 'pkg-gemini-haiku',
    prompt: 'Add Gemini to this project with Genkit and make `npm start` print a haiku about the sea.',
    checks: [PROVIDER_CHECK, CHECK.usesGoogleGenai, CHECK.noLegacyGemini, CHECK.noModelConstants, CHECK.typechecks, CHECK.startPrints],
    oracle: { files: { 'package.json': packageJson(GEMINI), 'src/index.ts': HAIKU_ORACLE }, exec: INSTALL },
    cheat: {
      files: { 'package.json': packageJson({ genkit: PINS.genkit, '@genkit-ai/googleai': PINS.legacyGoogleai }), 'src/index.ts': HAIKU_CHEAT },
      exec: INSTALL,
      fails: [CHECK.usesGoogleGenai, CHECK.noLegacyGemini, CHECK.noModelConstants, CHECK.startPrints],
    },
  },
  {
    name: 'structured-output',
    prompt:
      'Using Genkit and Gemini, add a flow named `extractContact` that takes a message as a plain string and returns the sender\'s `name` and `email` as an object. ' +
      'Put it in `src/flows.ts` and export it as `extractContact`.',
    checks: [PROVIDER_CHECK, CHECK.outputSchema, CHECK.noDeprecatedImports, CHECK.typechecks, CHECK.flowReturnsContact],
    oracle: { files: { 'package.json': packageJson(GEMINI), 'src/flows.ts': STRUCTURED_ORACLE }, exec: INSTALL },
    cheat: { files: { 'package.json': packageJson(GEMINI), 'src/flows.ts': STRUCTURED_CHEAT }, exec: INSTALL, fails: [CHECK.outputSchema] },
  },
  {
    name: 'mcp-server',
    prompt: 'Using Genkit, define a tool named `add` that adds two numbers `a` and `b`, and expose it as an MCP server over stdio. `npm run mcp` must start the server.',
    checks: [PROVIDER_CHECK, CHECK.usesMcp, CHECK.noLegacyMcp, CHECK.typechecks, CHECK.serverListsTool],
    oracle: {
      files: { 'package.json': packageJson({ genkit: PINS.genkit, '@genkit-ai/mcp': PINS.mcp }, { mcp: 'tsx src/mcp.ts' }), 'src/mcp.ts': MCP_ORACLE },
      exec: INSTALL,
    },
    cheat: {
      files: { 'package.json': packageJson({ genkit: PINS.genkit, 'genkitx-mcp': PINS.legacyMcp }, { mcp: 'tsx src/mcp.ts' }), 'src/mcp.ts': MCP_CHEAT },
      exec: INSTALL,
      fails: [CHECK.usesMcp, CHECK.noLegacyMcp],
    },
  },
  {
    name: 'anthropic-plugin',
    prompt: 'Use Claude through Genkit: add a flow named `askClaude` in `src/flows.ts` that takes a question as a string and answers it with a Claude model.',
    checks: [PROVIDER_CHECK, CHECK.usesAnthropic, CHECK.noAnthropicSdk, CHECK.noStaleClaude, CHECK.registersAnthropic, CHECK.typechecks],
    oracle: {
      files: { 'package.json': packageJson({ genkit: PINS.genkit, '@genkit-ai/anthropic': PINS.anthropic }), 'src/flows.ts': ANTHROPIC_ORACLE },
      exec: INSTALL,
    },
    cheat: {
      files: { 'package.json': packageJson({ '@anthropic-ai/sdk': PINS.anthropicSdk }), 'src/flows.ts': ANTHROPIC_CHEAT },
      exec: INSTALL,
      fails: [CHECK.usesAnthropic, CHECK.noAnthropicSdk, CHECK.noStaleClaude, CHECK.registersAnthropic],
    },
  },
  {
    name: 'fallback-middleware',
    prompt:
      'Using Genkit, make `npm start` print a short joke written by Gemini. ' +
      'If the Gemini call fails, it should fall back to another model instead of failing.',
    checks: [PROVIDER_CHECK, CHECK.usesFallback, CHECK.typechecks, CHECK.startPrints],
    oracle: {
      files: { 'package.json': packageJson({ ...GEMINI, '@genkit-ai/middleware': PINS.middleware }), 'src/index.ts': FALLBACK_ORACLE },
      exec: INSTALL,
    },
    cheat: { files: { 'package.json': packageJson(GEMINI), 'src/index.ts': FALLBACK_CHEAT }, exec: INSTALL, fails: [CHECK.usesFallback] },
  },
  {
    name: 'media-models',
    prompt:
      'Using Genkit and Gemini, add two flows in `src/flows.ts`: a flow named `speak` that turns a text string into speech, ' +
      'and a flow named `drawImage` that generates an image from a text description. Export both by those names.',
    checks: [PROVIDER_CHECK, CHECK.exportsMediaFlows, CHECK.noShutDownMedia, CHECK.noDeprecatedMedia, CHECK.typechecks, CHECK.mediaModelsExist],
    oracle: { files: { 'package.json': packageJson(GEMINI), 'src/flows.ts': MEDIA_ORACLE }, exec: INSTALL },
    cheat: { files: { 'package.json': packageJson(GEMINI), 'src/flows.ts': MEDIA_CHEAT }, exec: INSTALL, fails: [CHECK.noShutDownMedia, CHECK.noDeprecatedMedia] },
  },
  {
    name: 'chat-session',
    prompt:
      'This assistant in `src/index.ts` answers every message as if it were the first. Make it a chat that remembers the conversation, ' +
      'including after the process restarts. Replace `reply` with this export:\n' +
      '`export async function turn(sessionId: string | undefined, message: string): Promise<{ reply: string; sessionId: string }>`\n' +
      'With `undefined` it starts a new conversation. An id that an earlier call returned continues that conversation, even from a new process. ' +
      'The Gemini API key is in the `GEMINI_API_KEY` environment variable.',
    checks: [PROVIDER_CHECK, CHECK.noDeprecatedChat, CHECK.typechecks, CHECK.secondProcessRecalls],
    oracle: { files: { 'src/index.ts': CHAT_ORACLE } },
    cheat: { files: { 'src/index.ts': CHAT_CHEAT }, fails: [CHECK.secondProcessRecalls] },
  },
]
