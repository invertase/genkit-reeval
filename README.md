# Genkit agent tooling study

**Does Genkit's agent tooling help a coding agent?**

More and more Genkit code is written by coding agents, not by people reading the docs. Genkit ships tooling for those agents: `GENKIT.md` project rules, the `genkit mcp` server that `genkit init:ai-tools` installs, the `developing-genkit-js` skill, the genkit.dev docs and their `llms.txt`, and the TSDoc in `node_modules`.

The agents API makes that tooling matter. It is newer than the models' training data: `ai.chat()` is gone, and `ai.defineAgent`, `ai.defineInterrupt`, `FileSessionStore`, `loadChat` and `agents()` delegation replace it. An agent that writes from memory writes the old API. The tooling is what should carry the current one.

This study puts real agents (Claude Code, Codex, Cursor, Antigravity) on Genkit work in Docker sandboxes and asks:

1. **Do the rules, the MCP server or the skill help the agent fix and build?** The [study](#do-the-rules-the-mcp-server-or-the-skill-help): 12 seeded bugs and 7 build tasks, five arms.
2. **Does the docs channel lead the agent to the current API?** The [`docs` probe](#probes).
3. **Does a pointer in the TSDoc change what the agent builds?** The [`inline-docs` probe](#probes).
4. **Do the CLI and the MCP server work as agent tools?** The [`tooling` probe](#probes).
5. **Can the agent build with the Go and Python agents APIs?** The [`agents` probe](#probes).

Every run cited here is recorded in this repo with its transcripts. The full study run of 2375 attempts has not happened yet. The study runs on [reeval](https://github.com/invertase/reeval), an open-source eval runner for coding agents that Invertase maintains. [How this uses reeval](#how-this-uses-reeval) maps each feature to the code that uses it.

## See it yourself

The recorded runs are in this repo, so this needs no API key and no Docker:

```bash
pnpm install
pnpm reeval studio --open                                  # the study, evals/.history/
pnpm reeval studio --config reeval.probes.config.ts --open # the probes, evals/probes/.history/
```

That opens reeval's studio over `evals/.history/`: every run, each cell's pass rate, lift and effort, the pairwise votes, and every attempt's transcript, diff, checks and judge input. `pnpm reeval show <run>` prints a run in the terminal; `pnpm reeval query lift` and friends answer SQL over all of them.

## Do the rules, the MCP server or the skill help?

`evals/genkit.eval.ts`, `evals/build.eval.ts`

### Method

A real coding agent works in a Docker sandbox on a support-desk app that calls real Gemini. The app is only the fixture; the subject is the tooling. Five arms differ only in what the agent is told:

| Arm | The agent gets |
|---|---|
| `control` | The app, `genkit-cli` 1.44.1 on `PATH`, and a warmed docs cache. No advice. |
| `rules` | `control` plus `GENKIT.md` as the project rules (`CLAUDE.md`, `AGENTS.md` or `.cursor/rules`, by harness). |
| `mcp` | `rules` plus the `genkit mcp` stdio server. This is what `genkit init:ai-tools` installs. |
| `directed` | `mcp` with [`GENKIT-directed.md`](evals/rules/GENKIT-directed.md) as the rules instead of `GENKIT.md`: it names the MCP tools and the CLI commands the agent may run, and tells it to read the docs before it uses an unfamiliar API. |
| `skill` | `control` plus the `developing-genkit-js` skill, pinned to one commit. |

Terms: an *arm* is one of these conditions, a *cell* is one case in one arm on one agent, and *lift* is the change in pass rate over `control`.

Two families of cases, 19 in all:

- **12 seeded bugs**, six in the flows API and six in the agents API. The agent gets a bug report that never names Genkit tooling, must fix it and write `answer.json`.
- **7 build tasks.** The app starts without a feature, and the agent must add an order desk, a refund desk with human approval, a front desk that delegates, order conversations a new process can resume, refund approvals answered in a later request, a refund receipt, or order lookups scoped to the signed-in customer.

Pass is deterministic. A hidden `node:test` file is placed into the sandbox after the agent's turn and drives the flow or agent against real Gemini; the agent never sees it. More checks guard against cheating: the answer names the right file and quotes the broken text, the flows survive, and `package.json` is untouched. Each attempt runs in its own Docker container, and API keys stay on the host: the sandbox sees placeholders, and a gateway swaps the real key in for the one host it is for. Before any agent runs, a fake agent applies the known fix (`pnpm oracle`) and a plausible wrong one (`pnpm canary`) to show that each check passes and fails when it should. [`STUDY.md`](docs/STUDY.md) has the prompts, the bug table and the build-task table.

Scale: 19 cases x 5 arms x 5 agents (Claude Code on Sonnet 5 and on Haiku 5.5, Antigravity, Cursor, Codex) x 5 attempts = 2375 attempts, about 14.3 hours at concurrency 8.

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

### Findings

Findings 2, 3 and 4 in [Four things to act on](#four-things-to-act-on) come from smoke runs of this study. The results table fills from [`queries/`](queries) after the full run; [`RUNBOOK.md`](docs/RUNBOOK.md) says how.

## Probes

[`evals/probes/`](evals/probes) holds smoke probes outside the study, with their own configs (`reeval.probes.config.ts`), one attempt per cell unless a profile says otherwise:

| Suite | Question |
|---|---|
| [`docs`](evals/probes/docs) | From an empty or seeded JS project, does the docs channel (open web, genkit.dev only, `llms.txt` first, a page index, or the hosted `GENKIT.js.md`) lead the agent to the current API? |
| [`agents`](evals/probes/agents) | Can the agent build with the Go and Python agents APIs, with and without the language skill? |
| [`tooling`](evals/probes/tooling) | CLI, MCP server and Dev UI plumbing on the fixture app: upgrades, `eval:flow`, two runtimes, a blocked genkit.dev. |
| [`inline-docs`](evals/probes/inline-docs) | Does a TSDoc pointer in `node_modules` change what the agent builds? 12 attempts a side on all five agents. |

Finding 1 in [Four things to act on](#four-things-to-act-on) comes from `inline-docs`. The rest are in [`FINDINGS.md`](docs/FINDINGS.md) sections 6 and 7.

## Decisions

- **The tooling is the subject, not the app.** The support-desk app is a fixture. Every bug is in Genkit code, and every check measures what the agent did with Genkit.
- **The MCP server is never measured without the rules.** `GENKIT.md` is what tells the agent the server exists. `rules` alone is not a configuration Genkit ships; it is there to separate the text from the server.
- **`directed` bundles three changes.** It adds no Genkit API facts, but it names the tools (discovery), permits running the CLI (`GENKIT.md` forbids it), and tells the agent to run the flow before and after a change (reproduce, then verify). A difference from `mcp` is the combined effect of the three, not of any one.
- **Build tasks exist because bugs do not separate the arms on pass rate.** In smoke runs, Claude Code fixed every bug in every arm. The bugs separate the arms on effort; the build tasks need the current agents API, which is where the tooling's knowledge should show.
- **Haiku is in the agent set** because tooling should matter most to the agent that cannot hold the whole app in its head.
- **Judges are recorded, never counted.** LLM judges and one pairwise question per family are stored with each run. Pass is the deterministic checks only.
- **Checks are proven before any agent runs.** The oracle must pass every case and the canary must fail every case.

## How this uses reeval

To learn reeval from this repo, read the study files first, starting with [`evals/genkit.eval.ts`](evals/genkit.eval.ts). The probes are the more advanced, project-specific part.

| reeval feature | Where |
|---|---|
| `defineConfig` with the harnesses, a Docker sandbox and named profiles | [`reeval.config.ts:23`](reeval.config.ts#L23), harnesses [L9](reeval.config.ts#L9), sandbox [L6](reeval.config.ts#L6), profiles [L30](reeval.config.ts#L30) |
| `defineEnvironment` for the control arm | [`evals/environments.ts:10`](evals/environments.ts#L10) |
| `secret.fromEnv` with `hosts`: the key reaches only the Gemini API | [`evals/environments.ts:13`](evals/environments.ts#L13) |
| `extendEnvironment` chain: `control` to `rules` to `mcp` to `directed` | [`evals/environments.ts:24`](evals/environments.ts#L24), [L29](evals/environments.ts#L29), [L40](evals/environments.ts#L40) |
| `mcp.stdio` for the `genkit mcp` server | [`evals/environments.ts:31`](evals/environments.ts#L31) |
| `skill.git` for a skill pinned to a commit | [`evals/environments.ts:47`](evals/environments.ts#L47) |
| `evaluate.each` over a case list | [`evals/genkit.eval.ts:33`](evals/genkit.eval.ts#L33), [`evals/build.eval.ts:26`](evals/build.eval.ts#L26) |
| `compare: { baseline, variants, gate }` | [`evals/genkit.eval.ts:37`](evals/genkit.eval.ts#L37), [`evals/build.eval.ts:29`](evals/build.eval.ts#L29) |
| Pairwise `questions` with `across: 'environment'` | [`evals/genkit.eval.ts:43`](evals/genkit.eval.ts#L43), [`evals/build.eval.ts:34`](evals/build.eval.ts#L34) |
| `c.writeFile` to seed the workspace | [`evals/genkit.eval.ts:58`](evals/genkit.eval.ts#L58) |
| `c.send` for one agent turn | [`evals/genkit.eval.ts:61`](evals/genkit.eval.ts#L61) |
| `expect(c).not.toHaveChanged` | [`evals/genkit.eval.ts:65`](evals/genkit.eval.ts#L65) |
| `expect(c.exec(...)).toSucceed()` for a hidden test | [`evals/genkit.eval.ts:73`](evals/genkit.eval.ts#L73) |
| `c.judge` with `on` and its inputs (`transcript`, `diff`), recorded but not asserted | [`evals/genkit.eval.ts:79`](evals/genkit.eval.ts#L79) |
| Oracle and canary: `fakeHarness` applies the fix or a cheat, `fakeJudge` needs no key | [`reeval.oracle.config.ts:23`](reeval.oracle.config.ts#L23), [L34](reeval.oracle.config.ts#L34), [L38](reeval.oracle.config.ts#L38) |
| Egress policies built on `DEFAULT_EGRESS_ALLOW` | [`evals/probes/environments.ts:4`](evals/probes/environments.ts#L4), [L40](evals/probes/environments.ts#L40) |
| `c.serve` to start a server before the agent | [`evals/probes/tooling/tooling.eval.ts:117`](evals/probes/tooling/tooling.eval.ts#L117) |
| `c.observe` for recorded values that are not checks | [`evals/probes/tooling/tooling.eval.ts:54`](evals/probes/tooling/tooling.eval.ts#L54) |
| `ExecRetry` for a check that calls a flaky provider | [`evals/probes/tooling/tooling.eval.ts:32`](evals/probes/tooling/tooling.eval.ts#L32) |
| `reeval studio`, `reeval show` and `reeval query` over the recorded runs | [See it yourself](#see-it-yourself) |

## Run it yourself

Needs Docker and keys for the agents and for Gemini. The sandbox images are not published: `pnpm reeval image build` builds them from [`evals/Dockerfile`](evals/Dockerfile) and [`evals/probes/images/`](evals/probes/images), with the Genkit packages pinned as [`FINDINGS.md`](docs/FINDINGS.md) section 5 lists.

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

[`RUNBOOK.md`](docs/RUNBOOK.md) has the full sequence, sizes and queries. [`FINDINGS.md`](docs/FINDINGS.md) lists what building and smoking the study taught us about the tooling. [`STUDY.md`](docs/STUDY.md) has the design detail.

## Four things to act on

1. **One TSDoc pointer makes agents use `agents()` for hand-off.** Agents without a docs link read `.d.ts` files, not genkit.dev, and `AgentConfig` never mentions delegation. We added one pointer to the `AgentConfig` and beta `defineAgent` doc comments: "For agent hand-off, handoff, delegation, sub-agents, or routing between agents, add `agents()` from `@genkit-ai/middleware` to `use`." Over 12 attempts a side, stock against patched, Claude Code went from 2 to 12 (Haiku) and 4 to 11 (Sonnet) runs that used `agents()`. Sonnet's median tokens fell from 1.48M to 611k. Codex, Cursor and Antigravity already found `agents()` every time, and no model passed fewer runs overall. ([table in FINDINGS](docs/FINDINGS.md#7-inline-docs-tsdoc-on-agents), [suite](evals/probes/inline-docs))

2. **`GENKIT.md` made the agent cheaper, not better.** On one bug, with one attempt per arm, the `rules` arm fixed it as the control did, at under half the tokens, by reading source instead of running the app. Its root-cause evidence was weaker. This is direction only; the full run will measure it. If it holds, the rules buy a cheaper fix but steer the agent away from verifying it. ([Sonnet, one bug, four conditions](evals/.history/20261020T124201Z_7589241_jacob-cable_bcx7/summary.md))

3. **One docs page changes what the agent builds, and search cannot find it.** In the Sonnet build, the `mcp` arm read `js/agents/multi-agent.md` through `read_genkit_docs` and used the `agents()` middleware; the other arms grepped `node_modules` for "handoff" and hand-rolled delegation. `search_genkit_docs` and `genkit docs:search` both crash in 1.44.1 with `(doc.description || "").toLowerCase is not a function`, and `list_genkit_docs` is too large to read, so an agent reaches the page only if it guesses the path. A working `searchDocs` would make it findable. ([Sonnet build](evals/.history/20261020T132814Z_c5f4f2b_jacob-cable_ffh4/summary.md), [search crash](evals/.history/20261020T130047Z_2a95bf1_jacob-cable_8wte/summary.md))

4. **The MCP server is installed but not used.** Claude Code hides its ten tools behind a tool search the model rarely runs, Antigravity used it on one bug in twelve, and `restart_runtime` kills it for the rest of the session with `invalid character '>' looking for beginning of value`. Meanwhile the rules forbid `genkit` commands and the skill prescribes them. Aligning the rules and the skill on the CLI, and making the server's tools easier to discover, would address both. ([probe](evals/.history/20261020T125134Z_7589241_jacob-cable_pcyg/summary.md), [Antigravity, 12 bugs](evals/.history/20261020T131412Z_2a95bf1_jacob-cable_sgps/summary.md))

Every linked run holds the transcripts. [`FINDINGS.md`](docs/FINDINGS.md) has the evidence in full: conflicting advice between `GENKIT.md` and the skill, agents-API gaps, MCP server and CLI bugs with repro scripts in [`evals/repro/`](evals/repro), and docs-site problems backed by [`DOCS-AUDIT.md`](docs/DOCS-AUDIT.md) and [`LLMS-URLS.md`](docs/LLMS-URLS.md).
