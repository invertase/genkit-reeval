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
- **`agents()` flattens a sub-agent interrupt** (from source). When a delegated sub-agent interrupts, `agents()` returns the text "Sub-agent '...' interrupted for additional input and could not complete the task". The parent cannot resume it, so a refund approval through `triage` is lost.
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
| reeval (root devDependency) | `0.9.0` | npm |
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

## 6. Results

To fill after the runs: which advice the agents followed, what each channel cost or saved, and which of the items above cost the arms time.
