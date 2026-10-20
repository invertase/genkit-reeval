# Runbook

Run everything from the repo root. Use `pnpm reeval`, which is the pinned `reeval@0.9.0`.

## What the oracle run proves

`reeval.oracle.config.ts` uses `fakeHarness` and `fakeSandbox`. The fake sandbox is a temporary directory on the host, not a container. Each attempt still runs the real `files`, `setup` (host `npm install`), the body's seeding `c.writeFile` and the checks. The oracle (`evals/oracle.ts`) is the fake agent's one tool call. Both of its profiles (`oracle`, the default, and `canary`) set `limit: { compare: false }`, so only the control arm runs.

What it exercises: the seed applies, the oracle finds the seeded bug itself (the one bug whose broken snippet is in the workspace), its fix is accepted, `answer.json` names the bug's `file` and quotes its broken `snippet`, the verify script runs the repaired flow against the real Gemini API, and the `keeps` regexes hold.

It also sets `judge: { model: fakeJudge() }`, so both `c.judge` calls run, score 1 and are recorded with no key and no model call; the study's real judge model is never called.

What it does not exercise: the real judge model, the `mcp` and `cli` environments, Docker, the egress gateway, key brokering, the `genkit` CLI warm-up steps (skipped in oracle mode), a real harness, the MCP server, the skill placement.

The oracle config's `sandbox: fakeSandbox()` replaces the Docker sandbox from `reeval.config.ts`. It also sets `GENKIT_EVAL_ORACLE=1`, which makes `environments.ts` skip the `genkit` warm-up steps (the fake sandbox is the host, so they would write to the host's genkit config) and pass `GOOGLE_GENERATIVE_AI_API_KEY` to the app as `GEMINI_API_KEY` unbrokered (a fake sandbox has no gateway to swap a placeholder). So the oracle and canary runs need a real key and make a few Gemini calls.

The study has `gate: 'none'`, but with `GENKIT_EVAL_ORACLE=1` it sets `gate: 'all'`, which gates the control cell. So `pnpm oracle` exits non-zero when any cell fails, and `pnpm canary` exits non-zero when its cells fail, which is the expected result.

The oracle config sits at the repo root, so it shares the project root with `reeval.config.ts`: reeval reads the root `.env.local` and writes the root `.reeval/`.

## (a) Keys and doctor

```bash
cp env.example .env.local
```

Fill `ANTHROPIC_API_KEY`, `CURSOR_API_KEY`, `OPENAI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`. `GEMINI_API_KEY` is for Antigravity; set it to the same Gemini key. `.env.local` is gitignored.

```bash
pnpm reeval doctor
```

Expect every line `✓` except `- judge` (no judge model: the eval does not use `c.judge`). Doctor lists images and keys per harness. A `✗ key` line names the variable to set.

## (b) Images

The four images may already exist. Check without building:

```bash
pnpm reeval image build --dry-run
```

Build them, one harness at a time (a filter is a substring of the cell key, so a harness id picks its images):

```bash
pnpm reeval image build claude-code
pnpm reeval image build antigravity
pnpm reeval image build cursor
pnpm reeval image build codex
```

Expect `✓ docker: reeval-sandbox:<harness>-<version>` then the install layer (`npm i -g genkit-cli@1.44.1`). The install command list is part of the image key: do not edit it in `evals/environments.ts` without rebuilding.

## (c) Oracle and canary

```bash
pnpm oracle --ui plain
pnpm canary --ui plain
```

Each plans 12 evals, 12 cells (the control arm per bug, flows and agents studies) and runs in about a minute plus the host `npm install`.

- Oracle: every cell passes all three checks. In the summary, every cell shows `1/1`, `flow works 1/1`. Expect 12/12 and exit code 0.
- Canary: the cheat leaves the bug in place and writes another bug's `file` and `snippet`. `names the cause` and `flow works` fail on every cell, `keeps the flow` passes. Expect 0/12, failure lines for `names the cause` (`file ... is not ...` or `snippet ... does not quote the broken ...`) and `flow works` (`expected command to succeed`), and a non-zero exit code. For the canary, a non-zero exit code is the correct result.

Stop and fix the eval if the oracle fails anywhere (non-zero exit), or the canary passes anywhere (exit code 0, or any cell above 0/1). A `flow works` failure in the oracle usually means a bad key, a Gemini rate limit or a non-deterministic verify script. Re-run that bug: `pnpm oracle <bug>`.

## (d) Dry run

```bash
pnpm reeval run --dry-run
pnpm reeval run --dry-run --json | head
```

Expect `12 evals · 144 cells · 144 attempts` (12 bugs x 3 arms x 4 harnesses), four images `ready`, and `brokered: GEMINI_API_KEY → generativelanguage.googleapis.com; mcp.genkit.env.GEMINI_API_KEY → ...`. With `--profile smoke`: 36 cells. With `--profile full`: 720 attempts. Each study plans as one row, `6 cases · paired lift`.

Filter by study with a tag: `--tag flows` plans 6 evals, 72 cells; `--tag agents` plans 6 evals, 72 cells. Both studies share `evals/study.ts`.

## (e) Smoke run

```bash
pnpm reeval run --profile smoke schema-drift -v
```

One bug, three arms, Claude Code only, one attempt each (3 attempts). Confirm in the `-v` output and in `.reeval/debug/<run>/` (`debug.log` per attempt, plus `trace.ndjson` for failing attempts, or all with `-vv`):

1. `control`: setup ran `npm install` and the two `genkit` warm-up commands. The body seeded the bug with `c.writeFile` before the turn. The agent's diff does not show the seed, only the agent's fix.
2. `mcp` arm: the MCP server `genkit` starts; the transcript has `mcp__genkit__...` tool calls (for example `mcp__genkit__run_flow`, `mcp__genkit__start_runtime`); `CLAUDE.md` holds the `GENKIT.md` text.
3. `cli` arm: the skill is placed and loaded. Look for a `Skill` call or a read of `skills/developing-genkit-js/SKILL.md`. Query it: `pnpm reeval query skill_reads`.
4. In every arm: `GEMINI_API_KEY` in the container is a `reeval_secret_...` placeholder, not the key. Check with `grep -r reeval_secret .reeval/debug/<run>` and make sure the real key appears nowhere.
5. `pnpm reeval query check_discrimination` lists exactly three labels: `names the cause`, `flow works`, `keeps the flow`.

Then smoke one agent bug, with the agents-specific checks:

```bash
pnpm reeval run --profile smoke --tag agents approval-ignored -v
```

- `mcp` arm: does the agent try `mcp__genkit__run_flow` on `supportTurn` or `refundTurn`? Those work (they are flows). Does it try to reach an `/agent/` action, and what error comes back? Query: `SELECT tool, target FROM tool_calls WHERE tool LIKE '%run_flow%'`.
- `get_trace` on an agent turn: does the tool result fit, or is it truncated? Compare the size of the `mcp__genkit__get_trace` result in the transcript with the trace on disk under `evals/app/.genkit/`. Do the same for `genkit trace:get --format json` piped in the `cli` arm (it truncates at 64 KB).
- The interrupt span looks like an error (`status.code: 2`). Check whether an agent reads it as the bug.

Open questions to settle here:

- **MCP env.** Does the stdio `genkit mcp` server inherit the sandbox's environment and proxy, so the app it spawns (`start_runtime`) reaches Gemini? The server gets an explicit `GEMINI_API_KEY` placeholder in `env`. If a flow run through MCP fails with a 401 or a network error, this is the cause. Compare an `mcp` attempt's flow output with the same flow run by `c.exec`.
- **Antigravity key.** The Antigravity harness uses `GEMINI_API_KEY` for itself and brokers it to the adapter. The environment also sets `GEMINI_API_KEY` for the app. Check that an Antigravity attempt starts and that the app inside still gets its own placeholder. If they collide, set the app's variable under another name and change the app to read it (a contract change: ask first).

## (f) Full runs

One harness at a time, so a rate limit or a crash costs one harness:

```bash
pnpm reeval run --profile full claude-code --record
pnpm reeval run --profile full antigravity --record
pnpm reeval run --profile full cursor --record
pnpm reeval run --profile full codex --record
```

Each is 12 bugs x 3 arms x 5 attempts = 180 attempts, 15 minutes at most each. To split further, run one study per harness:

```bash
pnpm reeval run --profile full --tag flows claude-code --record
pnpm reeval run --profile full --tag agents claude-code --record
```

Each study is 90 attempts per harness. Memory: default concurrency is 8 and reeval caps it by Docker memory (doctor shows 7.7 GB). Every attempt runs `npm install` for the app and a Genkit process, so lower it if you see `oom_kills` or killed processes: add `--concurrency 4`. Check `pnpm reeval query "SELECT harness, SUM(oom_kills) FROM failing_attempts GROUP BY harness"`.

Interrupted run: `pnpm reeval run --resume`. Five attempts per side is the minimum for effort verdicts (they need 4).

Optional: add `questions: ['Which arm found the cause from the trace?']` to the `compare` in `evals/study.ts`. It asks a language model about pairs of attempts after the run (uses `analysis.model`). It never changes pass or fail.

## (g) Results

```bash
pnpm reeval query family_lift
pnpm reeval query lift
pnpm reeval query effort
pnpm reeval query check_discrimination
pnpm reeval query skill_reads
pnpm reeval query contrasts
pnpm reeval query context_use
pnpm reeval query judgements
```

`family_lift`: one lift per study and arm, paired by bug. `lift`: per-bug points with `lo` and `hi` (a 95% interval; `within_noise = 1` when it spans 0). `effort`: `tokens_ratio`, `agent_s_ratio`, `tools_ratio` and their verdicts. `check_discrimination`: which of the three checks tell the arms apart. `contrasts` (mcp against cli) and `context_use` (calls by class) are in the reeval docs but not in 0.9.0: the query then lists the views that exist. Skip them in that case. `judgements` is a table: one row per judge call, with `question`, `score` (the judge's P(yes)), `verdict` against `threshold` 0.7, and `input_path` (the attempt's `judge-input.json`).

Every query below reads one run. Find its id, then paste it in place of `<run id>`:

```bash
pnpm reeval query "SELECT run_id, profile, started_at, attempts FROM runs ORDER BY started_at DESC LIMIT 5"
```

A query without the `run_id` filter adds every run in `.reeval/history.db` together.

Adoption, per harness and arm (attempts that made at least one call of the kind). Tool names differ by harness: first run `SELECT DISTINCT tool FROM tool_calls WHERE tool LIKE '%genkit%'` and widen the patterns if a harness names MCP tools another way.

```sql
SELECT c.harness,
       CASE WHEN c.environment LIKE '%-mcp' THEN 'mcp'
            WHEN c.environment LIKE '%-cli' THEN 'cli' ELSE 'control' END AS arm,
       COUNT(*) AS attempts,
       SUM(a.mcp_calls > 0) AS used_mcp,
       SUM(a.cli_calls > 0) AS used_cli
FROM (
  SELECT run_id, attempt_key,
         SUM(tool LIKE 'mcp__genkit__%') AS mcp_calls,
         SUM(tool NOT LIKE 'mcp__%' AND target LIKE '%genkit %') AS cli_calls
  FROM tool_calls
  WHERE run_id = '<run id>'
  GROUP BY run_id, attempt_key
) a
JOIN attempts t ON t.run_id = a.run_id AND t.key = a.attempt_key
JOIN cells c ON c.run_id = t.run_id AND c.eval_key = t.eval_key AND c.key = t.cell_key
GROUP BY c.harness, arm
ORDER BY c.harness, arm
```

Run it with `pnpm reeval query "<sql>"` (or `--json`).

Pass and fix rate are different numbers. An attempt passes only when all three checks pass, and `lift` and `family_lift` pool that pass. The fix rate is the pass rate of the `flow works` check alone. It comes from the `cell_checks` table (one row per run, eval, cell and check label, with `pass`, `fail`, `error` and `not_run` counts). Fix rate per harness and arm:

```sql
SELECT c.harness,
       CASE WHEN c.environment LIKE '%-mcp' THEN 'mcp'
            WHEN c.environment LIKE '%-cli' THEN 'cli' ELSE 'control' END AS arm,
       SUM(k.pass) AS fixed, SUM(k.pass + k.fail) AS counted, SUM(k.error) AS error, SUM(k.not_run) AS not_run
FROM cell_checks k
JOIN cells c ON c.run_id = k.run_id AND c.eval_key = k.eval_key AND c.key = k.cell_key
WHERE k.run_id = '<run id>' AND k.label = 'flow works'
GROUP BY c.harness, arm ORDER BY c.harness, arm
```

A non-zero `error` or `not_run` means the check did not give a result (an infrastructure error or an earlier hard failure). Investigate those attempts in `failing_attempts` before you report the rate.

Effort per harness and arm:

```sql
SELECT harness, CASE WHEN environment LIKE '%-mcp' THEN 'mcp' ELSE 'cli' END AS arm,
       ROUND(AVG(tokens_ratio), 2) AS tokens_x, ROUND(AVG(agent_s_ratio), 2) AS time_x,
       ROUND(AVG(tools_ratio), 2) AS tools_x
FROM effort WHERE run_id = '<run id>' AND role = 'variant' GROUP BY harness, arm
```

The effort query averages per-bug ratios: a rough summary. Per-bug verdicts are in `effort`.

Judge scores are recorded, not gated: the study never asserts a verdict, so pass, lift and fix rate stay on the three checks. Mean `evidence-based diagnosis` score per harness and arm:

```sql
SELECT c.harness,
       CASE WHEN c.environment LIKE '%-mcp' THEN 'mcp'
            WHEN c.environment LIKE '%-cli' THEN 'cli' ELSE 'control' END AS arm,
       COUNT(*) AS judged, ROUND(AVG(j.score), 2) AS evidence_score, SUM(j.verdict = 'pass') AS at_or_above_0_7
FROM judgements j
JOIN attempts t ON t.run_id = j.run_id AND t.key = j.attempt_key
JOIN cells c ON c.run_id = t.run_id AND c.eval_key = t.eval_key AND c.key = t.cell_key
WHERE j.run_id = '<run id>' AND j.question LIKE 'Did the agent establish the root cause%'
GROUP BY c.harness, arm ORDER BY c.harness, arm
```

For the `honest summary` judge, swap the filter for `j.question LIKE 'Does the agent''s final message%'`. Two side effects of recording a judge in reeval 0.9.0: an attempt that fails a check and has a judge verdict below 0.7 shows `error_kind = 'judge'` in `failing_attempts` (read `first_failed_check` for the real cause), and a judge call that still fails after its retries (a provider error) fails the attempt as a `judge` error.

Explain and publish:

```bash
pnpm reeval analyze --save          # one LLM call (analysis.model google/gemini-3.8-flash), citations checked
pnpm reeval studio build --out site
```

`site/` is gitignored and holds every transcript and diff. Keys are masked, but read the transcripts before you publish it.

## (h) Fill the README table

Fill the flows and agents tables separately: add `AND k.eval_key LIKE '%agents.eval%'` (or `NOT LIKE`) to the fix-rate query, and `AND eval_key LIKE ...` to the effort query. For each harness: `fix rate` is `fixed / counted` for `control` and the arm from the fix-rate query. `Tokens x`, `Agent time x` and `Tool calls x` come from the effort query (a `·` tokens ratio means that harness reports no usage). Mark a ratio with a verdict other than `effect` as within noise: check `tokens_verdict`, `time_verdict` and `verdict` in `effort`. `MCP adoption` and `CLI adoption` are `used_mcp / attempts` and `used_cli / attempts` from the adoption query. `Skill read` is the number of `cli` attempts in `skill_reads` over attempts. Commit the filled table with the recorded runs' run id in the commit message.
