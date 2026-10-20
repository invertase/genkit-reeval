# Genkit agent tooling study

Does Genkit's agent tooling (`GENKIT.md`, the `genkit mcp` server, the `developing-genkit-js` skill) help a coding agent fix a bug in a Genkit app?
Does it make the fix faster or cheaper, or neither?

The study has not run yet; this README will carry the results. It runs on [reeval](https://github.com/invertase/reeval), Invertase's eval runner for coding agents.

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

The server is never measured without the rules, because `GENKIT.md` is what tells the agent the server exists. `rules` alone is not a configuration Genkit ships; it is there to separate the text from the server. Pins and their sources are in `evals/rules/`.

## The 12 bugs

Each bug swaps one healthy snippet for one broken one in one file: six in the flows API, six in the agents API. `evals/bugs.ts` is the source of truth.

| Bug | File | What is wrong | What a trace or run shows |
|---|---|---|---|
| `schema-drift` | `src/flows.ts` | `tags` schema is a string, not a list | the structured output has `tags: "a, b"` |
| `tool-not-wired` | `src/flows.ts` | `getOrderStatus` not in `generate({ tools })` | no tool span |
| `prompt-var-typo` | `prompts/greet.prompt` | `{{custmerName}}` | the rendered prompt has an empty name |
| `truncated-output` | `src/flows.ts` | `maxOutputTokens: 24` on `draftReply` | `finishReason: 'length'` |
| `history-dropped` | `src/flows.ts` | `chat` sends `messages: []` | a one-message model request |
| `order-id-case` | `src/flows.ts` | the tool no longer upper-cases the id | tool input `a-1001`, output `null` |
| `delegation-dropped` | `src/agents.ts` | `agents()` lists only `orderAgent` | no `delegate_to_refundAgent` tool in the request |
| `approval-ignored` | `src/agents.ts` | the resume hardcodes `approved: true` | the tool response says approved while the human said no; `issueRefund` runs |
| `session-not-loaded` | `src/agents.ts` | `supportTurn` ignores `sessionId` | the second turn gets a new session and no history |
| `max-turns` | `src/agents.ts` | `maxTurns: 1` on `refundAgent` | `finishReason: 'failed'`, `ABORTED` before the interrupt |
| `tool-choice-none` | `src/agents.ts` | `toolChoice: 'none'` on `triage` | the request carries `toolChoice: 'none'`; no delegation |
| `tool-output-drift` | `src/orders.json` | A-1001 `total` is a string | `lookupOrder` fails schema validation; triage reports an agent error |

The agents are wrapped in flows (`supportTurn`, `refundTurn`) because `run_flow` and `genkit flow:run` cannot reach `/agent/` actions.

## What we already know

The two advice channels disagree about running the CLI. `GENKIT.md` tells the agent not to run `genkit` commands and to use the `start_runtime` MCP tool. The skill tells it to run `genkit flow:run` and `genkit trace:get`.

`GENKIT.md`, "Important Guidelines":

> Do not run Genkit commands (e.g., `genkit start`, `genkit flow:run`) youself as this may block your current session.

The skill, `references/docs-and-cli.md`:

> Do **not** use `genkit start` as a blocking step in automated/non-interactive contexts; use `flow:run` (below) for that.

So the `rules` arm is told to use a tool it does not have and not to run the CLI it does have. `GENKIT.md` is vendored byte for byte from `genkit-cli` 1.44.1; its title says v1.20.0 because the CLI never bumped it. More in `FINDINGS.md`.

## Scale and what reeval reports

12 bugs x 4 arms x 4 agents (Claude Code, Antigravity, Cursor, Codex) x 5 attempts = 960 attempts. reeval reports:

- One pooled lift in pass rate over `control` per arm, paired by bug, with a 95% interval.
- Tokens, agent time and tool calls as ratios to `control`, with Mann-Whitney verdicts.
- Adoption of the MCP tools and the CLI, read from the transcript.
- Two LLM judges (was the diagnosis evidence-based; does the final message describe the change), recorded but never counted toward pass.

Cost: reeval estimates about 6 hours at concurrency 8. Expect hundreds of millions of input tokens across four vendors, mostly cached. The `full` profile carries a `budget` cap, so a run that plans more than it allows is refused before it starts.

## Results

Not run yet. Each cell holds `rules / mcp / skill`. `x` is the arm's median over the `control` median.

| Harness | Fix rate (control / rules / mcp / skill) | Tokens x | Time x | Tools x | Adoption |
|---|---|---|---|---|---|
| claude-code |  |  |  |  |  |
| antigravity |  |  |  |  |  |
| cursor |  |  |  |  |  |
| codex |  |  |  |  |  |

## Run it

```bash
pnpm install
cp env.example .env.local
pnpm reeval doctor
pnpm reeval image build
pnpm oracle
pnpm canary
pnpm reeval run --profile smoke
pnpm reeval run --profile full claude-code
```

`pnpm oracle` swaps the agent for a fake one that applies the known fix; it must pass 12/12. `pnpm canary` leaves the bug in place; it must fail 12/12. `RUNBOOK.md` has the full sequence, sizes and queries. `FINDINGS.md` lists what building the study taught us about the tooling.
