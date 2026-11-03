# Pilot: 7 build cases on Antigravity, 2026-10-21

Run `20261021T180121Z_27922b1_jacob-cable_a90v`: the 7 build cases, 5 arms, 1 attempt per cell, Antigravity `gemini-3.8-flash-medium`, 41 minutes at concurrency 8. The run was not recorded in this repo. One attempt per cell, so every number below is direction, not evidence; lift reports "can't tell yet".

Four of the seven cases are new today: `build-order-memory`, `build-refund-resume`, `build-refund-receipt`, `build-customer-scope`. All seven have one check per requirement, a canary that writes a plausible wrong build, and an oracle that passed 19/19 and a canary that failed exactly its declared checks in three runs each before this pilot.

## Outcome: 31 of 35 pass

| arm | pass | miss |
|---|---|---|
| control | 6/7 | `build-customer-scope`: `foreign order refused`. The agent's lookup threw for a foreign order and the reply was "There was a problem looking up your order. Please try again in a moment." instead of not found. |
| rules | 6/7 | `build-triage` timed out at 15 min |
| mcp | 6/7 | `build-triage` timed out |
| directed | 6/7 | `build-triage` timed out |
| skill | 7/7 | |

The three triage misses are the eval `timeout` (15m), not checks. Antigravity needs 11 to 15 minutes for triage: control finished in 688 s and skill in 729 s and both passed; the other three hit 900 s mid-turn. Raise the timeout to 25m for Antigravity before a full run or most triage attempts are lost.

The idiom judge passed every finished attempt at 0.98 or above and all 20 pairwise votes were ties. On Antigravity builds the judge does not separate arms.

## Adoption

The directed arm exists to ask whether explicit tool instructions change what the agent reaches for.

- Runtime MCP tools: zero calls in 35 attempts. No arm called `start_runtime`, `run_flow`, `list_flows` or `get_trace`.
- Docs MCP tools: `directed` used them in 5 of 7 tasks (11 calls); `mcp` in 3 of 7 (7 calls); no other arm has them. `search_genkit_docs` crashed on all 7 calls (`(doc.description || "").toLowerCase is not a function`, genkit-cli 1.44.1). `read_genkit_docs` failed 3 of 8 calls on the argument name (`filePath` sent, `filePaths` required) and succeeded on retry.
- Genkit CLI: only `skill` ran it: `npx genkit docs:read js/flows.md`, `docs:read js/tool-calling.md`, `flow:run tryRefundDesk`, `flow:run tryTriage`. `directed` is told it may run the CLI and never did.
- Source reading: every arm read Genkit source under `node_modules` far more than any supplied context. Dependency reads per arm: control 257, rules 260, mcp 297, directed 186, skill 196. Context reads (docs tools, skill files): 0 to 21.

## Effort

Averages per finished attempt, timeouts excluded (6 or 7 attempts per arm).

| arm | agent s | k tokens | tool calls |
|---|---|---|---|
| control | 495 | 383 | 74 |
| rules | 375 | 291 | 63 |
| mcp | 398 | 278 | 71 |
| directed | 388 | 259 | 59 |
| skill | 479 | 323 | 70 |

Rules, mcp and directed each cut agent time and tokens by roughly a fifth to a third against control. Skill did not.

## Takeaways

1. The new build cases run end to end and discriminate on behaviour: one real check failure in 31 finished attempts, and the refund-amount, receipt and session checks all held against real builds.
2. Antigravity reaches the MCP docs tools only when told to, and the docs search tool crashes every time it is reached.
3. No arm uses the runtime tools or the CLI to run the app, except the skill arm's two `flow:run` calls.
4. Guidance arms save time and tokens; at this sample they do not change pass rate.

## Open before a full run

- Set the eval timeout to 25m for Antigravity.
- Decide whether `build-customer-scope` should accept an error reply for a foreign order. The check requires not-found wording and no leaked facts; the control build leaked nothing but did not say not found.
- Run the Haiku and Antigravity full runs on the 19-case plan.
