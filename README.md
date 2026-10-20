# Genkit agent tooling study

Does Genkit's agent tooling help a coding agent find and fix a bug in a Genkit app, and at what cost? Real coding agents work in Docker sandboxes on a broken support-desk app that calls real Gemini, and deterministic checks decide whether the app works afterwards. This is a study, not a gate.

## Arms

| Arm | The agent gets |
|---|---|
| `control` | The app and `genkit-cli` 1.44.1 on `PATH`. |
| `rules` | `control` plus `GENKIT.md` as the project rules. |
| `mcp` | `rules` plus the `genkit mcp` server. |
| `cli` | `control` plus the `developing-genkit-js` skill. |

`mcp` mirrors what `genkit init:ai-tools` installs, and `rules` isolates `GENKIT.md` from the server.

## Scale

12 seeded bugs (6 flows API, 6 agents API) x 4 arms x 4 agents x 5 attempts per cell = 960 attempts, about 6 hours at concurrency 8 (reeval's estimate). [reeval](https://github.com/invertase/reeval) reports:

- Pooled lift in pass rate over `control`, paired by bug, with a 95% interval, per family and arm.
- Tokens, agent time and tool calls as ratios to `control`, with Mann-Whitney verdicts.
- Tool adoption, read from the transcript.
- A recorded LLM judge, never gated: did the diagnosis come from running the app?

## Results

Not run yet. Each cell holds `rules / mcp / cli`. `x` is the arm's median over the `control` median.

Flows API:

| Harness | Fix rate (control / rules / mcp / cli) | Tokens x | Time x | Tools x | Adoption |
|---|---|---|---|---|---|
| claude-code |  |  |  |  |  |
| antigravity |  |  |  |  |  |
| cursor |  |  |  |  |  |
| codex |  |  |  |  |  |

Agents API:

| Harness | Fix rate (control / rules / mcp / cli) | Tokens x | Time x | Tools x | Adoption |
|---|---|---|---|---|---|
| claude-code |  |  |  |  |  |
| antigravity |  |  |  |  |  |
| cursor |  |  |  |  |  |
| codex |  |  |  |  |  |

## Reproduce

```bash
pnpm install
cp env.example .env.local
pnpm reeval doctor
pnpm oracle
pnpm reeval run --profile smoke
pnpm reeval run --profile full claude-code
```

`RUNBOOK.md` has the full sequence, the checks and the queries. `FINDINGS.md` lists what we learned about Genkit's agent tooling while we built the study.
