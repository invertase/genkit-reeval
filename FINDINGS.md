# What building this study taught us about Genkit's agent tooling

We wrote this before any real run. Each item says how we established it:

- **from source**: read in the pinned packages (`genkit` 1.42.0, `@genkit-ai/middleware` 0.10.0, `genkit-cli` 1.44.1) or in the docs.
- **scripted model**: seen when the app ran with a scripted or test model, not with an agent.
- **live**: seen in a real agent run in the sandbox.

Section 5 lists everything the study holds fixed and where each pin came from.

## 1. Two channels give conflicting advice

Genkit gives agents guidance through two channels: `GENKIT.md`, which `genkit init:ai-tools` writes, and the `developing-genkit-js` skill from `genkit-ai/skills`. They disagree about running the CLI.

- **`GENKIT.md` tells the agent not to run the CLI** (from source). Its "Important Guidelines" say: "Do not run Genkit commands (e.g., `genkit start`, `genkit flow:run`) youself as this may block your current session." Its "Running and Inspecting Flows" section tells the agent to call the `start_runtime` MCP tool and to "instruct the user to run `genkit start`".
- **The skill tells the agent to run the CLI** (from source). It says: "Do **not** use `genkit start` as a blocking step in automated/non-interactive contexts; use `flow:run` (below) for that." It also recommends `genkit trace:get <traceId> --format json`, and says that running the app directly "does **not** capture dev traces".
- **`GENKIT.md` assumes the MCP server** (from source). A project that has `GENKIT.md` but no MCP server (the `rules` arm) is told to use a `start_runtime` tool that it does not have, and not to run the CLI that it does have.
- **`init:ai-tools` writes a different `GENKIT.md` from the website's** (from source). The CLI writes a string embedded in `genkit-cli`, not a download of `https://genkit.dev/GENKIT.js.md`. The two share the title and most examples but differ in 60-odd lines: the CLI copy adds "existing project" guidance (keep the structure, detect the package manager and ESM/CJS, do not refactor for Genkit), recommends Gemini 3 preview models where the website says `gemini-2.5-pro`, and is the only copy that mentions `start_runtime`. Both carry the same "Important Guidelines" block, including the typo `youself`. Both are titled `v1.20.0`.

So the `rules` and `mcp` arms are told not to run `genkit flow:run` and to lean on the MCP server's `start_runtime` (which only `mcp` has); the `skill` arm is told to run `genkit flow:run ... --non-interactive` and `genkit trace:get <id> --format json` itself. Tool adoption is read from the transcript, so this is a finding to report, not something to normalise away. The quotes:

`GENKIT.md` (CLI 1.44.1), "Important Guidelines":

> - ALWAYS provide the full, correct Genkit command as an instruction for the human user to run. Do not run Genkit commands (e.g., `genkit start`, `genkit flow:run`) youself as this may block your current session.

`GENKIT.md`, "Running and Inspecting Flows":

> 1. Identify the command to start the user's project's (e.g., `npm run dev`)
> 2. Use the `start_runtime` tool to start the runtime process. This is required for Genkit to discover flows.
>    - Example: If the project uses `npm run dev`, call `start_runtime` with `{ command: "npm", args: ["run", "dev"] }`.
> 3. After starting the runtime, instruct the user to run `genkit start` in their terminal to launch the Developer UI.

`skills/developing-genkit-js/references/docs-and-cli.md` at `d02d49da`, lines 37-53 and 78-80:

> `genkit start` runs until you stop it with Ctrl+C. That is expected and correct for the common cases: a server your web/mobile app calls, or an interactive CLI you exit yourself. `--noui` only drops the Dev UI; it is **not** a one-shot command and will not exit on its own. Do **not** use `genkit start` as a blocking step in automated/non-interactive contexts; use `flow:run` (below) for that.
>
> For non-interactive/agent/CI use, add the global `--non-interactive` flag before `--` so the CLI uses defaults and never blocks on a prompt (e.g. the first-run analytics notice), e.g. `genkit flow:run myFlow '<input>' --non-interactive -- npx tsx src/index.ts`.
>
> ## Flow Execution (secondary)
>
> -   **Run a flow**: `genkit flow:run <flowName> '<inputJSON>' -- <run cmd>`
>     -   Invokes a specific flow by name from the CLI. Append your run command after `--` to spin up the runtime for this run (the command runs as-is to register your flows): it runs once, prints a `Trace ID`, then exits, so it's the right choice for a quick, non-interactive check that must self-terminate (unlike `genkit start`). [...]
>     -   **Simple Input**:
>         ```bash
>         genkit flow:run tellJoke '"chicken"' -- npx tsx src/index.ts
>         ```
>
> -   **Get a trace**: `genkit trace:get <traceId>`
>     -   Retrieves detailed information for a specific trace by its ID. This is particularly useful for debugging failed model calls, inspecting tool execution, or analyzing the exact inputs and outputs of a specific step in your flow.
>     -   **Machine-readable output**: add `--format json` (e.g. `genkit trace:get <traceId> --format json`) to get clean JSON you can pipe into `jq` or other parsers.

`skills/developing-genkit-js/SKILL.md`, "Development Workflow" step 5 and "CLI Usage":

> -   Verify with traces, not a blind run. Running the app directly (`node`/`tsx`/`npm start`) does **not** capture dev traces.
>
> **Non-interactive use (agents/CI):** add the global `--non-interactive` flag before `--` so the CLI uses defaults and never blocks on a prompt (e.g. the first-run analytics notice): `genkit start --non-interactive -- npx tsx src/index.ts` (works with `flow:run` too).

## 2. Agents API

- **MCP and `flow:run` cannot reach agents** (from source). `run_flow`, `list_flows` and `genkit flow:run` address `/flow/<name>` actions only. An agent is a `/agent/<name>` action, so this app wraps one agent turn in a flow (`tryTriage`, `tryRefundDesk`), as the skill's own `agents.md` advises.
- **`agents()` cannot carry a sub-agent's approval interrupt back to the caller** (scripted model, `evals/repro/sub-agent-interrupt.mts`). `refundAgent` called directly stops with `finishReason: 'interrupted'` and the `approveRefund` interrupt. The same request through `triage` with `agents({ agents: ['refundAgent'] })` ends with `finishReason: 'unknown'`, no interrupts and no refund: the middleware turns the sub-agent's interrupt into the tool response "Sub-agent 'refundAgent' interrupted for additional input and could not complete the task. Interactive sub-agent interrupts are not currently supported; try delegating a more self-contained task." (`@genkit-ai/middleware` 0.10.0, `lib/agents.js:178`; its README calls stateful sub-agent interrupts "a future feature"). The caller has nothing to resume, so approval through delegation, the obvious multi-agent shape for a support desk, is not possible with the shipped packages. The app's own healthy `triage` has this shape: a refund asked for at the front desk can never complete. It also blocks an approval round-trip build task for this study, since no idiomatic solution can pass the check. Run the repro with `ln -s ../app/node_modules evals/repro/node_modules && evals/app/node_modules/.bin/tsx evals/repro/sub-agent-interrupt.mts`.
- **A healthy interrupt looks like an error in a trace** (scripted model). The interrupt's tool span has `status.code: 2` and `isFailureSource: true` with an empty message, while the agent's `finishReason` is `interrupted`. An agent that reads the trace can take a working approval step for the bug.
- **`trace:get --format json` truncates when piped** (scripted model). Piped output stops at 64 KB. Agent turns produce large traces, so an agent that pipes the trace into `jq` gets invalid JSON.
- **One condition has two names** (scripted model). Exceeding `maxTurns` throws `AgentError` `ABORTED` ("Exceeded maximum tool call iterations") from `chat.send`, but the flow output shows `finishReason: 'failed'` plus `error`. A search for either name misses the other.
- **The docs describe an API that is gone** (from source). The docs still teach `ai.chat()`, but `genkit` 1.42 has no `chat` method. `ai.defineAgent` replaced it.
- **Delegation lives in a separate 0.x package** (from source). `agents()` comes from `@genkit-ai/middleware` 0.10.0, with a `genkit` peer of `^1.42.0`. An agent that searches `genkit` for delegation does not find it.
- **Agents look for delegation by grepping `node_modules` for "handoff", and `@genkit-ai/ai` has no such word** (live). On the `build-triage` task, Claude Code on Haiku 5.5 took the same route in all four arms: read `agent.d.ts`, grep the type definitions for `handoff`, `delegate` or `asTool`. Three arms concluded there is no built-in hand-off, the `skill` arm in those words, and wrapped each sub-agent's `.chat()` in a tool. The one arm that used `agents()` was the one whose grep happened to include `@genkit-ai/middleware/lib`. No arm searched the docs: no `docs:search`, no MCP docs tool, and the `skill` arm never opened the skill. All four passed the behaviour check; only one passed the idiom judge.
- **`GENKIT.md` has no agents-API content** (from source). It does not mention `defineAgent`, interrupts or sessions. It recommends Gemini 3 preview models (`gemini-3-flash-preview`), while the app uses `gemini-2.5-flash`.

## 3. Flows API

- **`gemini-2.5-flash` thinks by default** (from source). Thinking tokens count against `maxOutputTokens`, so a small limit can return empty text instead of a short answer. The app turns thinking off once, in the model reference passed to `genkit()`, so a short reply is text and not empty. We have not yet seen the empty-text case live.
- **`constrained: false` sends no schema text by default** (from source). With `output: { schema, constrained: false }` the model gets no description of the schema unless `instructions` is set, because the `json` format has `defaultInstructions: false`. The app does not rely on it; an agent that reaches for it to loosen validation will find the model answering blind.

## 4. The MCP server

Seen in the Antigravity smoke of the `mcp` arm (12 bugs, one attempt each, 2026-10-20). The agent reached for the server on one bug, `prompt-model-override`, and ran it into the ground in nine calls.

- **`list_flows` needs a runtime first** (live). The first call answers "No runtimes found. Make sure your app is running using the `start_runtime` MCP tool or the CLI". The agent then called `start_runtime` with `npm run dev` and `list_flows` worked. `genkit flow:run` starts the runtime for you; the MCP tools do not.
- **`run_flow` wants its input as a JSON string** (live). The agent's first call passed `name` and an object `input` and got `Invalid arguments for tool run_flow: Required at flowName; Expected string, received object at input`. The second call, with `flowName` and `input: "{\"text\": ...}"`, ran the flow and returned the result and a trace id.
- **`run_flow` reproduces the bug** (live). Running `greet` returned the app's own error, `404 Not Found models/gemini-1.5-flash is not found`, which names the cause.
- **`restart_runtime` killed the server for the rest of the attempt** (live). After `restart_runtime` answered "Done.", the next `run_flow` failed with `connection closed: calling "tools/call": client is closing: invalid character '>' looking for beginning of value`, and every later call failed with `server name genkit failed to load`. The stray `>` matches the first character of npm's `> support-desk@1.0.0 dev` banner, which suggests the restarted runtime's stdout reached the MCP stdio transport. Not confirmed from source yet.
- **Docs search is broken, in the MCP server and in the CLI** (live, reproduced on the host). `search_genkit_docs` and `genkit docs:search` both fail with `(doc.description || "").toLowerCase is not a function`. Cause: in the docs bundle the CLI serves (1.40.1 on the host, fetched by `docs:list`), the `js/app-frameworks/*.md` entries carry `description` as an object keyed by language, and `searchDocs` in `genkit-cli` `dist/utils/docs.js` calls `toLowerCase()` on it. Every search over the `js` docs reaches those pages, so every search fails. Both Sonnet `mcp` attempts that reached for docs hit it twice, then fell back to `list_genkit_docs`; the `skill` arm hit it through the CLI. No arm has had a working docs search.
- **`list_genkit_docs` is 135 KB** (live). Claude Code refuses the result as over its token limit and saves it to a file, which the agent then has to grep.
- **`read_genkit_docs` works and carries the agents API** (live). The Sonnet `mcp` arm read `js/agents/multi-agent.md` and `js/agents/define.md` and then built delegation with `agents()`. It guessed one path that does not exist, `js/agents/sessions-and-state.md`.
- **Claude Code hides the Genkit tools behind its tool search** (live). With the server on, Claude Code 2.1.290 reports 22 deferred tools; the model sees names only until it calls `ToolSearch` for one. Across 9 Sonnet `mcp` attempts it did so twice, both times for the docs tools, never for `run_flow` or `get_trace`. Haiku never did. The `GENKIT.md` instruction to use `start_runtime` did not change that.
- **Antigravity never ran the CLI** (live). Across the 12 bugs, zero `genkit` commands in 309 shell calls, in line with `GENKIT.md`'s instruction not to run them. It read source and wrote repro scripts instead.

## 5. Pins

Everything the study holds fixed, with where it came from. `evals/rules/GENKIT.md` is the one vendored artifact; `evals/environments.ts` carries the two pins the code needs.

| Thing | Pin | Source |
|---|---|---|
| genkit-cli (in the sandbox image, `evals/Dockerfile`; also a root devDependency) | `1.44.1` | npm |
| genkit (app dependency) | `1.42.0` | npm |
| @genkit-ai/google-genai (app dependency) | `1.42.0` | npm |
| @genkit-ai/middleware (app dependency) | `0.10.0` | npm |
| reeval (root devDependency) | `0.18.0` | npm |
| genkit-ai/skills repository | `d02d49da3a77687914715188d495999170bbf48b` (`main` on 2026-10-20) | `gh api repos/genkit-ai/skills/commits/HEAD --jq .sha` |
| Skill directory in that repository | `skills/developing-genkit-js/` (`SKILL.md` plus `references/*.md`) | `gh api repos/genkit-ai/skills/git/trees/<sha>?recursive=1` |
| Skill's own CLI requirement | `genkit-cli >= 1.29.0`; `SKILL.md` metadata `version: "1.0.0"` | `SKILL.md` lines 14-15, `references/docs-and-cli.md` line 7 |
| `GENKIT.md` content | the string `GENKIT_CONTEXT` in genkit-cli 1.44.1, `dist/commands/init-ai-tools/context/nodejs.js`, byte for byte (11679 bytes, no trailing newline) | sha256 `71cd594de1577284a5ff40793e45d9f8e798d9d04658998f84e27ee1451d0ed4`; the CLI's own 8-char hash of it is `71cd594d` |
| `GENKIT.md` title line | `# Genkit Node.js API Rules (v1.20.0)` (the CLI never bumped the title) | same |
| Website copy, for the record, not used | `https://genkit.dev/GENKIT.js.md` fetched 2026-10-20T09:30Z, 10712 bytes | sha256 `b64c7122765c61d2fbf194636e3f52f8365adb58ea8d6ff96003b2664c64ffd8` |

What `genkit init:ai-tools --tool claude` installs around `GENKIT.md`, and how the `mcp` arm reproduces it:

- `GENKIT.md` at the project root, plus a `<genkit_prompts hash="71cd594d">` block appended to `CLAUDE.md` that reads `Genkit Framework Instructions:\n - @./GENKIT.md`. The eval gives the content as `rules: file('./rules/GENKIT.md')`, so the harness places it as `CLAUDE.md`, `AGENTS.md` or `.cursor/rules` directly. Same text, one hop fewer.
- `.mcp.json` with `{ "command": "genkit", "args": ["mcp", "--no-update-notification"] }`. The eval's `mcp.stdio` adds `--project-root /reeval/workspace`, because the harness may start the server from another cwd.

The skill is fetched with `skill.git('github:genkit-ai/skills', { ref, path: 'skills', only: ['developing-genkit-js'] })`. The `path` is required: reeval 0.9.0 looks for `SKILL.md` in the source directory or one level below it, and this repository keeps its skills under `skills/`. Without it every attempt fails as an infra error ("has no SKILL.md"). reeval's default skill exclude list removes nothing from this skill, so every `references/*.md` reaches the agent.

## 6. What building the probes taught us

We found these while we built the smoke probes in `evals/probes/` (2026-11-02), before any real agent ran them. "Live" here means fetched from the web or run by hand in the sandbox image, not seen in an agent run. [`DOCS-AUDIT.md`](DOCS-AUDIT.md) has the fetched evidence for the docs items.

### Docs and rules files

- **Four docs examples still call `ai.chat(`** (live). `https://genkit.dev/llms-js.txt` uses `ai.chat(` in fenced code on four pages that are not marked deprecated: "Defining AI workflows", "Tool calling", "Pause generation using interrupts" and "Chat with a PDF file". The same bundle says "The `ai.chat()` API is deprecated."
- **`GENKIT.js.md` has an old version in its title** (live). `https://genkit.dev/GENKIT.js.md`, which `llms.txt` gives to agents as the rules file, has the title `v1.20.0`. The current `genkit` is 1.43.0. The website copy and the copy that the CLI writes differ by about 130 lines (the exact count depends on how whitespace and the template's missing trailing newline are treated), but they have the same title.
- **The `llms-<lang>.txt` bundles have no page links** (live). Each bundle is one file of about 1 MB with every page in it. An agent that wants one page must guess its `.md` URL or read the sitemap. `llms.txt` itself links 2 of the 284 docs pages.
- **The URL forms in `llms.txt` work only when an agent reads them as the examples show** (live, [`LLMS-URLS.md`](LLMS-URLS.md)). `llms.txt` says "Append `.md` to any docs URL". Canonical URLs end in `/`, so the literal result, such as `/docs/js/flows/.md`, is a 41.7 KB HTML 404 on all 284 pages. The examples drop the slash (`/docs/js/flows.md`), and that form works on all 284 pages. The 6 pages that are the same for every language (`mcp-server`, `react`, `flutter`, `client`, `feedback`, `roadmap`) return 404 at `/docs/<lang>/<page>.md`. `/docs/<page>.md` without a language returns the raw source for every language, with `<Lang>` blocks, on 79 of 104 pages. A page that does not exist in a language returns a 41.7 KB HTML 404, on all 138 such pairs.
- **The JS develop-with-ai page prints no AGENTS.md block** (live). Only the Go variant of `/docs/<lang>/develop-with-ai` gives a block to paste ("Follow the API rules at https://genkit.dev/GENKIT.go.md", the page and the bundle). The JS variant only describes it. The probes' `hosted` arm uses the Go block, adapted to JS.
- **Old Gemini constants typecheck but fail at run time** (live). `@genkit-ai/googleai` 1.28.0 still exports constants such as `gemini25FlashLite`. Gemini answers 404 for that model ("no longer available to new users"). An agent that follows stale docs gets code that compiles and then fails.
- **The docs disagree about Vertex AI** (from source). The docs call `@genkit-ai/google-genai` the replacement for `@genkit-ai/vertexai`. The Gemini Enterprise page says that `@genkit-ai/vertexai` is "retained for backward compatibility", and npm publishes it at 1.43.0.
- **`genkitx-mcp` has no deprecation notice** (live). npm shows no deprecation for `genkitx-mcp` 1.14.1, so nothing tells an agent to use `@genkit-ai/mcp`.

### CLI and MCP server

- **Without access to genkit.dev, `genkit mcp` stops at start-up whenever its docs cache is missing or stale** (from source, reproduced in the image and on the host). `dist/mcp/server.js` loads the docs bundle before it connects. The bundle is cached per CLI version at `~/.genkit/docs/<CLI version>/bundle.json` and expires after seven days (`DOCS_TTL` in `dist/utils/docs.js`). So when the cache is missing, older than seven days, or the CLI was just upgraded, and genkit.dev is blocked, the server exits with `TypeError: fetch failed`. A 13-day-old cache fails the same way as an empty one. The agent then loses every tool, including `run_flow`, `start_runtime` and `get_trace`, not only the docs tools.
- **With a wrong `--project-root`, `start_runtime` waits 30 s and returns `Error: {}`** (live, in the image, and from source). Before that, `list_flows` says "No runtimes found". The 30 s is the default timeout in `manager-utils.js`, and `runtime.js` reports the error with `JSON.stringify(err)`, which prints `{}` for an `Error`. The error does not say why.
- **The MCP server sees one project only, and `run_flow` cannot choose a runtime** (reproduced, genkit-cli 1.44.1, [`evals/repro/run-flow-two-runtimes.mts`](evals/repro/run-flow-two-runtimes.mts)). `genkit mcp` watches only `<project-root>/.genkit/runtimes`, so a second app in a subdirectory with its own `package.json` is not visible to it. `run_flow` takes only `flowName` and `input`, and the runtime manager then runs the most recent runtime in that root (`manager.ts:397-403`). The manager can address a runtime by id, but the MCP tool never passes one (`dist/mcp/flows.js:39-60`). In the probe smoke the agent asked for the second app's greeting, got the root app's, and reported it as the second app's. `genkit mcp --explicit-project-root` adds a `projectRoot` argument to the tools and reaches the second app, but no docs page names the flag.
- **`genkit eval:flow` rejects the input shape its own error message asks for** (reproduced, genkit-cli 1.44.1, [`evals/repro/eval-flow-input.mts`](evals/repro/eval-flow-input.mts)). Inline data `[{"input":{...}}]` exits 1 with "Please provide an array of inputs for the flow or a Array<{input: any; reference?: any;}> object", followed by `testCaseId` "Required". Only `[{"testCaseId":"t1","input":{...}}]` works inline. The inline path validates with `DatasetSchema`, where `testCaseId` is required (`tools-common types/eval.ts:91-97`). The `--input <file>` path parses `InferenceDatasetSchema` and generates the ids (`utils/eval.ts:253-258`), so the same shape works from a file. The genkit.dev evaluation page shows only the file form.
- **An app that the user starts without `GENKIT_ENV=dev` is not visible** (from source). The reflection server starts only in dev, and only that server writes `.genkit/runtimes/*.json`. `flow:run`, `start` and `start_runtime` set `GENKIT_ENV=dev` themselves, so the problem occurs only for an app that the user started.
- **A partial upgrade fails to install** (live). `@genkit-ai/middleware` 0.11.0 and `@genkit-ai/evaluator` 1.43.0 need `genkit` `^1.43.0`. In an app that pins `genkit` exactly at 1.42.0, `npm install @genkit-ai/evaluator` fails with `ERESOLVE`. With npm's default caret range (`^1.42.0`) it succeeds and silently upgrades `genkit` to 1.43.0. The plugins pair with one genkit minor: genkit 1.42.0 works with `@genkit-ai/evaluator` 1.42.0 and `@genkit-ai/middleware` 0.10.0, so you cannot add the latest plugin to an older genkit. `@genkit-ai/middleware` is on its own 0.x line (0.9 pairs with 1.41, 0.10 with 1.42, 0.11 with 1.43), and nothing on npm documents that mapping.
- **The Claude Code command on the MCP server page fails** (live, `claude` 2.1.316). The page gives `claude mcp add --transport stdio genkit genkit mcp --cwd <path/to/your/genkit/project> --scope <scope>`. `claude` rejects it with `error: unknown option '--cwd'` and writes nothing, and `genkit mcp --cwd .` gives the same error. A form that works is `claude mcp add --transport stdio genkit --scope project -- genkit mcp --project-root <path>`; the `--` is needed only once a server option such as `--project-root` follows. The page gives `local` as the default scope, which is correct, but `local` writes to `~/.claude.json` and not to the project's `.mcp.json`, so teammates do not get the server. For a project-scope server, `claude mcp list` prints "Pending approval" and does not connect, so it cannot tell the agent whether the server starts.
- **`genkit init:ai-tools` does not support Python, and `-y` does not skip its questions** (from source, genkit-cli 1.44.1). In a Python project it prints "Detected runtime 'python' is not yet supported for AI tools context." and then asks for Node.js or Go. The option is declared as `.option('-y', '--yes', ...)`, so `--yes` becomes the description. Without a TTY the command exits with `ExitPromptError`.

### Go and Python

- **The Python skill teaches the API from before 0.12.0** (from source). `developing-genkit-python` at `196e1f64` tells agents to use `from genkit.agent import ...` and `ai.define_agent` on the stable `Genkit`. In genkit 0.12.0 the agents moved to `genkit.exp` (announced in the py/v0.12.0 release notes), and `from genkit.agent import ...` raises `ModuleNotFoundError: No module named 'genkit.agent'`. genkit.dev's own Python agents docs teach the same import (`docs/python/agents/define.md`; `from genkit.agent` 16 times in `llms-python.txt`, `genkit.exp` none). In the probe smoke, the Python agents hit the error and fixed the import themselves.
- **The Go module path does not match the repository** (live). The repository moved to `github.com/genkit-ai/genkit`, but the module is still `github.com/firebase/genkit/go`. The proxy serves `github.com/genkit-ai/genkit/go`, but `go get` on it fails with "module declares its path as: github.com/firebase/genkit/go". The docs and the Go skill use the correct path. The risk is an agent that guesses the path from the repository URL.
- **The Go agents API panics without `genkit.WithExperimental()`** (from source, v1.14.0). The `genkit/exp` constructors panic unless `genkit.Init` gets that option.

## 7. Results

To fill after the runs: which advice the agents followed, what each channel cost or saved, and which of the items above cost the arms time.
