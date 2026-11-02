[Genkit JavaScript/TypeScript Docs Index]
|fetched: 2026-11-02, from https://genkit.dev/sitemap-0.xml and https://genkit.dev/llms-js.txt
|root: https://genkit.dev/docs/js/
|IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any Genkit task. Fetch <root><path>.md for the page you need before you write code.
|all pages in one file: https://genkit.dev/llms-js.txt
|.:{agentic-patterns,api-references,api-stability,chat,context,develop-with-ai,devtools,dotprompt,durable-streaming,error-types,evaluation,flows,get-started,interrupts,local-observability,middleware,model-context-protocol,models,multi-agent,overview,rag,testing,tool-calling}
|agents:{a2ui,background,custom-orchestration,define,errors,http,interrupts,multi-agent,overview,run,session-stores,state}
|app-frameworks:{angular,astro,nextjs,nuxt,overview,remix,sveltekit,tanstack-start}
|backend-frameworks:{express,fastify,hono,nestjs,overview}
|deployment:{any-platform,authorization,aws-lambda,azure-functions,cloud-run,firebase,overview}
|integrations:{anthropic,astra-db,auth0,aws-bedrock,azure-foundry,chroma,cloud-firestore,cloud-sql-postgresql,deepseek,dev-local-vectorstore,google-cloud,google-genai,lancedb,model-providers,neo4j,ollama,openai,openai-compatible,pgvector,pinecone,toolbox,vectorsearch-bigquery,vectorsearch-firestore,vertex-ai,xai}
|observability:{advanced-configuration,authentication,getting-started,otel-genai-semantic-conventions,telemetry-collection,troubleshooting}
|plugin-authoring:{overview}
|tutorials:{chat-with-pdf,summarize-youtube-videos}
|current API facts (each quoted from the docs above):
|Gemini: `npm i genkit @genkit-ai/google-genai`; `import { genkit, z } from 'genkit'`; `import { googleAI } from '@genkit-ai/google-genai'`; `genkit({ plugins: [googleAI()] })`
|Models: `googleAI.model('gemini-flash-latest')` passed as `model:` to `ai.generate`; key in `GEMINI_API_KEY`
|`@genkit-ai/google-genai` replaces `@genkit-ai/googleai`; Gemini Enterprise `vertexAI` is exported from `@genkit-ai/google-genai` too
|Structured output: `ai.generate({ prompt, output: { schema } })` with a Zod schema; read `response.output`
|Claude: `npm i @genkit-ai/anthropic`; `plugins: [anthropic()]`; `anthropic.model('claude-opus-4-8')`; key in `ANTHROPIC_API_KEY`
|MCP server: `npm i genkit @genkit-ai/mcp`; `createMcpServer(ai, { name, version }).start()` serves every tool and prompt over stdio by default
|Middleware: `npm install @genkit-ai/middleware`; `import { fallback } from '@genkit-ai/middleware'`; `ai.generate({ use: [fallback({ models: [...] })] })`
|CLI: `npm install -g genkit-cli`
