# Runbook

Run everything from the repo root. `pnpm reeval` is the pinned `reeval@0.18.0`. Order: keys, images, oracle, canary, smoke, full. Never run `full` before the first four pass.

## Sizes

19 cases x 5 arms (`control`, `rules`, `mcp`, `directed`, `skill`) x 5 harnesses = 475 cells. There are two families. `evals/genkit.eval.ts` is one `evaluate.each` over the 12 bugs. `evals/build.eval.ts` is one `evaluate.each` over the 7 build tasks. Each family gets one lift per arm, paired by case.

| Command | Cells | Attempts | reeval's estimate at concurrency 8 |
|---|---|---|---|
| `pnpm reeval run --dry-run` | 475 | 475 | 172 min |
| `... --profile smoke` | 95 | 95 | 31 min |
| `... --profile smoke schema-drift` | 5 | 5 | 3 min |
| `... --profile smoke build-triage` | 5 | 5 | 3 min |
| `... --profile full` | 475 | 2375 | 14.3 h |
| `... --profile full claude-code:claude-sonnet-5` | 95 | 475 | 153 min |
| `... --profile full claude-code:claude-haiku-5-5` | 95 | 475 | 64 min |
| `... codex:gpt-5.6-luna/mcp` | 19 | 19 | 7 min |
| `pnpm oracle`, `pnpm canary` | 19 | 19 | minutes (see below) |

The estimates are what `--dry-run` printed on 2026-10-21; they are no longer a flat 3 minutes per attempt and they change between runs. The `full` profile's budget allows 2500 attempts and 16 hours. `smoke` keeps one harness (`claude-code:claude-sonnet-5`) and one attempt per cell, `haiku` does the same on `claude-code:claude-haiku-5-5`; `full` runs 5 attempts per cell and records the run. Positional filters match an eval name (a bug) or a cell key (`<harness>/<arm>/<sandbox>`) and combine with OR, so `schema-drift codex` is wider than either alone. To run one case on one harness, pin the harness with a profile: `pnpm reeval run --profile haiku schema-drift`.

## Keys and images

```bash
cp env.example .env.local      # ANTHROPIC_API_KEY, CURSOR_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY
pnpm reeval doctor             # every line ✓
pnpm reeval image build        # four images from evals/Dockerfile: genkit-cli@1.44.1 and the fixture's node_modules
```

`GOOGLE_GENERATIVE_AI_API_KEY` serves the app in the sandbox (brokered as `SUPPORT_DESK_GEMINI_API_KEY`), the judge and `reeval analyze`. `GEMINI_API_KEY` is for the Antigravity harness.

Docker Desktop on this Mac sometimes drops an image tag reference: `docker images` lists the tag, `docker image inspect <tag>` says no such image, and every plan reports the image as not built. Re-tag it from its id with `docker tag <id> <repository:tag>` and re-run; no rebuild is needed.

## Oracle and canary

`reeval.oracle.config.ts` swaps the coding agent for a fake one and runs only the `control` arm on the real Docker sandbox. For a bug, the oracle applies the known fix and writes the right `answer.json`. For a build task, it writes the healthy `src/agents.ts`, `src/index.ts` and `src/tools.ts`. Every case must pass. The canary leaves the bug in place and writes a wrong answer for it, or writes the task's plausible wrong build (`cheat` in `evals/tasks.ts`, with the requirements it must fail). Every case must fail. Some tasks share a start state (`src/agents.ts` is absent at the start of both `build-order-desk` and `build-refund-desk`), so under `GENKIT_EVAL_GATE=all`, which only `reeval.oracle.config.ts` sets, `evals/build.eval.ts` writes the task name to `~/.task` for the oracle to read. A real agent's sandbox has no `~/.task`. `GENKIT_EVAL_GATE=all` gates these cells, so the oracle's exit code is its result.

The canary's reeval run exits 1 when its cells fail, which is what a good canary does. So `pnpm canary` then runs `evals/canary-check.ts` on the run it recorded, and that script's exit code is the result. It passes only when every cell failed, every build cell failed exactly its task's `cheat.fails` among the requirement checks, and every bug cell failed `locates the file`, `names the cause` and `flow works`. It prints one line per cell: `ok` or `BAD`, the outcome and the requirement checks that failed, with the reason under each `BAD` line. If reeval recorded no new canary run, it fails rather than read an old one. To re-judge a recorded run: `node_modules/.bin/tsx evals/canary-check.ts <run id>`.

```bash
pnpm oracle     # expect 19 passed, exit 0
pnpm canary     # reeval reports 19 failed, then expect "canary-check: all 19 cells failed as they must", exit 0
```

Each cell is a container that copies the baked `node_modules` in and makes a few Gemini calls, so allow a minute or two each at concurrency 8. The judge runs with `fakeJudge()` here: no key, no model call.

If the oracle fails a bug, the check is wrong, not the fix: read `failing_attempts`. One exception: a Gemini stream error such as `Error aggregating stream chunks` is the model, not the check; rerun that bug alone with `pnpm oracle <bug>`. reeval 0.9.0 has no retry for a check, so in a full run that noise lands on whichever attempt it hits, in every arm alike. If the canary passes a bug, the bug does not reproduce with the real model. Two are most at risk: `order-id-case` (Gemini may upper-case `a-1001` before calling the tool) and `stop-sequence` (if the model writes the whole reply on one line). Re-run `pnpm canary <bug>` three times; a stable pass means the cell measures nothing, so redesign the bug in `evals/bugs.ts` and `evals/verify.mts` or drop it (the pooled lift needs at least 6 cases).

## Probes

`evals/probes/` holds smoke probes outside the study. They have their own configs, so the study's plan does not change. There are three suites: `docs` (from an empty JS project, does the docs channel lead to the current API), `agents` (Go and Python) and `tooling` (CLI, MCP server and Dev UI plumbing on the fixture app). Each probe runs once per cell, and nothing is gated in a real run. The arms change from probe to probe. `docsite` limits only the fetches that the sandbox makes: Claude Code's WebSearch runs on Anthropic's API, so read the `web-searches` observation.

Each probe in `evals/probes/<suite>/cases.ts` has a correct solution (`oracle`) and a plausible wrong one (`cheat`, with the checks it must fail). Under `reeval.probes.oracle.config.ts` the eval places both solutions under `~/.probe`, and the fake agent applies one of them. A real agent's sandbox has no `~/.probe`.

```bash
pnpm probe:oracle                            # expect 18 passed
pnpm probe:canary                            # expect "canary-check: all 18 cells failed as they must"
pnpm probe --profile smoke                   # Claude Code Sonnet only: 58 cells
pnpm probe                                   # all five harnesses: 290 cells
pnpm probe evals/probes/docs/                # one suite, by path: a bare `docs` also matches `*-docsite` cells
pnpm -s tsx scripts/docs-audit.ts            # rewrites DOCS-AUDIT.md; no agent, no Docker
```

The Go and Python probes build `evals/probes/images/{go,python}.Dockerfile` the first time they run. Several hidden checks call real Gemini, so the oracle needs `GOOGLE_GENERATIVE_AI_API_KEY`. `pnpm -s tsx evals/probes/registry.ts`, `evals/probes/docs/checks.ts` and `evals/probes/tooling/gates.ts` are self-checks: each prints `OK` or a pass count.

## Smoke

```bash
pnpm reeval run --profile smoke schema-drift -v
pnpm reeval run --profile smoke session-not-loaded -v
pnpm reeval run --profile smoke build-triage -v
pnpm reeval run codex:gpt-5.6-luna/mcp -v
```

One case, five arms, one attempt each; then the `mcp` arm on Codex for all 19 cases. Check in the `-v` output and `.reeval/debug/<run>/`:

- `control`: setup copied `node_modules` in and ran the two `genkit` warm-up steps; the agent's diff shows only its fix (the bug is seeded before the first turn).
- `rules`: `CLAUDE.md` holds `GENKIT.md`; no server, no skill.
- `mcp`: the `genkit` server starts and the agent reaches `mcp__genkit__*` tools, directly or after `ToolSearch`. If it never sees a genkit tool, the arm measures `rules`: stop and find out why. `pnpm reeval query "SELECT tool, COUNT(*) FROM tool_calls WHERE run_id = '<run id>' AND (tool LIKE 'mcp__genkit__%' OR tool = 'ToolSearch') GROUP BY tool"`.
- `directed`: as `mcp`, but `CLAUDE.md` holds `GENKIT-directed.md`, which bundles three instruction changes: it names the tools, permits running the CLI, and asks the agent to run the flow before and after a change. Its lift over `mcp` is their combined effect. Check that the agent may now run `genkit flow:run`.
- `skill`: the skill is placed and read (`pnpm reeval query skill_reads`).
- Every arm: the real Gemini key appears nowhere under `.reeval/debug/<run>` or `.reeval/runs/<run>` (`grep -rl "$(grep GOOGLE_GENERATIVE_AI_API_KEY .env.local | cut -d= -f2)" .reeval/debug/<run> .reeval/runs/<run>` prints nothing), and the `gateway` lines in `debug.log` say `substituted` for `generativelanguage.googleapis.com`.
- Codex `mcp`: Codex may not pass the sandbox proxy to stdio MCP servers. If `run_flow` results show 401 or `fetch failed`, the server cannot reach Gemini; record it as a harness limitation.
- Every arm: no attempt reads the seeded change from reeval's snapshot git dir. reeval 0.9.0 left it readable in the workspace's parent, and Antigravity ran `git log -p` there on 6 of 12 bugs. reeval 0.18.0 keeps it in `/var/lib/reeval` (root, mode 700) as one commit with earlier content pruned. Check: `grep -rl /var/lib/reeval .reeval/runs/<run>/*/*/*/transcript.jsonl` prints nothing and `diff.patch` is still populated.
- Antigravity: the harness injects its own `GEMINI_API_KEY`, brokered only to its streaming endpoint; the app reads `SUPPORT_DESK_GEMINI_API_KEY`, so the harness key cannot shadow it. Check an Antigravity attempt starts and a flow run from the agent shell reaches Gemini.
- Agents bug: does the `mcp` arm call `run_flow` on `tryTriage`/`tryRefundDesk`? Does `get_trace` output fit, or is it truncated? Does the agent read the interrupt's error-looking span as the bug?
- Build task (`build-triage`): before the first turn `src/agents.ts` holds `orderAgent` and `refundAgent` only, and the agent's diff shows only what it wrote. Does it write `ai.chat()` or other API that is gone? Does the `mcp` or `skill` arm look up the agents API before it writes?
- `pnpm reeval query check_discrimination` lists `agent ran without provider errors`, `leaves package.json alone`, `locates the file`, `names the cause`, `flow works`, `keeps the flow` for the bugs and `agent ran without provider errors`, `leaves package.json alone`, `typechecks`, `verify ran`, one check per requirement (`evals/tasks.ts` `checks`), `keeps the flows` for the build tasks; `pnpm reeval query judgements` has two rows per bug attempt and one per build attempt.

Then the whole smoke profile: `pnpm reeval run --profile smoke` (95 attempts).

## Full

One harness at a time, so a rate limit or a crash costs one harness (475 attempts, one to three hours each). `claude-code` alone matches both Claude Code harnesses, so name the model:

```bash
pnpm reeval run --profile full claude-code:claude-sonnet-5
pnpm reeval run --profile full claude-code:claude-haiku-5-5
pnpm reeval run --profile full antigravity
pnpm reeval run --profile full cursor
pnpm reeval run --profile full codex
```

Default concurrency is 8, capped by Docker memory; every attempt runs a Genkit process, so add `--concurrency 4` on OOM kills (`SELECT harness, SUM(oom_kills) FROM failing_attempts GROUP BY harness`). `pnpm reeval run --resume` continues an interrupted run.

## Results

```bash
pnpm reeval query family_lift          # one pooled lift per family and arm, paired by case
pnpm reeval query lift                 # per case, with a 95% interval
pnpm reeval query effort               # tokens, agent time, tool calls as ratios, with verdicts
pnpm reeval query check_discrimination # which check tells the arms apart
pnpm reeval query judgements           # one row per judge call: question, score, verdict
pnpm reeval analyze --save             # one LLM call over the digest, citations checked
pnpm reeval studio build --out site    # static site with every transcript and diff (read before publishing)
```

Before reading any rate, find the attempts the provider stopped: the `agent ran without provider errors` check fails when the transcript holds a billing, quota or rate-limit error (the Haiku run of 2026-10-20 had 38 of these, all `Credit balance is too low`, recorded as `fail`). reeval 0.9.0 and 0.11.0 give an eval no way to mark them `infra_error`, so they still count as failures in `lift`:

```bash
pnpm reeval query -- "SELECT cell_key, attempt_key FROM assertions WHERE run_id = '<run id>' AND label = 'agent ran without provider errors' AND status = 'fail' ORDER BY 1, 2"
```

Runs recorded before this check existed have no such rows, so audit their transcripts instead: `grep -rl 'Credit balance is too low' evals/.history/<run id>/*/*/*/transcript.jsonl`.

If it prints anything, do not cite the run. Fix the cause, rerun the affected cases (`pnpm reeval run --profile full <harness> <case>...`), and cite the clean run; the stopped run stays in `evals/.history` as a record.

Pass is every check, which is what `lift` and `family_lift` pool. Fix rate is the `flow works` check alone; build rate is the share of attempts that pass every requirement check. The judges are recorded, never asserted; a failed attempt with a low verdict shows `error_kind = 'judge'` in `failing_attempts`, so read `first_failed_check` for the real cause.

The README tables come from the four queries in `queries/`. Each reads one run: find it with `SELECT run_id, profile, started_at, attempts FROM runs ORDER BY started_at DESC LIMIT 5`, then run a query with the id in place of `<run id>`:

```bash
pnpm reeval query "$(sed "s/<run id>/$RUN/g" queries/fix-rate.sql)"
```

| File | Fills | Note |
|---|---|---|
| `queries/fix-rate.sql` | fix rate and build rate per family, harness and arm | `cells.environment` is the bare arm name; `family` is the eval file |
| `queries/adoption.sql` | share of attempts that used the MCP tools or the CLI, per family | tool and target names differ by harness; the file says what to check first |
| `queries/effort.sql` | the `x` ratios, per family | mean of per-case ratios; per-case verdicts are in `effort` |
| `queries/judge.sql` | mean evidence score | swap the `LIKE` for the summary judge |

For a flows-vs-agents breakdown, add `e.name` (the bug) to a `SELECT` with `JOIN evals e ON e.run_id = c.run_id AND e.key = c.eval_key`, or read `lift` per bug. The 12 bugs and 7 build tasks are listed in `STUDY.md`; `evals/bugs.ts` and `evals/tasks.ts` are the sources of truth.
