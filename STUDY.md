# Study design

The detail behind the README: the task prompts, the 12 bugs, the 3 build tasks and the checks. `evals/bugs.ts` and `evals/tasks.ts` are the source of truth; this page restates them.

## The bug task

A real coding agent works in a Docker sandbox on a support-desk app that calls real Gemini. One bug is seeded before the first turn. The agent gets this prompt, with one of the 12 symptoms below as `${symptom}`:

> You are on the support-desk Genkit app in this directory. Bug report: ${symptom}
> Find the root cause and fix it in the app's source. Then write `answer.json` in the project root: { "file": "<path of the file that had the bug>", "snippet": "<the exact broken text you replaced, copied verbatim, one line is enough>", "cause": "<one sentence>", "evidence": "<what shows this is the cause>" }. Don't change `package.json` or add dependencies.

The symptom never names Genkit tooling. The seeded diff is not in the agent's view, and the agent never sees the checks. Pass is all five:

- `locates the file`: `answer.json` points at the right file.
- `names the cause`: the `snippet` in `answer.json`, with whitespace runs collapsed, occurs in the broken file and not in the healthy one, so it quotes the seeded change rather than a fragment both versions share.
- `flow works`: a `node:test` file (`evals/verify.mts`) is placed into the sandbox after the agent's turn and calls the broken flow against real Gemini.
- `keeps the flow`: the fix did not delete or stub the flow.
- `leaves package.json alone`: the turn's diff does not touch `package.json` or `package-lock.json`.

Two judges are recorded, never counted: did the diagnosis come from running the app rather than reading code, and does the final message describe the change. One pairwise question across arms asks whose `answer.json` evidence is observed rather than inferred.

## The 12 bugs

Each bug swaps one healthy snippet for one broken one in one file: six in the flows API, six in the agents API.

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

## The build tasks

Genkit's agents API is newer than the models' training data. `ai.chat()` is gone. `ai.defineAgent`, `ai.defineInterrupt`, `FileSessionStore`, `loadChat` and `agents()` delegation from `@genkit-ai/middleware` 0.10.0 replace it. An agent that writes from memory writes the old API. In smoke runs, Claude Code fixed every bug in every arm, so the bugs separate the arms on effort, not on pass rate. This family asks the agent to build agents instead. Tooling that carries the current API should show here in pass rate.

The app starts without the feature. The prompt names the export, the call shape the check uses and, for the refund desk, the approval step's name and schemas. It never names Genkit or its tooling. `evals/tasks.ts` derives each start state from the healthy `src/agents.ts`.

| Task | Start state | What the checks drive, one requirement each |
|---|---|---|
| `build-order-desk` | no `src/agents.ts`; `src/index.ts` exports the flows only | `shipped order`: A-1001's reply says shipped and gives NW-7F3K2Q; `processing order`: A-1002's says processing, gives 2026-10-25 and no tracking code; `unknown order`: A-9999's says it was not found and gives no real order's facts; `looks the order up`: the conversation has a `lookupOrder` call |
| `build-refund-desk` | no `src/agents.ts`; `src/index.ts` exports the flows only | `pauses for approval`: `refundAgent` interrupts on `approveRefund` with A-1001 and 149.99; `declined refunds nothing`: a decline issues no refund and ends with `finishReason: 'stop'`; `approved refunds the order total`: an approval issues one refund of 149.99 for A-1001 |
| `build-triage` | `src/agents.ts` has `orderAgent` and `refundAgent` only, without the `agents()` import | `delegates orders`: `triage` hands "Where is order A-1001?" to an order-desk tool (`delegate_to_orderAgent` with the middleware) that returns the order, never calls `lookupOrder` itself, and replies with the status, ETA or tracking code; `delegates refunds`: it hands the A-1001 refund to a refund-desk tool, which answers, and no refund is issued without approval; `resumes by session id`: `triage.loadChat({ sessionId })` continues a conversation and the second turn knows the order |

Pass is every check: `typechecks` (`tsc --noEmit` in the sandbox), one check per requirement in the table (a hidden `node:test` file, `evals/verify-build.mts`, against real Gemini, one `test` per requirement) `keeps the flows` (the five flows are still exported from `src/index.ts`) and `leaves package.json alone` (the turn's diff does not touch `package.json` or `package-lock.json`). One judge asks whether the agent used the agents API rather than hand-rolled `ai.generate` loops. One pairwise question asks which arm's `src/agents.ts` is more idiomatic. Both are recorded, never counted toward pass.

## Oracle and canary

Before any agent runs, two fake-agent runs prove the checks: `pnpm oracle` applies the known fix or writes the healthy agents and must pass 15/15; `pnpm canary` leaves the bug in place with a wrong answer, or writes a plausible wrong build (`cheat` in `evals/tasks.ts`: an order desk that always says shipped, a refund desk that refunds 1, a front desk with no store), and must fail 15/15. Both have run; the records are in `evals/.history/`.
