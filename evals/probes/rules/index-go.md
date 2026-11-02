[Genkit Go Docs Index]
|fetched: 2026-11-02, from https://genkit.dev/sitemap-0.xml and https://genkit.dev/llms-go.txt
|root: https://genkit.dev/docs/go/
|IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any Genkit task. Fetch <root><path>.md for the page you need before you write code.
|all pages in one file: https://genkit.dev/llms-go.txt
|.:{agentic-patterns,api-references,api-stability,chat,concurrency,context,develop-with-ai,devtools,dotprompt,durable-streaming,error-types,evaluation,flows,get-started,interrupts,local-observability,middleware,model-context-protocol,models,overview,rag,testing,tool-calling}
|agents:{a2ui,background,custom-orchestration,define,errors,http,interrupts,multi-agent,overview,run,session-stores,state}
|app-frameworks:{angular,astro,nextjs,nuxt,overview,remix,sveltekit,tanstack-start}
|backend-frameworks:{chi,echo,gin,nethttp,overview}
|deployment:{any-platform,authorization,cloud-run,overview}
|integrations:{alloydb,anthropic,aws-bedrock,azure-foundry,cloud-firestore,cloud-sql-postgresql,dashscope,deepseek,dev-local-vectorstore,google-cloud,google-genai,kimi,model-providers,ollama,openai,openai-compatible,openrouter,pgvector,pinecone,system-one,toolbox,vectorsearch-bigquery,vectorsearch-firestore,vertex-ai,xai,zai}
|observability:{advanced-configuration,authentication,getting-started,otel-genai-semantic-conventions,telemetry-collection,troubleshooting}
|plugin-authoring:{overview}
|current API facts (each quoted from the docs above):
|Install: `go get github.com/firebase/genkit/go`, then `go mod tidy`; imports are `github.com/firebase/genkit/go/{ai,genkit}`
|Gemini: `genkit.Init(ctx, genkit.WithPlugins(&googlegenai.GoogleAI{}))` with `github.com/firebase/genkit/go/plugins/googlegenai`; key in `GEMINI_API_KEY`
|Generate: `genkit.Generate(ctx, g, ai.WithPrompt(...), ai.WithModelName("googleai/gemini-flash-latest"))`
|Claude: `&anthropic.Anthropic{}` from `github.com/firebase/genkit/go/plugins/anthropic`; key in `ANTHROPIC_API_KEY`
|Middleware: `ai.WithUse(&middleware.Fallback{...})`
