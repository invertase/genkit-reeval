# Genkit agent-experience eval

Can a coding agent diagnose and fix a broken Genkit app faster and cheaper with Genkit's agent tooling than without it? This repo measures that with [reeval](https://github.com/invertase/reeval). Each run seeds one bug into a small support-desk app, gives an agent the same bug report, and checks whether the app works afterwards.

## The three arms

Same prompt, same checks, same sandbox. `genkit-cli` 1.44.1 is on `PATH` in every arm.

| Arm | What the agent gets |
|---|---|
| `control` | The app and the `genkit` CLI. No rules, no skill, no MCP server. |
| `mcp` | `GENKIT.md` as the project rules (`CLAUDE.md` or `AGENTS.md`) and the `genkit mcp` stdio server (`mcp__genkit__*` tools). This mirrors what `genkit init:ai-tools` installs: the same text, written straight to the rules file, plus `--project-root` on the server. |
| `cli` | The `developing-genkit-js` skill from `genkit-ai/skills`, pinned to a commit. No rules, no MCP server. |

`evals/genkit/PINS.md` lists every pin and where it came from.

## The six flow bugs

| Bug | A trace shows |
|---|---|
| `schema-drift` | The prompt asks for `P0/P1/P2`, the schema allows `low/medium/high`: the raw model output next to "Schema validation failed". |
| `tool-not-wired` | `getOrderStatus` exists but is not in `generate({ tools })`: no tool span. |
| `prompt-var-typo` | `{{custmerName}}` in `greet.prompt`: the rendered prompt has an empty name. |
| `truncated-output` | `maxOutputTokens: 24` on `draftReply`: `finishReason: 'length'`. |
| `history-dropped` | `chat` sends only the new message: a one-message model request. |
| `order-id-case` | `getOrderStatus` no longer normalises the id: the tool span's input is `a-1001` and its output is `null`, so the model says the order does not exist. |

The bug report never names the tooling. The agent chooses how to investigate.

## Agents API

The same question on Genkit's agents API (`genkit/beta`): `ai.defineAgent`, an `approveRefund` interrupt, session stores and `agents()` delegation from `@genkit-ai/middleware`. A `triage` agent delegates to `orderAgent` and `refundAgent`. Two wrapper flows, `supportTurn` (runs `triage`) and `refundTurn` (runs `refundAgent`), make the agents reachable, because `run_flow` and `flow:run` cannot address `/agent/` actions. Same arms, same prompt, same three checks. `evals/agents.eval.ts` holds six more bugs, so the full study is 12 bugs x 3 arms x 4 harnesses = 144 cells. Both studies come from one factory, `evals/study.ts`, and are tagged `flows` and `agents`.

| Bug | The trace or run output shows |
|---|---|
| `delegation-dropped` | `agents()` lists only `orderAgent`: there is no `delegate_to_refundAgent` tool, so triage answers a refund request itself. |
| `approval-ignored` | The resume builds the interrupt answer as `{ approved: true }`: the `approveRefund` tool response says `approved: true` while the human sent `approved: false`, and `issueRefund` runs. |
| `session-not-loaded` | The flow starts a new chat on every call: the second turn gets a fresh `sessionId` and its model request has no earlier messages. |
| `max-turns` | `maxTurns: 1` on `refundAgent`: the run ends with `finishReason: 'failed'` and an `ABORTED` "Exceeded maximum tool call iterations" error before the interrupt. |
| `tool-choice-none` | `toolChoice: 'none'` on `triage`: the model request still lists the delegate tools but carries `toolChoice: 'none'`, so `toolCalls` is empty. |
| `tool-output-drift` | The warehouse export has A-1001's `total` as `"149.99"`: the `lookupOrder` span fails "Schema validation failed ... total: must be number", `orderAgent` fails, and triage gets "Error calling agent 'orderAgent'". |

## Sharp edges to watch

These come from building the agents study against `genkit` 1.42. They are also things the Genkit team may want to hear about. The results below show which of them cost the arms time.

- `run_flow`, `list_flows` and `flow:run` address `/flow/<name>` only. An agent is `/agent/<name>`, so the `mcp` arm cannot run one directly. Every agent is wrapped in a flow here.
- An interrupt's tool span is recorded as an error (`status.code: 2`, `isFailureSource: true`, empty message) while the agent's `finishReason` is `interrupted`. In a trace, a healthy interrupt looks like a failure.
- `genkit trace:get <id> --format json` truncates at 64 KB when piped. Agent turns produce large traces.
- Exceeding `maxTurns` throws `AgentError ABORTED` from `chat.send`, but on the wire it is `finishReason: 'failed'` plus `error`. The two names for one condition make `max-turns` hard to search for.
- The legacy multi-agent docs page teaches prompts-as-tools. Those only render the sub-prompt and never run the sub-agent.
- The docs still describe `ai.chat()`. The API is gone in 1.42; `ai.defineAgent` replaced it.
- Delegation needs a separate package, `@genkit-ai/middleware`, and a `genkit` peer of `^1.42.0`.
- `agent.chat({ sessionId })` without a `store` throws `FAILED_PRECONDITION`. `loadChat` does not restore `interrupts`, so the flow rebuilds the response from the stored messages. `flow:run ... -- <cmd>` starts a fresh process per call, so a session that spans two CLI calls needs `FileSessionStore`.

## What is measured

- **Pass.** Three labelled soft checks per attempt, and an attempt passes only when all three pass: `names the cause` (`answer.json` gives the bug's `file` and quotes the broken `snippet` the agent replaced; its free-text `cause` is kept for the reader, not checked), `flow works` (a hidden verify script, placed after the turn, runs the flow and asserts structure), and `keeps the flow` (the fix did not delete the flow).
- **Fix rate.** The per-cell pass rate of the `flow works` check alone, read from the `cell_checks` table. It is not the attempt pass rate.
- **Lift.** Attempt pass rate (all three checks) of an arm minus `control`, with a 95% interval. An interval that spans 0 is within noise. Each study is one `evaluate.each` family, so reeval also pools one lift per arm, paired by bug.
- **Effort.** Tokens, agent time and tool calls per attempt, as ratios to `control`, with a Mann-Whitney verdict. reeval needs at least 4 attempts per side to give a verdict. Below that it says "too few attempts".
- **Adoption.** Read from the transcript, never assumed: tool calls named `mcp__genkit__*`, shell commands that contain `genkit`, and skill reads (the SQL is in `RUNBOOK.md`).

The comparison is a study, not a gate (`gate: 'none'`). Only the oracle config gates (`gate: 'all'`), so its exit code reports a broken eval.

## An advice conflict to watch

The `mcp` arm's rules and the `cli` arm's skill disagree about running the CLI.

- `GENKIT.md`: "ALWAYS provide the full, correct Genkit command as an instruction for the human user to run. Do not run Genkit commands (e.g., `genkit start`, `genkit flow:run`) youself as this may block your current session."
- The skill: "Do **not** use `genkit start` as a blocking step in automated/non-interactive contexts; use `flow:run` (below) for that." It adds `genkit trace:get <traceId> --format json`.

So one arm is told not to run `flow:run` and the other is told to. The results show which advice agents follow and what it costs. Full quotes are in `evals/genkit/PINS.md`.

## Results

Fill from `RUNBOOK.md` section (h), once per study (`--tag flows`, then `--tag agents`). `x` is the arm's median over `control`'s median. Fix rate is passes over counted attempts on the `flow works` check (`cell_checks`), for one run id.

Flows study, `mcp` arm:

| Harness | Fix rate (control / mcp) | Tokens x | Agent time x | Tool calls x | MCP adoption | CLI adoption |
|---|---|---|---|---|---|---|
| claude-code:claude-sonnet-5 |  |  |  |  |  |  |
| antigravity:gemini-3.8-flash-medium |  |  |  |  |  |  |
| cursor:composer-2.5 |  |  |  |  |  |  |
| codex:gpt-5.6-luna |  |  |  |  |  |  |

Flows study, `cli` arm:

| Harness | Fix rate (control / cli) | Tokens x | Agent time x | Tool calls x | Skill read | CLI adoption |
|---|---|---|---|---|---|---|
| claude-code:claude-sonnet-5 |  |  |  |  |  |  |
| antigravity:gemini-3.8-flash-medium |  |  |  |  |  |  |
| cursor:composer-2.5 |  |  |  |  |  |  |
| codex:gpt-5.6-luna |  |  |  |  |  |  |

Agents study, `mcp` arm:

| Harness | Fix rate (control / mcp) | Tokens x | Agent time x | Tool calls x | MCP adoption | CLI adoption |
|---|---|---|---|---|---|---|
| claude-code:claude-sonnet-5 |  |  |  |  |  |  |
| antigravity:gemini-3.8-flash-medium |  |  |  |  |  |  |
| cursor:composer-2.5 |  |  |  |  |  |  |
| codex:gpt-5.6-luna |  |  |  |  |  |  |

Agents study, `cli` arm:

| Harness | Fix rate (control / cli) | Tokens x | Agent time x | Tool calls x | Skill read | CLI adoption |
|---|---|---|---|---|---|---|
| claude-code:claude-sonnet-5 |  |  |  |  |  |  |
| antigravity:gemini-3.8-flash-medium |  |  |  |  |  |  |
| cursor:composer-2.5 |  |  |  |  |  |  |
| codex:gpt-5.6-luna |  |  |  |  |  |  |

## Reproduce

```bash
pnpm install
cp env.example .env.local        # add the keys
pnpm reeval doctor
pnpm oracle                                                         # must pass: 12/12, exit 0
pnpm canary                                                         # must fail: 0/12, exit non-zero
pnpm reeval run --profile smoke schema-drift                        # one cell, one harness
pnpm reeval run --profile full claude-code --record                 # 12 bugs x 3 arms x 5 attempts
pnpm reeval run --dry-run --tag agents                              # one study: --tag flows or --tag agents
```

`RUNBOOK.md` has the full sequence, what to check at each step, and the queries behind the table.
