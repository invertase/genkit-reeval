# Genkit agent tooling study

Does Genkit's agent tooling help a coding agent? We put real agents (Claude Code, Codex, Cursor, Antigravity) on Genkit work in Docker sandboxes and compare what they are given: nothing, `GENKIT.md` as project rules, the rules plus the `genkit mcp` server, and the `developing-genkit-js` skill. Smoke probes extend this to the docs site, Go and Python, the CLI, and the TSDoc in `node_modules`. Every run cited here is recorded in this repo with its transcripts. The full study run of 2375 attempts has not happened yet.

## Four things to act on

1. **One TSDoc pointer makes agents use `agents()` for hand-off.** Agents without a docs link read `.d.ts` files, not genkit.dev, and `AgentConfig` never mentions delegation. We added one pointer to the `AgentConfig` and beta `defineAgent` doc comments: "For agent hand-off, handoff, delegation, sub-agents, or routing between agents, add `agents()` from `@genkit-ai/middleware` to `use`." Over 12 attempts a side, stock against patched, Claude Code went from 2 to 12 (Haiku) and 4 to 11 (Sonnet) runs that used `agents()`. Sonnet's median tokens fell from 1.48M to 611k. Codex, Cursor and Antigravity already found `agents()` every time, and no model did worse. ([table in FINDINGS](FINDINGS.md#7-inline-docs-tsdoc-on-agents), [suite](evals/probes/inline-docs/))

2. **`GENKIT.md` makes the agent cheaper, not better.** It fixes every bug the control fixes, at under half the tokens, by reading source instead of running the app. Its root-cause evidence is weaker. If the goal is a cheaper fix, ship the rules. If the goal is an agent that verifies, the rules push the wrong way. ([Sonnet, one bug, four conditions](evals/.history/20261020T124201Z_7589241_jacob-cable_bcx7/summary.md))

3. **One docs page changes what the agent builds. Nothing today gets the agent to that page.** The arm that read `js/agents/multi-agent.md` used the `agents()` middleware; the rest grepped `node_modules` for "handoff" and hand-rolled delegation. `search_genkit_docs` and `genkit docs:search` both crash in 1.44.1 with `(doc.description || "").toLowerCase is not a function`, and `list_genkit_docs` is too large to read. Fix `searchDocs` and the server starts to pay for itself. ([Sonnet build](evals/.history/20261020T132814Z_c5f4f2b_jacob-cable_ffh4/summary.md), [Haiku build](evals/.history/20261020T135301Z_8d2bef2_jacob-cable_w1kj/summary.md), [search crash](evals/.history/20261020T130047Z_2a95bf1_jacob-cable_8wte/summary.md))

4. **The MCP server is installed but not used.** Claude Code hides its ten tools behind a tool search the model rarely runs, Antigravity used it on one bug in twelve, and `restart_runtime` kills it for the rest of the session with `invalid character '>' looking for beginning of value`. Meanwhile the rules forbid `genkit` commands and the skill prescribes them. Pick one story and make the server cheap to discover. ([probe](evals/.history/20261020T125134Z_7589241_jacob-cable_pcyg/summary.md), [Antigravity, 12 bugs](evals/.history/20261020T131412Z_2a95bf1_jacob-cable_sgps/summary.md))

Every linked run holds the transcripts. [`FINDINGS.md`](FINDINGS.md) has the evidence in full: conflicting advice between `GENKIT.md` and the skill, agents-API gaps, MCP server and CLI bugs with repro scripts in [`evals/repro/`](evals/repro/), and docs-site problems backed by [`DOCS-AUDIT.md`](DOCS-AUDIT.md) and [`LLMS-URLS.md`](LLMS-URLS.md).

## See it yourself

The recorded runs are in this repo, so this needs no API key and no Docker:

```bash
pnpm install
pnpm reeval studio --open                                  # the study, evals/.history/
pnpm reeval studio --config reeval.probes.config.ts --open # the probes, evals/probes/.history/
```

That opens reeval's studio over `evals/.history/`: every run, each cell's pass rate, lift and effort, the pairwise votes, and every attempt's transcript, diff, checks and judge input. `pnpm reeval show <run>` prints a run in the terminal; `pnpm reeval query lift` and friends answer SQL over all of them.

## How the study works

A real coding agent works in a Docker sandbox on a support-desk app that calls real Gemini. Five arms differ only in what the agent is told:

| Arm | The agent gets |
|---|---|
| `control` | The app, `genkit-cli` 1.44.1 on `PATH`, and a warmed docs cache. No advice. |
| `rules` | `control` plus `GENKIT.md` as the project rules (`CLAUDE.md`, `AGENTS.md` or `.cursor/rules`, by harness). |
| `mcp` | `rules` plus the `genkit mcp` stdio server. This is what `genkit init:ai-tools` installs. |
| `directed` | `mcp` with [`GENKIT-directed.md`](evals/rules/GENKIT-directed.md) as the rules instead of `GENKIT.md`: it names the MCP tools and the CLI commands the agent may run, and tells it to read the docs before it uses an unfamiliar API. It adds no Genkit API facts but bundles three instruction changes: it names the tools (discovery), permits running the CLI (`GENKIT.md` forbids it), and tells the agent to run the flow before and after a change (reproduce, then verify). A difference from `mcp` is the combined effect of the three, not of any one. |
| `skill` | `control` plus the `developing-genkit-js` skill, pinned to one commit. |

The server is never measured without the rules, because `GENKIT.md` is what tells the agent the server exists. `rules` alone is not a configuration Genkit ships; it is there to separate the text from the server.

Two families of cases, 19 in all. Twelve seeded bugs, six in the flows API and six in the agents API: the agent gets a bug report that never names Genkit tooling, must fix it and write `answer.json`. Seven build tasks: the app starts without a feature, and the agent must add an order desk, a refund desk with human approval, a front desk that delegates, order conversations a new process can resume, refund approvals answered in a later request, a refund receipt, or order lookups scoped to the signed-in customer. The agents API is newer than the models' training data, so the build tasks are where the tooling's knowledge should show.

Pass is deterministic. A hidden `node:test` file is placed into the sandbox after the agent's turn and drives the flow or agent against real Gemini; the agent never sees it. More checks guard against cheating: the answer names the right file and quotes the broken text, the flows survive, and `package.json` is untouched. LLM judges and one pairwise question per family are recorded, never counted toward pass. [`STUDY.md`](STUDY.md) has the prompts, the bug table and the build-task table.

The study itself is a few files, for anyone who wants to read what the agent is told and what counts as a pass:

| File | What it holds |
|---|---|
| [`evals/genkit.eval.ts`](evals/genkit.eval.ts) | The bug family: the prompt, the five arms, the checks, the evidence judge. |
| [`evals/build.eval.ts`](evals/build.eval.ts) | The build family: the prompt, the checks, the idiom judge, the pairwise question. |
| [`evals/bugs.ts`](evals/bugs.ts), [`evals/tasks.ts`](evals/tasks.ts) | The 12 seeded bugs and the 7 build tasks, with each symptom and the fix the oracle applies. |
| [`evals/environments.ts`](evals/environments.ts) | What each arm adds to `control`: the rules file, the MCP server, the skill. |
| [`evals/verify.mts`](evals/verify.mts), [`evals/verify-build.mts`](evals/verify-build.mts) | The hidden `node:test` files the agent never sees. |
| [`evals/rules/GENKIT.md`](evals/rules/GENKIT.md) | The rules file the `rules` and `mcp` arms get, pinned. |
| [`evals/rules/GENKIT-directed.md`](evals/rules/GENKIT-directed.md) | The rules file the `directed` arm gets: `GENKIT.md` plus the tool names, permission to run the CLI, and a reproduce-then-verify workflow. |
| [`evals/app/`](evals/app) | The fixture: the support-desk app. |
| [`reeval.config.ts`](reeval.config.ts) | The five agents, the Docker sandbox, the profiles. |

Scale: 19 cases x 5 arms x 5 agents (Claude Code on Sonnet 5 and on Haiku 5.5, Antigravity, Cursor, Codex) x 5 attempts = 2375 attempts, about 14.3 hours at concurrency 8. Haiku is there because tooling should matter most to the agent that cannot hold the whole app in its head.

## What reeval does here

- Runs real agents, Claude Code, Antigravity, Cursor and Codex, in Docker, one container per attempt, from one config.
- Reports one pooled lift in pass rate over `control` per family and arm, paired by case, with a 95% interval; tokens, agent time and tool calls as ratios with Mann-Whitney verdicts; adoption of the MCP tools and the CLI, read from the transcript.
- Keeps every API key on the host: the app and the agent see placeholders, and the gateway swaps the real key into requests to the one host each key is for. Records are redacted before they are written.
- Proves the checks before any agent runs: `pnpm oracle` applies the known fix and must pass 19/19, `pnpm canary` leaves the bug or writes a plausible wrong build and must fail 19/19.
- Records runs into `evals/.history/` as files you commit, and serves them in the studio or as a static site.

## Probes

[`evals/probes/`](evals/probes/) holds smoke probes outside the study, with their own configs (`reeval.probes.config.ts`), one attempt per cell unless a profile says otherwise:

| Suite | Question |
|---|---|
| [`docs`](evals/probes/docs/) | From an empty or seeded JS project, does the docs channel (open web, genkit.dev only, `llms.txt` first, a page index, or the hosted `GENKIT.js.md`) lead the agent to the current API? |
| [`agents`](evals/probes/agents/) | Can the agent build with the Go and Python agents APIs, with and without the language skill? |
| [`tooling`](evals/probes/tooling/) | CLI, MCP server and Dev UI plumbing on the fixture app: upgrades, `eval:flow`, two runtimes, a blocked genkit.dev. |
| [`inline-docs`](evals/probes/inline-docs/) | Does a TSDoc pointer in `node_modules` change what the agent builds? 12 attempts a side on all five agents. |

Findings are in [`FINDINGS.md`](FINDINGS.md) sections 6 and 7. The study results table fills from [`queries/`](queries/) after the full run; [`RUNBOOK.md`](RUNBOOK.md) says how.

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

[`RUNBOOK.md`](RUNBOOK.md) has the full sequence, sizes and queries. [`FINDINGS.md`](FINDINGS.md) lists what building and smoking the study taught us about the tooling. [`STUDY.md`](STUDY.md) has the design detail.
