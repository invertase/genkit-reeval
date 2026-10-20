# What building this study taught us about Genkit's agent tooling

We wrote this before any real run. Each item says how we established it:

- **from source**: read in the pinned packages (`genkit` 1.42.0, `@genkit-ai/middleware` 0.10.0, `genkit-cli` 1.44.1) or in the docs.
- **scripted model**: seen when the app ran with a scripted or test model, not with an agent.
- **live**: seen in a real study run. No item is live yet.

Pins and full quotes are in `evals/rules/PINS.md`.

## 1. Two channels give conflicting advice

Genkit gives agents guidance through two channels: `GENKIT.md`, which `genkit init:ai-tools` writes, and the `developing-genkit-js` skill from `genkit-ai/skills`. They disagree about running the CLI.

- **`GENKIT.md` tells the agent not to run the CLI** (from source). Its "Important Guidelines" say: "Do not run Genkit commands (e.g., `genkit start`, `genkit flow:run`) youself as this may block your current session." Its "Running and Inspecting Flows" section tells the agent to call the `start_runtime` MCP tool and to "instruct the user to run `genkit start`".
- **The skill tells the agent to run the CLI** (from source). It says: "Do **not** use `genkit start` as a blocking step in automated/non-interactive contexts; use `flow:run` (below) for that." It also recommends `genkit trace:get <traceId> --format json`, and says that running the app directly "does **not** capture dev traces".
- **`GENKIT.md` assumes the MCP server** (from source). A project that has `GENKIT.md` but no MCP server (the `rules` arm) is told to use a `start_runtime` tool that it does not have, and not to run the CLI that it does have.

## 2. Agents API

- **MCP and `flow:run` cannot reach agents** (from source). `run_flow`, `list_flows` and `genkit flow:run` address `/flow/<name>` actions only. An agent is a `/agent/<name>` action, so this app wraps one agent turn in a flow (`tryTriage`, `tryRefundDesk`), as the skill's own `agents.md` advises.
- **`agents()` flattens a sub-agent interrupt** (from source). When a delegated sub-agent interrupts, `agents()` returns the text "Sub-agent '...' interrupted for additional input and could not complete the task". The parent cannot resume it, so a refund approval through `triage` is lost.
- **A healthy interrupt looks like an error in a trace** (scripted model). The interrupt's tool span has `status.code: 2` and `isFailureSource: true` with an empty message, while the agent's `finishReason` is `interrupted`. An agent that reads the trace can take a working approval step for the bug.
- **`trace:get --format json` truncates when piped** (scripted model). Piped output stops at 64 KB. Agent turns produce large traces, so an agent that pipes the trace into `jq` gets invalid JSON.
- **One condition has two names** (scripted model). Exceeding `maxTurns` throws `AgentError` `ABORTED` ("Exceeded maximum tool call iterations") from `chat.send`, but the flow output shows `finishReason: 'failed'` plus `error`. A search for either name misses the other.
- **The docs describe an API that is gone** (from source). The docs still teach `ai.chat()`, but `genkit` 1.42 has no `chat` method. `ai.defineAgent` replaced it.
- **Delegation lives in a separate 0.x package** (from source). `agents()` comes from `@genkit-ai/middleware` 0.10.0, with a `genkit` peer of `^1.42.0`. An agent that searches `genkit` for delegation does not find it.
- **`GENKIT.md` has no agents-API content** (from source). It does not mention `defineAgent`, interrupts or sessions. It recommends Gemini 3 preview models (`gemini-3-flash-preview`), while the app uses `gemini-2.5-flash`.

## 3. Flows API

- **`gemini-2.5-flash` thinks by default** (from source). Thinking tokens count against `maxOutputTokens`, so a small limit can return empty text instead of a short answer. The app turns thinking off once, in the model reference passed to `genkit()`, so a short reply is text and not empty. We have not yet seen the empty-text case live.
- **`constrained: false` sends no schema text by default** (from source). With `output: { schema, constrained: false }` the model gets no description of the schema unless `instructions` is set, because the `json` format has `defaultInstructions: false`. The app does not rely on it; an agent that reaches for it to loosen validation will find the model answering blind.

## 4. Results

To fill after the runs: which advice the agents followed, what each channel cost or saved, and which of the items above cost the arms time.
