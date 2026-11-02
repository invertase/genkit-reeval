[Genkit Python Docs Index]
|fetched: 2026-11-02, from https://genkit.dev/sitemap-0.xml and https://genkit.dev/llms-python.txt
|root: https://genkit.dev/docs/python/
|IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any Genkit task. Fetch <root><path>.md for the page you need before you write code.
|all pages in one file: https://genkit.dev/llms-python.txt
|.:{api-references,api-stability,develop-with-ai,devtools,dotprompt,error-types,evaluation,flows,get-started,interrupts,local-observability,middleware,models,overview,rag,tool-calling}
|agents:{background,custom-orchestration,define,errors,http,interrupts,overview,run,session-stores,state}
|app-frameworks:{angular,astro,nextjs,nuxt,overview,remix,sveltekit,tanstack-start}
|backend-frameworks:{django,fastapi,flask,overview}
|deployment:{any-platform,cloud-run,overview}
|integrations:{anthropic,aws-bedrock,deepseek,google-cloud,google-genai,model-providers,ollama,openai,openai-compatible,vertex-ai,xai}
|observability:{telemetry-collection}
|plugin-authoring:{overview}
|current API facts (each quoted from the docs above):
|Gemini: `uv add genkit genkit-google-genai`; `from genkit import Genkit`; `from genkit_google_genai import GoogleAI`; `Genkit(plugins=[GoogleAI()])`
|Models: `await ai.generate(model='googleai/gemini-flash-latest', prompt=...)`; key in `GEMINI_API_KEY`
|Claude: `uv add genkit-anthropic`; `from genkit_anthropic import Anthropic, anthropic_name`; `Genkit(plugins=[Anthropic()])`
|Middleware: `pip install genkit-middleware`; `from genkit_middleware import Retry`
|Python 3.10 or later
