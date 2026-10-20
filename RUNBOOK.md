# Runbook

Run everything from the repo root. `pnpm reeval` is the pinned `reeval@0.9.0`. Never run `--profile full` before the oracle, the canary and a smoke run pass.

## Plan sizes

The study is 12 bugs x 4 arms (`control`, `rules`, `mcp`, `cli`) x 4 harnesses = 192 cells. `evals/debugging.eval.ts` holds the 6 flows bugs (tag `flows`) and `evals/agents.eval.ts` holds the 6 agents bugs (tag `agents`). Both come from `evals/study.ts`, and each is one `evaluate.each` family with a paired lift.

| Command | Evals | Cells | Attempts | reeval's estimate at concurrency 8 |
|---|---|---|---|---|
| `pnpm reeval run --dry-run` | 12 | 192 | 192 | 72 min |
| `... --profile smoke` | 12 | 48 | 48 | 18 min |
| `... --profile smoke schema-drift` | 1 | 4 | 4 | 3 min |
| `... --profile full` | 12 | 192 | 960 | 6 h |
| `... --profile full claude-code` | 12 | 48 | 240 | 90 min |
| `... --profile full --tag flows claude-code` | 6 | 24 | 120 | 45 min |
| `... --tag flows` or `--tag agents` | 6 | 96 | 96 | 36 min |
| `pnpm oracle --dry-run`, `pnpm canary --dry-run` | 12 | 12 | 12 | see (d) |

reeval's estimate is about 3 minutes per attempt. It is not a measurement.

`smoke` keeps one harness (`claude-code:claude-sonnet-5`) and one attempt per cell. `full` sets 5 attempts per cell and `record: 'always'`, so a full run is recorded without `--record`.

Filters: a positional filter is a substring of an eval path, an eval name or a cell key (`<harness>/<arm>/<sandbox>`). Two positional filters combine with OR: `schema-drift codex` plans 60 cells, not 4. `--tag` combines with AND. To pick one harness and one arm, use one cell-key filter, such as `codex:gpt-5.6-luna/mcp`.

## (a) Keys and doctor

```bash
cp env.example .env.local
```

Fill `ANTHROPIC_API_KEY`, `CURSOR_API_KEY`, `OPENAI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`. Set `GEMINI_API_KEY` to the same Gemini key, for Antigravity. `.env.local` is gitignored.

`GOOGLE_GENERATIVE_AI_API_KEY` has three users: the app in the sandbox (brokered as `GEMINI_API_KEY`), the judge (`google/gemini-3.8-flash`, threshold 0.7) and `reeval analyze`. The judge and `analyze` run on the host.

```bash
pnpm reeval doctor
```

Expect every line `✓`. Doctor checks Docker, the images and each harness's and the judge's key. A `✗ key` line names the variable to set.

## (b) Images

```bash
pnpm reeval image build --dry-run
```

Build any image that is not `ready`, one harness at a time:

```bash
pnpm reeval image build claude-code
pnpm reeval image build antigravity
pnpm reeval image build cursor
pnpm reeval image build codex
```

Every harness image gets one install layer, `npm i -g genkit-cli@1.44.1`. The install command list is part of the image key. If you change `sandbox` in `reeval.config.ts`, rebuild: the oracle config imports the same `sandbox`.

## (c) Live checks on the host

These run the healthy app against real Gemini on the host, with the key from `.env.local`. They need no Docker and no agent.

```bash
pnpm try-flows
npx tsx evals/scripts/try-agents.ts
```

- `pnpm try-flows` runs the 6 healthy flows, including `orderStatus` with the lowercase id `a-1001`. Expect `6/6 flows passed` and exit code 0.
- `try-agents.ts` runs 6 agent scenarios: delegation, the refund interrupt, approve and decline, a two-turn session, and a refund through `triage`. Expect `all scenarios passed` and exit code 0.

A failure here is a problem with the app, the key or Gemini, not with the eval. Fix it before (d).

## (d) Oracle and canary

```bash
pnpm oracle --ui plain
pnpm canary --ui plain
```

`reeval.oracle.config.ts` runs the real Docker sandbox from `reeval.config.ts` with a fake agent (`fakeHarness`). Each command plans 12 evals and 12 cells: the `control` arm for each bug, flows and agents. The fake agent uses the cursor image. Its one turn writes `evals/oracle.ts` and `evals/bugs.ts` to `~/.oracle/` in the container and runs the oracle with the app's `tsx`.

The oracle config also sets:

- `GENKIT_EVAL_GATE=all` before the evals load. `evals/study.ts` then sets `gate: 'all'` on the control cell, so the exit code reports the result. The study itself has `gate: 'none'`.
- `judge: { model: fakeJudge() }`. Both `c.judge` calls run, score 1 and are recorded, with no key and no model call.

What the oracle exercises: the image and its `genkit` CLI, `npm install` and the two `genkit` warm-up steps in the container, the seed, the oracle's fix, `answer.json` (the bug's `file` and its broken `snippet`), the verify script against real Gemini through the egress gateway with a brokered key, the `keeps` regexes, and the judge plumbing.

What it does not exercise: the `rules`, `mcp` and `cli` environments, a real agent, the MCP server, the skill placement and the real judge model.

Time: reeval estimates 2 seconds. That is wrong. Each cell is a container that runs `npm install`, the warm-up steps and the verify script's Gemini calls. Expect several minutes per command. Docker must run, and the cursor image from (b) must exist.

Expected results (not yet confirmed on this tree):

- Oracle: every cell passes all three checks. The summary shows `1/1` and `flow works 1/1` on every cell, 12/12, and exit code 0.
- Canary: the cheat leaves the bug in place and names another bug's `file` and `snippet`. `names the cause` and `flow works` fail on every cell, and `keeps the flow` passes. The summary shows 0/12, failure lines for `names the cause` (`file ... is not ...` or `snippet ... does not quote the broken ...`) and `flow works` (`expected command to succeed`), and a non-zero exit code. For the canary, a non-zero exit code is the correct result.

Stop if the oracle fails anywhere or the canary passes anywhere. A `flow works` failure in the oracle usually means a bad key, a Gemini rate limit or a verify script that is not deterministic. Re-run one bug with `pnpm oracle <bug>`.

The canary also shows that each bug reproduces with real Gemini: the bug stays in place, so `flow works` must fail. Two bugs are most at risk:

- `order-id-case`: Gemini can upper-case `a-1001` itself before it calls `getOrderStatus`. The broken tool then finds the order, and `flow works` passes.
- `schema-drift`: the bug relies on `output: { constrained: false }`, which sends the model the `instructions` text but no schema. If Gemini answers `low/medium/high` anyway, `flow works` passes.

If the canary's `flow works` passes for one of these, run `pnpm canary <bug>` three more times. One pass in four is noise. A stable pass means the bug does not reproduce, and the cell measures nothing. Redesign the bug in `evals/bugs.ts` and `evals/verify.ts` before the smoke run (ask first: that changes the study), or drop it. A family with 5 cases gets an `insufficient` pooled lift, because reeval needs 6.

## (e) Smoke run

```bash
pnpm reeval run --profile smoke schema-drift -v
pnpm reeval run --profile smoke --tag agents approval-ignored -v
```

Each is one bug, four arms, Claude Code only, one attempt per arm. Read the `-v` output and `.reeval/debug/<run>/` (`debug.log` per attempt, `trace.ndjson` for failing attempts, or for all attempts with `-vv`). Check each arm:

1. `control`: setup ran `npm install` and the two `genkit` warm-up commands. The seed was written before the turn, so the agent's diff shows only the fix.
2. `rules`: `CLAUDE.md` holds the `GENKIT.md` text. There is no MCP server and no skill.
3. `mcp`: the `genkit` MCP server starts, and `CLAUDE.md` holds the `GENKIT.md` text. Claude Code can defer MCP tools behind `ToolSearch`. Check that the `mcp__genkit__*` tools reach the agent, directly or after a `ToolSearch` call:

   ```bash
   pnpm reeval query "SELECT tool, COUNT(*) AS calls FROM tool_calls WHERE run_id = '<run id>' AND (tool LIKE 'mcp__genkit__%' OR tool = 'ToolSearch') GROUP BY tool"
   ```

   If the agent never sees a `genkit` tool, the `mcp` arm measures `rules`. Stop and find out why.
4. `cli`: the skill is placed and read. Look for a `Skill` call or a read of `skills/developing-genkit-js/SKILL.md`, or run `pnpm reeval query skill_reads`.
5. Every arm: `GEMINI_API_KEY` in the container is a `reeval_secret_...` placeholder. Run `grep -r reeval_secret .reeval/debug/<run>` and make sure the real key appears nowhere.
6. `pnpm reeval query check_discrimination` lists three labels: `names the cause`, `flow works`, `keeps the flow`.
7. `pnpm reeval query judgements` has two rows per attempt, one per question. Each row has a `score`.

For the agents bug, also check:

- `mcp`: does the agent call `mcp__genkit__run_flow` on `supportTurn` or `refundTurn`? Those work, because they are flows. Does it try an `/agent/` action, and what error comes back? Query `SELECT tool, target FROM tool_calls WHERE run_id = '<run id>' AND tool LIKE '%run_flow%'`.
- Trace size: compare the `mcp__genkit__get_trace` result in the transcript with the trace on disk under `.genkit/` in the workspace. In the `cli` arm, a piped `genkit trace:get --format json` truncates at 64 KB.
- The interrupt span looks like an error (`status.code: 2`). Check whether the agent takes it for the bug.

Then smoke the `mcp` arm on Codex:

```bash
pnpm reeval run --tag flows codex:gpt-5.6-luna/mcp -v
```

That is 6 cells, 6 attempts. Codex may not pass the sandbox's proxy environment to stdio MCP servers. If it does not, the `genkit mcp` server starts the app (`start_runtime`) with no route to Gemini, and `run_flow` results show a 401, `fetch failed` or a connection error. Compare with the same flow run by the verify script. If the server cannot reach Gemini, the Codex `mcp` row measures a broken server: record that as a harness limitation in `FINDINGS.md` and in the results.

Two more questions for the smoke:

- MCP environment on other harnesses: the server gets an explicit `GEMINI_API_KEY` placeholder in `env`. Do the same comparison for an `mcp` attempt on each harness.
- Antigravity key: the Antigravity harness uses `GEMINI_API_KEY` for itself, and the environment also sets `GEMINI_API_KEY` for the app. Check that an Antigravity attempt starts and that the app still gets its own placeholder. If they collide, give the app's variable another name (a change to the app: ask first).

When both bugs look right, run the whole smoke profile (48 attempts):

```bash
pnpm reeval run --profile smoke
```

## (f) Full runs

Run one harness at a time, so a rate limit or a crash costs one harness:

```bash
pnpm reeval run --profile full claude-code
pnpm reeval run --profile full antigravity
pnpm reeval run --profile full cursor
pnpm reeval run --profile full codex
```

Each is 12 bugs x 4 arms x 5 attempts = 240 attempts, about 90 minutes by reeval's estimate. `full` records every run (`record: 'always'`), so no `--record` flag is needed. To split further, run one study per harness (120 attempts each):

```bash
pnpm reeval run --profile full --tag flows claude-code
pnpm reeval run --profile full --tag agents claude-code
```

Memory: concurrency is 8 by default, and reeval caps it by Docker memory. Every attempt runs `npm install` and a Genkit process. If you see OOM kills, add `--concurrency 4`. Check with `pnpm reeval query "SELECT harness, SUM(oom_kills) FROM failing_attempts GROUP BY harness"`.

An interrupted run continues with `pnpm reeval run --resume`. Five attempts per side is enough for effort verdicts, which need at least 4.

## (g) Results

```bash
pnpm reeval query family_lift
pnpm reeval query lift
pnpm reeval query effort
pnpm reeval query check_discrimination
pnpm reeval query skill_reads
pnpm reeval query judgements
```

- `family_lift`: one pooled lift per study and arm against `control`, paired by bug. To compare `mcp` with `rules`, read the difference of their two rows. That difference has no interval of its own.
- `lift`: per-bug points with `lo` and `hi` (a 95% interval; `within_noise = 1` when it spans 0).
- `effort`: `tokens_ratio`, `agent_s_ratio`, `tools_ratio` and the verdicts `tokens_verdict`, `time_verdict` and `verdict`.
- `check_discrimination`: which of the three checks tell the arms apart.
- `judgements`: one row per judge call, with `question`, `score` (the judge's P(yes)), `verdict` against `threshold` 0.7, and `input_path` (the attempt's `judge-input.json`).

The two judge questions are recorded, not gated. The study never asserts a verdict, so pass, lift and fix rate stay on the three checks:

- `evidence-based diagnosis`: did the agent find the cause from evidence of running the app (flow output, a trace, an observed error), and cite it in the `evidence` field of `answer.json`? The judge gets the seeded bug as ground truth and the agent's tool calls. The question starts `Did the agent establish the root cause`.
- `honest summary`: does the final message describe the change accurately? The question starts `Does the agent's final message`.

Two side effects of a recorded judge in reeval 0.9.0: an attempt that fails a check and has a judge score below 0.7 shows `error_kind = 'judge'` in `failing_attempts` (read `first_failed_check` for the real cause), and a judge call that still fails after its retries fails the attempt as a `judge` error.

Each query below reads one run. Find the run id and paste it in place of `'<run id>'`. A query without the `run_id` filter adds every run in `.reeval/history.db` together.

```bash
pnpm reeval query "SELECT run_id, profile, started_at, attempts FROM runs ORDER BY started_at DESC LIMIT 5"
```

Run each block with `pnpm reeval query "<sql>"` (add `--json` for JSON). `cells.environment` holds the bare arm name: `control`, `rules`, `mcp` or `cli`. The `study` column comes from the eval file.

Fix rate: the pass rate of the `flow works` check alone, from `cell_checks`. It is not the attempt pass rate, which needs all three checks and which `lift` and `family_lift` pool.

```sql
SELECT CASE e.file WHEN 'evals/agents.eval.ts' THEN 'agents' ELSE 'flows' END AS study,
       c.harness, c.environment AS arm,
       SUM(k.pass) AS fixed, SUM(k.pass + k.fail) AS counted,
       SUM(k.error) AS error, SUM(k.not_run) AS not_run
FROM cell_checks k
JOIN cells c ON c.run_id = k.run_id AND c.eval_key = k.eval_key AND c.key = k.cell_key
JOIN evals e ON e.run_id = c.run_id AND e.key = c.eval_key
WHERE k.run_id = '<run id>' AND k.label = 'flow works'
GROUP BY study, c.harness, arm
ORDER BY study, c.harness,
         CASE c.environment WHEN 'control' THEN 0 WHEN 'rules' THEN 1 WHEN 'mcp' THEN 2 WHEN 'cli' THEN 3 END
```

A non-zero `error` or `not_run` means the check gave no result. Investigate those attempts in `failing_attempts` before you report the rate.

Adoption: the share of attempts with at least one call of each kind. It starts from `attempts` with a `LEFT JOIN`, so attempts with no tool calls count in the denominator. A CLI call is a shell command that contains a `genkit` subcommand, not the bare word `genkit`.

```sql
SELECT CASE e.file WHEN 'evals/agents.eval.ts' THEN 'agents' ELSE 'flows' END AS study,
       c.harness, c.environment AS arm,
       COUNT(*) AS attempts,
       SUM(COALESCE(a.mcp_calls, 0) > 0) AS used_mcp,
       SUM(COALESCE(a.cli_calls, 0) > 0) AS used_cli
FROM attempts t
JOIN cells c ON c.run_id = t.run_id AND c.eval_key = t.eval_key AND c.key = t.cell_key
JOIN evals e ON e.run_id = c.run_id AND e.key = c.eval_key
LEFT JOIN (
  SELECT run_id, attempt_key,
         SUM(tool LIKE 'mcp__genkit__%') AS mcp_calls,
         SUM(tool NOT LIKE 'mcp__%' AND (target LIKE '%genkit flow:%' OR target LIKE '%genkit trace:%'
             OR target LIKE '%genkit start%' OR target LIKE '%genkit docs:%' OR target LIKE '%genkit mcp%')) AS cli_calls
  FROM tool_calls
  WHERE run_id = '<run id>'
  GROUP BY run_id, attempt_key
) a ON a.run_id = t.run_id AND a.attempt_key = t.key
WHERE t.run_id = '<run id>'
GROUP BY study, c.harness, arm
ORDER BY study, c.harness,
         CASE c.environment WHEN 'control' THEN 0 WHEN 'rules' THEN 1 WHEN 'mcp' THEN 2 WHEN 'cli' THEN 3 END
```

Tool and command names differ by harness. Before you trust the counts, run `SELECT DISTINCT tool FROM tool_calls WHERE tool LIKE '%genkit%'` and `SELECT DISTINCT target FROM tool_calls WHERE target LIKE '%genkit%'`. A global flag before the subcommand (`genkit --non-interactive flow:run`) does not match the patterns: widen them if the agents use that form.

Effort, per study, harness and arm (the mean of per-bug ratios, so a rough summary; per-bug verdicts are in `effort`):

```sql
SELECT CASE e.file WHEN 'evals/agents.eval.ts' THEN 'agents' ELSE 'flows' END AS study,
       f.harness, f.environment AS arm,
       ROUND(AVG(f.tokens_ratio), 2) AS tokens_x, ROUND(AVG(f.agent_s_ratio), 2) AS time_x,
       ROUND(AVG(f.tools_ratio), 2) AS tools_x
FROM effort f
JOIN evals e ON e.run_id = f.run_id AND e.key = f.eval_key
WHERE f.run_id = '<run id>' AND f.role = 'variant'
GROUP BY study, f.harness, arm
ORDER BY study, f.harness,
         CASE f.environment WHEN 'rules' THEN 1 WHEN 'mcp' THEN 2 WHEN 'cli' THEN 3 END
```

Mean `evidence-based diagnosis` score per study, harness and arm:

```sql
SELECT CASE e.file WHEN 'evals/agents.eval.ts' THEN 'agents' ELSE 'flows' END AS study,
       c.harness, c.environment AS arm,
       COUNT(*) AS judged, ROUND(AVG(j.score), 2) AS evidence_score,
       SUM(j.verdict = 'pass') AS at_or_above_0_7
FROM judgements j
JOIN attempts t ON t.run_id = j.run_id AND t.key = j.attempt_key
JOIN cells c ON c.run_id = t.run_id AND c.eval_key = t.eval_key AND c.key = t.cell_key
JOIN evals e ON e.run_id = c.run_id AND e.key = c.eval_key
WHERE j.run_id = '<run id>' AND j.question LIKE 'Did the agent establish the root cause%'
GROUP BY study, c.harness, arm
ORDER BY study, c.harness,
         CASE c.environment WHEN 'control' THEN 0 WHEN 'rules' THEN 1 WHEN 'mcp' THEN 2 WHEN 'cli' THEN 3 END
```

For the `honest summary` judge, change the filter to `j.question LIKE 'Does the agent''s final message%'`.

Explain and publish:

```bash
pnpm reeval analyze --save
pnpm reeval studio build --out site
```

`analyze` makes one LLM call (`analysis.model`, `google/gemini-3.8-flash`) and checks its citations. `site/` is gitignored and holds every transcript and diff. Keys are masked, but read the transcripts before you publish the site.

## (h) Fill the README tables

There is one table per study (flows, agents) and one row per harness. Each cell holds the values for `rules / mcp / cli`.

- Fix rate: `fixed / counted` from the fix-rate query, for `control`, `rules`, `mcp` and `cli`.
- Tokens x, Time x, Tools x: `tokens_x`, `time_x` and `tools_x` from the effort query. A `·` tokens ratio means that the harness reports no usage. Mark a ratio as within noise when its verdict in `effort` is not `effect`.
- Adoption: from the adoption query, `used_cli / attempts` for `rules` and `cli`, and `used_mcp / attempts` for `mcp`. Note the `cli` arm's skill reads from `skill_reads`.

Copy the evidence scores and the items that the runs confirm into the Results section of `FINDINGS.md`. Commit the filled tables with the run ids in the commit message.

## Appendix: the 12 bugs

The source of truth is `evals/bugs.ts`: the exact broken text, the bug report the agent gets, and the `keeps` regexes. The bug report never names the tooling.

| Bug | Kind | File | The bug | The trace or run output shows |
|---|---|---|---|---|
| `schema-drift` | flow | `src/index.ts` | The prompt asks for `P0/P1/P2` priorities. | The raw model output next to "Schema validation failed": the schema allows `low/medium/high`. |
| `tool-not-wired` | flow | `src/index.ts` | `getOrderStatus` is not in `generate({ tools })`. | No tool span. |
| `prompt-var-typo` | flow | `prompts/greet.prompt` | `{{custmerName}}` instead of `{{customerName}}`. | The rendered prompt has an empty name. |
| `truncated-output` | flow | `src/index.ts` | `maxOutputTokens: 24` on `draftReply`. | `finishReason: 'length'`. |
| `history-dropped` | flow | `src/index.ts` | `chat` sends `messages: []`. | A one-message model request. |
| `order-id-case` | flow | `src/index.ts` | `getOrderStatus` no longer upper-cases the id. | The tool span's input is `a-1001` and its output is `null`. |
| `delegation-dropped` | agent | `src/agents.ts` | `agents()` lists only `orderAgent`. | No `delegate_to_refundAgent` tool, so triage answers a refund request itself. |
| `approval-ignored` | agent | `src/agents.ts` | The resume sends `{ approved: true }` instead of the human's answer. | The `approveRefund` tool response says `approved: true` while the human sent `approved: false`, and `issueRefund` runs. |
| `session-not-loaded` | agent | `src/agents.ts` | `supportTurn` never calls `loadChat`. | The second turn gets a new `sessionId`, and its model request has no earlier messages. |
| `max-turns` | agent | `src/agents.ts` | `maxTurns: 1` on `refundAgent`. | `finishReason: 'failed'` and an `ABORTED` "Exceeded maximum tool call iterations" error before the interrupt. |
| `tool-choice-none` | agent | `src/agents.ts` | `toolChoice: 'none'` on `triage`. | The model request lists the delegate tools but carries `toolChoice: 'none'`, so `toolCalls` is empty. |
| `tool-output-drift` | agent | `src/db.ts` | A-1001's `total` is the string `"149.99"`. | The `lookupOrder` span fails "Schema validation failed ... total: must be number", and triage gets "Error calling agent 'orderAgent'". |
