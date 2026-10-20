# Genkit agent tooling study

Does Genkit's agent tooling help a coding agent? `GENKIT.md`, the `genkit mcp` server and the `developing-genkit-js` skill each promise to make an agent fix a bug in a Genkit app, or build with the agents API, faster and cheaper. This study measures that with real agents, real Gemini and hidden checks, on [reeval](https://github.com/invertase/reeval), Invertase's eval runner for coding agents.

Status: ten smoke runs are recorded in this repo. The full run, 1500 attempts across five agents, has not happened yet. The smokes already say a lot about the tooling.

## What we found so far

One attempt per cell, on Claude Code (Sonnet 5 and Haiku 5.5) and Antigravity. Each item links to its run; every run holds the transcripts. `FINDINGS.md` has the evidence in full.

- **Every documentation search failed**, through the MCP server and through the CLI. `search_genkit_docs` and `genkit docs:search` both die with `(doc.description || "").toLowerCase is not a function`: the docs bundle gives some pages an object-valued `description`. Agents fell back to grepping `node_modules`. ([Sonnet, MCP](evals/.history/20261020T130047Z_2a95bf1_jacob-cable_8wte/summary.md), [Sonnet, CLI](evals/.history/20261020T123120Z_0fd8299_jacob-cable_25bx/summary.md))
- **The one docs tool that works changed the code an agent wrote.** The `mcp` arm on Sonnet read `js/agents/multi-agent.md` with `read_genkit_docs` and built delegation with the `agents()` middleware. On Haiku, three of four arms grepped `@genkit-ai/ai` for "handoff", found nothing, and hand-rolled it. ([Sonnet](evals/.history/20261020T132814Z_c5f4f2b_jacob-cable_ffh4/summary.md), [Haiku](evals/.history/20261020T135301Z_8d2bef2_jacob-cable_w1kj/summary.md))
- **Claude Code hides the Genkit tools behind its tool search.** 22 deferred tools; the model sees names until it calls `ToolSearch`. Sonnet did so in 2 of 9 `mcp` attempts, Haiku in none. Antigravity, which does not defer, used the server on 1 bug of 12. ([probe](evals/.history/20261020T125134Z_7589241_jacob-cable_pcyg/summary.md), [Antigravity](evals/.history/20261020T131412Z_2a95bf1_jacob-cable_sgps/summary.md))
- **`restart_runtime` took the server down for the rest of the attempt**, with `invalid character '>' looking for beginning of value` on the next call. ([Antigravity](evals/.history/20261020T131412Z_2a95bf1_jacob-cable_sgps/summary.md))
- **The bugs do not separate the arms on pass rate**: every arm fixed every bug it was given. They separate on effort and on whether the agent ran the app. The `rules` arm read source, skipped the repro and spent 0.42x the tokens; `control`, `mcp` and `skill` ran it. ([Sonnet](evals/.history/20261020T124201Z_7589241_jacob-cable_bcx7/summary.md))
- **The build task separates on idiom.** All four Haiku arms built a working front desk; one did it the Genkit way. ([Haiku](evals/.history/20261020T135301Z_8d2bef2_jacob-cable_w1kj/summary.md))

Two things we knew before any run: `GENKIT.md` tells the agent not to run `genkit` commands and to use the `start_runtime` MCP tool, while the skill tells it to run `genkit flow:run` and `genkit trace:get`; and `GENKIT.md` as the CLI writes it differs from the website copy. Quotes and pins are in `FINDINGS.md`.

## See it yourself

The recorded runs are in this repo, so this needs no API key and no Docker:

```bash
pnpm install
pnpm reeval studio --open
```

That opens reeval's studio over `evals/.history/`: every run, each cell's pass rate, lift and effort, the pairwise votes, and every attempt's transcript, diff, checks and judge input. `pnpm reeval show <run>` prints a run in the terminal; `pnpm reeval query lift` and friends answer SQL over all of them.

## How the study works

A real coding agent works in a Docker sandbox on a support-desk app that calls real Gemini. Four arms differ only in what the agent is told:

| Arm | The agent gets |
|---|---|
| `control` | The app, `genkit-cli` 1.44.1 on `PATH`, and a warmed docs cache. No advice. |
| `rules` | `control` plus `GENKIT.md` as the project rules (`CLAUDE.md`, `AGENTS.md` or `.cursor/rules`, by harness). |
| `mcp` | `rules` plus the `genkit mcp` stdio server. This is what `genkit init:ai-tools` installs. |
| `skill` | `control` plus the `developing-genkit-js` skill, pinned to one commit. |

The server is never measured without the rules, because `GENKIT.md` is what tells the agent the server exists. `rules` alone is not a configuration Genkit ships; it is there to separate the text from the server.

Two families of cases, 15 in all. Twelve seeded bugs, six in the flows API and six in the agents API: the agent gets a bug report that never names Genkit tooling, must fix it and write `answer.json`. Three build tasks: the app starts without an agent, and the agent must add an order desk, a refund desk with human approval, or a front desk that delegates and resumes sessions. The agents API is newer than the models' training data, so the build tasks are where the tooling's knowledge should show.

Pass is deterministic. A hidden `node:test` file is placed into the sandbox after the agent's turn and drives the flow or agent against real Gemini; the agent never sees it. Two more checks guard against cheating: the answer names the right file, and the flows survive. LLM judges and one pairwise question per family are recorded, never counted toward pass. `STUDY.md` has the prompts, the bug table and the build-task table.

The study itself is a few files, for anyone who wants to read what the agent is told and what counts as a pass:

| File | What it holds |
|---|---|
| `evals/genkit.eval.ts` | The bug family: the prompt, the four arms, the checks, the evidence judge. |
| `evals/build.eval.ts` | The build family: the prompt, the checks, the idiom judge, the pairwise question. |
| `evals/bugs.ts`, `evals/tasks.ts` | The 12 seeded bugs and the 3 build tasks, with each symptom and the fix the oracle applies. |
| `evals/environments.ts` | What each arm adds to `control`: the rules file, the MCP server, the skill. |
| `evals/verify.mts`, `evals/verify-build.mts` | The hidden `node:test` files the agent never sees. |
| `evals/rules/GENKIT.md` | The rules file the `rules` and `mcp` arms get, pinned. |
| `evals/app/` | The fixture: the support-desk app. |
| `reeval.config.ts` | The five agents, the Docker sandbox, the profiles. |

Scale: 15 cases x 4 arms x 5 agents (Claude Code on Sonnet 5 and on Haiku 5.5, Antigravity, Cursor, Codex) x 5 attempts = 1500 attempts, about 9.5 hours at concurrency 8. Haiku is there because tooling should matter most to the agent that cannot hold the whole app in its head.

## What reeval does here

- Runs real agents, Claude Code, Antigravity, Cursor and Codex, in Docker, one container per attempt, from one config.
- Reports one pooled lift in pass rate over `control` per family and arm, paired by case, with a 95% interval; tokens, agent time and tool calls as ratios with Mann-Whitney verdicts; adoption of the MCP tools and the CLI, read from the transcript.
- Keeps every API key on the host: the app and the agent see placeholders, and the gateway swaps the real key into requests to the one host each key is for. Records are redacted before they are written.
- Proves the checks before any agent runs: `pnpm oracle` applies the known fix and must pass 15/15, `pnpm canary` leaves the bug and must fail 15/15.
- Records runs into `evals/.history/` as files you commit, and serves them in the studio or as a static site.

## Results

The full run has not happened yet. Each cell holds `rules / mcp / skill`. `x` is the arm's median over the `control` median.

| Harness | Fix rate (control / rules / mcp / skill) | Build rate (control / rules / mcp / skill) | Tokens x | Time x | Tools x | Adoption |
|---|---|---|---|---|---|---|
| claude-code (sonnet 5) |  |  |  |  |  |  |
| claude-code (haiku 5.5) |  |  |  |  |  |  |
| antigravity |  |  |  |  |  |  |
| cursor |  |  |  |  |  |  |
| codex |  |  |  |  |  |  |

## Run it yourself

Needs Docker and keys for the agents and for Gemini.

```bash
cp env.example .env.local
pnpm reeval doctor
pnpm reeval image build
pnpm oracle
pnpm canary
pnpm reeval run --profile smoke
pnpm reeval run --profile full claude-code:claude-sonnet-5
pnpm reeval record <run>                  # copy a scratch run into evals/.history/ to commit it
```

`RUNBOOK.md` has the full sequence, sizes and queries. `FINDINGS.md` lists what building and smoking the study taught us about the tooling. `STUDY.md` has the design detail.
