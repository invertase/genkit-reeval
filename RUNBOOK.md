# Runbook

Run everything from the repo root. `pnpm reeval` is the pinned `reeval@0.9.0`. Order: keys, images, oracle, canary, smoke, full. Never run `full` before the first four pass.

## Sizes

15 cases x 4 arms (`control`, `rules`, `mcp`, `skill`) x 5 harnesses = 300 cells. There are two families. `evals/genkit.eval.ts` is one `evaluate.each` over the 12 bugs. `evals/build.eval.ts` is one `evaluate.each` over the 3 build tasks. Each family gets one lift per arm, paired by case.

| Command | Cells | Attempts | reeval's estimate at concurrency 8 |
|---|---|---|---|
| `pnpm reeval run --dry-run` | 300 | 300 | 113 min |
| `... --profile smoke` | 60 | 60 | 23 min |
| `... --profile smoke schema-drift` | 4 | 4 | 3 min |
| `... --profile smoke build-triage` | 4 | 4 | 3 min |
| `... --profile full` | 300 | 1500 | 9.5 h |
| `... --profile full claude-code:claude-sonnet-5` | 60 | 300 | 113 min |
| `... --profile full claude-code:claude-haiku-5-5` | 60 | 300 | 113 min |
| `... codex:gpt-5.6-luna/mcp` | 15 | 15 | 6 min |
| `pnpm oracle`, `pnpm canary` | 15 | 15 | minutes (see below) |

The estimate is a flat 3 minutes per attempt. The `full` profile's budget allows 1600 attempts and 12 hours. `smoke` keeps one harness (`claude-code:claude-sonnet-5`) and one attempt per cell; `full` runs 5 attempts per cell and records the run. Positional filters match an eval name (a bug) or a cell key (`<harness>/<arm>/<sandbox>`) and combine with OR, so `schema-drift codex` is wider than either alone.

## Keys and images

```bash
cp env.example .env.local      # ANTHROPIC_API_KEY, CURSOR_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY
pnpm reeval doctor             # every line ✓
pnpm reeval image build        # four images from evals/Dockerfile: genkit-cli@1.44.1 and the fixture's node_modules
```

`GOOGLE_GENERATIVE_AI_API_KEY` serves the app in the sandbox (brokered as `GEMINI_API_KEY`), the judge and `reeval analyze`. `GEMINI_API_KEY` is for the Antigravity harness.

Docker Desktop on this Mac sometimes drops an image tag reference: `docker images` lists the tag, `docker image inspect <tag>` says no such image, and every plan reports the image as not built. Re-tag it from its id with `docker tag <id> <repository:tag>` and re-run; no rebuild is needed.

## Oracle and canary

`reeval.oracle.config.ts` swaps the coding agent for a fake one and runs only the `control` arm on the real Docker sandbox. For a bug, the oracle applies the known fix and writes the right `answer.json`. For a build task, it writes the healthy `src/agents.ts` and `src/index.ts`. Every case must pass. The canary leaves the bug or the build start state in place and writes a wrong answer for a bug. Every case must fail. `GENKIT_EVAL_GATE=all` gates these cells, so the exit code is the result.

```bash
pnpm oracle     # expect 15 passed, exit 0
pnpm canary     # expect 15 failed, non-zero exit
```

Each cell is a container that copies the baked `node_modules` in and makes a few Gemini calls, so allow a minute or two each at concurrency 8. The judge runs with `fakeJudge()` here: no key, no model call.

If the oracle fails a bug, the check is wrong, not the fix: read `failing_attempts`. One exception: a Gemini stream error such as `Error aggregating stream chunks` is the model, not the check; the checks retry it once, and if it still shows, rerun that bug alone with `pnpm oracle <bug>`. If the canary passes a bug, the bug does not reproduce with the real model. Two are most at risk: `order-id-case` (Gemini may upper-case `a-1001` before calling the tool) and `stop-sequence` (if the model writes the whole reply on one line). Re-run `pnpm canary <bug>` three times; a stable pass means the cell measures nothing, so redesign the bug in `evals/bugs.ts` and `evals/verify.mts` or drop it (the pooled lift needs at least 6 cases).

## Smoke

```bash
pnpm reeval run --profile smoke schema-drift -v
pnpm reeval run --profile smoke session-not-loaded -v
pnpm reeval run --profile smoke build-triage -v
pnpm reeval run codex:gpt-5.6-luna/mcp -v
```

One case, four arms, one attempt each; then the `mcp` arm on Codex for all 15 cases. Check in the `-v` output and `.reeval/debug/<run>/`:

- `control`: setup copied `node_modules` in and ran the two `genkit` warm-up steps; the agent's diff shows only its fix (the bug is seeded before the first turn).
- `rules`: `CLAUDE.md` holds `GENKIT.md`; no server, no skill.
- `mcp`: the `genkit` server starts and the agent reaches `mcp__genkit__*` tools, directly or after `ToolSearch`. If it never sees a genkit tool, the arm measures `rules`: stop and find out why. `pnpm reeval query "SELECT tool, COUNT(*) FROM tool_calls WHERE run_id = '<run id>' AND (tool LIKE 'mcp__genkit__%' OR tool = 'ToolSearch') GROUP BY tool"`.
- `skill`: the skill is placed and read (`pnpm reeval query skill_reads`).
- Every arm: the real Gemini key appears nowhere under `.reeval/debug/<run>` or `.reeval/runs/<run>` (`grep -rl "$(grep GOOGLE_GENERATIVE_AI_API_KEY .env.local | cut -d= -f2)" .reeval/debug/<run> .reeval/runs/<run>` prints nothing), and the `gateway` lines in `debug.log` say `substituted` for `generativelanguage.googleapis.com`.
- Codex `mcp`: Codex may not pass the sandbox proxy to stdio MCP servers. If `run_flow` results show 401 or `fetch failed`, the server cannot reach Gemini; record it as a harness limitation.
- Antigravity: the harness and the app both use `GEMINI_API_KEY`. Check an Antigravity attempt starts and the app still sees a placeholder.
- Agents bug: does the `mcp` arm call `run_flow` on `tryTriage`/`tryRefundDesk`? Does `get_trace` output fit, or is it truncated? Does the agent read the interrupt's error-looking span as the bug?
- Build task: before the first turn `src/agents.ts` holds `orderAgent` and `refundAgent` only (or is absent for the other two tasks), and the agent's diff shows only what it wrote. Does it write `ai.chat()` or other API that is gone? Does the `mcp` or `skill` arm look up the agents API before it writes?
- `pnpm reeval query check_discrimination` lists `names the cause`, `flow works`, `keeps the flow` for the bugs and `typechecks`, `agent works`, `keeps the flows` for the build tasks; `pnpm reeval query judgements` has two rows per bug attempt and one per build attempt.

Then the whole smoke profile: `pnpm reeval run --profile smoke` (60 attempts).

## Full

One harness at a time, so a rate limit or a crash costs one harness (300 attempts, ~113 min each). `claude-code` alone matches both Claude Code harnesses, so name the model:

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

Pass is all three checks, which is what `lift` and `family_lift` pool. Fix rate is the `flow works` check alone; build rate is the `agent works` check alone. The judges are recorded, never asserted; a failed attempt with a low verdict shows `error_kind = 'judge'` in `failing_attempts`, so read `first_failed_check` for the real cause.

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

For a flows-vs-agents breakdown, add `e.name` (the bug) to a `SELECT` with `JOIN evals e ON e.run_id = c.run_id AND e.key = c.eval_key`, or read `lift` per bug. The 12 bugs and 3 build tasks are listed in the README; `evals/bugs.ts` and `evals/tasks.ts` are the sources of truth.
