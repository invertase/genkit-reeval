# Genkit agent tooling study

Does Genkit's agent tooling (`GENKIT.md`, the `genkit mcp` server, the `developing-genkit-js` skill) help a coding agent fix a bug in a Genkit app, or build a feature with Genkit's agents API?
Does it make the fix faster or cheaper, or neither?

It runs on [reeval](https://github.com/invertase/reeval), Invertase's eval runner for coding agents. The full run has not happened yet; this README will carry its results. The smoke runs have, and they already answer some of it: see "What the smokes showed" below, `FINDINGS.md` for the detail, and `evals/.history/` for the recorded runs with every transcript.

## The task

A real coding agent works in a Docker sandbox on a support-desk app that calls real Gemini. One bug is seeded before the first turn. The agent gets this prompt, with one of the 12 symptoms below as `${symptom}`:

> You are on the support-desk Genkit app in this directory. Bug report: ${symptom}
> Find the root cause and fix it in the app's source. Then write `answer.json` in the project root: { "file": "<path of the file that had the bug>", "snippet": "<the exact broken text you replaced, copied verbatim, one line is enough>", "cause": "<one sentence>", "evidence": "<what shows this is the cause>" }. Don't change `package.json` or add dependencies.

The symptom never names Genkit tooling. The seeded diff is not in the agent's view, and the agent never sees the checks. Pass is all three:

- `names the cause`: `answer.json` points at the right file.
- `flow works`: a `node:test` file is placed into the sandbox after the agent's turn and calls the broken flow against real Gemini.
- `keeps the flow`: the fix did not delete or stub the flow.

## Arms

| Arm | The agent gets |
|---|---|
| `control` | The app, `genkit-cli` 1.44.1 on `PATH`, and a warmed docs cache. No advice. |
| `rules` | `control` plus `GENKIT.md` as the project rules (`CLAUDE.md`, `AGENTS.md` or `.cursor/rules`, by harness). |
| `mcp` | `rules` plus the `genkit mcp` stdio server. This is what `genkit init:ai-tools` installs. |
| `skill` | `control` plus the `developing-genkit-js` skill, pinned to one commit. |

The server is never measured without the rules, because `GENKIT.md` is what tells the agent the server exists. `rules` alone is not a configuration Genkit ships; it is there to separate the text from the server. Pins and their sources are in `FINDINGS.md`.

## The 12 bugs

Each bug swaps one healthy snippet for one broken one in one file: six in the flows API, six in the agents API. `evals/bugs.ts` is the source of truth.

| Bug | File | What is wrong | What a trace or run shows |
|---|---|---|---|
| `schema-drift` | `src/flows.ts` | `tags` schema is a string, not a list | the structured output has `tags: "a, b"` |
| `prompt-var-typo` | `prompts/greet.prompt` | `{{custmerName}}` | the rendered prompt has an empty name |
| `prompt-model-override` | `prompts/greet.prompt` | front matter pins `googleai/gemini-1.5-flash` | the `greet` generate span fails; its request names a model the app never configured |
| `order-id-case` | `src/tools.ts` | `lookupOrder` no longer trims and upper-cases the id | tool input `a-1001`, output `null` |
| `tool-requests-returned` | `src/flows.ts` | `returnToolRequests: true` on `orderStatus` | the generate span ends on a `toolRequest` part; no tool span; empty text |
| `stop-sequence` | `src/flows.ts` | `stopSequences: ['\n']` on `draftReply` | `finishReason: 'stop'` after one line; the request config carries the stop sequence |
| `delegation-dropped` | `src/agents.ts` | `agents()` lists only `orderAgent` | no `delegate_to_refundAgent` tool in the request |
| `session-not-loaded` | `src/agents.ts` | `triage` has no `store` | `loadChat` throws: a persistent store is required |
| `tool-choice-required` | `src/agents.ts` | `toolChoice: 'required'` on `refundAgent` | every request carries `toolChoice: 'required'`; after the decline, tool calls until `maxTurns`, then `AgentError` `ABORTED` |
| `max-delegations-zero` | `src/agents.ts` | `maxDelegations: 0` on `triage` | the `delegate_to_*` tool answers "Delegation limit reached (0)"; no sub-agent span |
| `max-turns-zero` | `src/agents.ts` | `maxTurns: 0` on `triage` | `send` throws `AgentError` `ABORTED` on the first delegation |
| `tool-output-drift` | `src/orders.json` | A-1001 `total` is a string | `lookupOrder` fails schema validation; triage reports an agent error |

`tryTriage` and `tryRefundDesk` wrap one agent turn in a flow because `run_flow` and `genkit flow:run` cannot reach `/agent/` actions. The checks call the agents in-process.

## Build tasks

Genkit's agents API is newer than the models' training data. `ai.chat()` is gone. `ai.defineAgent`, `ai.defineInterrupt`, `FileSessionStore`, `loadChat` and `agents()` delegation from `@genkit-ai/middleware` 0.10.0 replace it. An agent that writes from memory writes the old API. In smoke runs, Claude Code fixed every bug in every arm, so the bugs separate the arms on effort, not on pass rate. This family asks the agent to build agents instead. Tooling that carries the current API should show here in pass rate.

The app starts without the feature. The prompt names the export, the call shape the check uses and, for the refund desk, the approval step's name and schemas. It never names Genkit or its tooling. `evals/tasks.ts` is the source of truth; it derives each start state from the healthy `src/agents.ts`.

| Task | Start state | What the check drives |
|---|---|---|
| `build-order-desk` | no `src/agents.ts`; `src/index.ts` exports the flows only | `orderAgent.chat().send('Where is order A-1001?')`; the reply has A-1001's status, ETA or tracking code |
| `build-refund-desk` | no `src/agents.ts`; `src/index.ts` exports the flows only | `refundAgent` interrupts on `approveRefund`; a decline issues no refund and ends with `finishReason: 'stop'`; an approval issues one refund for A-1001 |
| `build-triage` | `src/agents.ts` has `orderAgent` and `refundAgent` only, without the `agents()` import | `triage` hands a refund request to a tool named for the refund desk (`delegate_to_refundAgent` with the middleware); `triage.loadChat({ sessionId })` continues a conversation and the second turn knows the order |

Pass is all three checks: `typechecks` (`tsc --noEmit` in the sandbox), `agent works` (a hidden `node:test` file, `evals/verify-build.mts`, against real Gemini) and `keeps the flows` (the five flows are still exported from `src/index.ts`). One judge asks whether the agent used the agents API rather than hand-rolled `ai.generate` loops. One pairwise question asks which arm's `src/agents.ts` is more idiomatic. Both are recorded, never counted toward pass.

## What the smokes showed

Nine recorded runs, one attempt per cell, on Claude Code (Sonnet 5 and Haiku 5.5) and Antigravity. Each line names its run in `evals/.history/`; `FINDINGS.md` has the evidence.

- **Every documentation search failed**, through the MCP server and through the CLI. `search_genkit_docs` and `genkit docs:search` both die on an object-valued `description` in the docs bundle. Agents fell back to grepping `node_modules`. (`…_8wte`, `…_ffh4`, `…_25bx`)
- **The one docs tool that works changed the code an agent wrote.** The `mcp` arm on Sonnet read `js/agents/multi-agent.md` with `read_genkit_docs` and built delegation with the `agents()` middleware; on Haiku, three of four arms hand-rolled it after grepping `@genkit-ai/ai` for "handoff" and finding nothing. (`…_ffh4`, `…_w1kj`)
- **Claude Code hides the Genkit tools behind its tool search.** 22 deferred tools; the model sees names until it calls `ToolSearch`. Sonnet did so in 2 of 9 `mcp` attempts, Haiku in none. Antigravity, which does not defer, used the server on 1 bug of 12. (`…_pcyg`, `…_sgps`)
- **`restart_runtime` took the server down for the rest of the attempt**, with `invalid character '>' looking for beginning of value` on the next call. (`…_sgps`)
- **The bugs do not separate the arms on pass rate**: every arm fixed every bug it was given. They separate on effort and on whether the agent ran the app. The `rules` arm read source and skipped the repro at 0.42x the tokens; `control`, `mcp` and `skill` ran it. (`…_bcx7`)
- **The build task separates on idiom**: all four Haiku arms built a working front desk, one did it the Genkit way. (`…_w1kj`)

Two things we knew before any run. The two advice channels disagree about running the CLI. `GENKIT.md` tells the agent not to run `genkit` commands and to use the `start_runtime` MCP tool. The skill tells it to run `genkit flow:run` and `genkit trace:get`.

`GENKIT.md`, "Important Guidelines":

> Do not run Genkit commands (e.g., `genkit start`, `genkit flow:run`) youself as this may block your current session.

The skill, `references/docs-and-cli.md`:

> Do **not** use `genkit start` as a blocking step in automated/non-interactive contexts; use `flow:run` (below) for that.

So the `rules` arm is told to use a tool it does not have and not to run the CLI it does have. `GENKIT.md` is vendored byte for byte from `genkit-cli` 1.44.1; its title says v1.20.0 because the CLI never bumped it. More in `FINDINGS.md`.

## Scale and what reeval reports

15 cases (12 bugs and 3 build tasks) x 4 arms x 5 agents (Claude Code on Sonnet 5 and on Haiku 5.5, Antigravity, Cursor, Codex) x 5 attempts = 1500 attempts. Haiku is there because tooling should matter most to the agent that cannot hold the whole app in its head. reeval reports:

- One pooled lift in pass rate over `control` per family and arm, paired by case, with a 95% interval.
- Tokens, agent time and tool calls as ratios to `control`, with Mann-Whitney verdicts.
- Adoption of the MCP tools and the CLI, read from the transcript.
- Three LLM judges (was the diagnosis evidence-based; does the final message describe the change; did the build use the agents API), recorded but never counted toward pass.

Cost: reeval estimates about 9.5 hours at concurrency 8. Expect hundreds of millions of input tokens across four vendors, mostly cached. The `full` profile carries a `budget` cap, so a run that plans more than it allows is refused before it starts.

## Results

The full run has not happened yet. Each cell holds `rules / mcp / skill`. `x` is the arm's median over the `control` median.

| Harness | Fix rate (control / rules / mcp / skill) | Build rate (control / rules / mcp / skill) | Tokens x | Time x | Tools x | Adoption |
|---|---|---|---|---|---|---|
| claude-code (sonnet 5) |  |  |  |  |  |  |
| claude-code (haiku 5.5) |  |  |  |  |  |  |
| antigravity |  |  |  |  |  |  |
| cursor |  |  |  |  |  |  |
| codex |  |  |  |  |  |  |

## Reading a run

This is what reeval leaves behind, and what the findings above cite. A recorded run is a directory under `evals/.history/`:

```text
evals/.history/<run>.json                 the record: plan, cells, checks, judgements, tokens
evals/.history/<run>/summary.md           the run as Markdown, with every attempt's last message
evals/.history/<run>/<eval>/<cell>/1/
  transcript.jsonl                        every tool call and reasoning block, timed
  diff.patch                              what the agent changed
  checks/<n>.log                          each hidden check: command, exit code, output
  judge-input.json                        exactly what the judge saw
```

```bash
pnpm reeval show <run>                    # the summary in the terminal
pnpm reeval query lift                    # per case, with a 95% interval; `effort`, `check_discrimination`, `judgements` likewise
pnpm reeval query "SELECT tool, COUNT(*) FROM tool_calls WHERE run_id = '<run>' GROUP BY tool"
pnpm reeval studio build --out site       # a static site over every run
```

API keys never enter the sandbox: the app and the agent see placeholders, and reeval's gateway swaps the real key into requests to the one host each key is for. The records are redacted before they are written.

## Run it

```bash
pnpm install
cp env.example .env.local
pnpm reeval doctor
pnpm reeval image build
pnpm oracle
pnpm canary
pnpm reeval run --profile smoke
pnpm reeval run --profile full claude-code:claude-sonnet-5
pnpm reeval record <run>                  # copy a scratch run into evals/.history/ to commit it
```

`pnpm oracle` swaps the agent for a fake one that applies the known fix or writes the healthy agents; it must pass 15/15. `pnpm canary` leaves the bug or the start state in place; it must fail 15/15. `RUNBOOK.md` has the full sequence, sizes and queries. `FINDINGS.md` lists what building the study taught us about the tooling.
