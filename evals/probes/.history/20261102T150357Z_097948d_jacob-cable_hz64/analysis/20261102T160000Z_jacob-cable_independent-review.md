## Independent review · 20261102T150357Z_097948d_jacob-cable_hz64

A read of this run from the transcripts, diffs and check logs. Paths are relative to the run folder. One attempt per cell, so every finding is direction only.

### Findings, ranked by trust

1. **`genkit eval:flow` documents the wrong input shape (high).** Its error asks for `Array<{input, reference?}>`; that shape fails with `testCaseId Required`, and only `[{testCaseId, input}]` works. Evidence: `tooling-cli-add-eval*/control*/1/transcript.jsonl` lines 34-37 and the same error in both arms' `checks/*.log`.
2. **`genkit mcp` `run_flow` cannot choose between two runtimes (high).** In the mcp arm of `devui-two-runtimes` it ran the first app, and the agent reported that app's greeting for the second (`tooling-devui-two-runti*/mcp*` lines 6-15). The skill arm passed without loading the skill, by reading `second-app/.genkit/runtimes/*.json` and calling the reflection API (lines 13-17).
3. **Docs reach the agent only when a rules file points at them (medium-high).** The `open` and `docsite` arms made 0 web fetches and 0 searches in all 14 docs-suite attempts. What kept them on current APIs was npm's deprecation notice on `@genkit-ai/googleai` (5 attempts) and the `.d.ts` model lists (`KNOWN_TTS_MODELS`, `KNOWN_IMAGE_MODELS`).
4. **The hosted rules file is not followed (medium).** `hosted` read `GENKIT.js.md` in 0 of 7 attempts; `llms` read it in 5 of 7 through the llms.txt link. Hosted agents fetched the rules' example page `flows.md` first in 5 of 7 regardless of task. Guessed URLs returned 404 (`/docs/js/mcp.md`, `/docs/js/plugins/google-genai.md`, `/docs/js/plugins/mcp.md`); `index` had none. Bundles moved genkit.dev egress to about 200-310 KB per attempt against 10-70 KB for `index`.
5. **Docs and skills decide whether agents use the agents API (medium).** `chat-session`: `llms`, `index` and `hosted` used `defineAgent` (3 of 3); `open` and `docsite` hand-rolled a file history (0 of 2); all five passed, since the check does not gate on it. `go-agent-session`: the index agent read `agents/session-stores.md` and still hand-rolled, because the API is "still experimental" (line 11); only the skill arm used `DefineAgent` and `localstore`.
6. **No arm found the fallback middleware (medium).** The index rules list `/docs/js/middleware.md`, never fetched. The hosted agent read `llms-js.txt` and concluded "Genkit doesn't have one built in" (line 12). The llms agent took current model ids for "garbled" summaries (lines 8, 12), which points to WebFetch summarization losing detail from large bundles.
7. **Skills load and cut effort (medium on direction, low on size).** The skill loaded in every arm that had it except `devui-two-runtimes`. go-session: 15 vs 36 tool calls, 0.88M vs 2.35M tokens; py-setup: 15 vs 43, 0.84M vs 3.39M; py-session: 30 vs 47. In py-setup, the control and index agents installed the skill themselves (`npx -y skills add genkit-ai/skills`) after reading `develop-with-ai.md`. The skill arm wrote only `CLAUDE.md`, so teammates would not get the skill.
8. **The MCP server is rarely used.** 9 Genkit MCP calls in the run. In `devui-missing-env` the mcp arm stopped at "No runtimes found" and asked the user (lines 4-5); the directed arm called `start_runtime` and passed.
9. **`py-tool-index` failed for an unclear reason (low).** `ask()` returned `""`; the agent's own test hung past 120 s and the turn ended unverified (lines 33-39). Its tool takes a primitive `order_id: str` where passing arms use a pydantic input.

Docs-suite effort was flat at 4.0-5.0M tokens per arm; `index` and `hosted` used about 25% fewer tool calls than `open` and `docsite`.

### Check and probe problems found

- `agent-two-turn` rejects valid work: control and mcp ran both turns, then `rm -rf .genkit`, and the check reads `.genkit/sessions`.
- `cli-add-eval` cannot fail on the eval: the check's own `[{"text":...}]` input always exits 1 (finding 1), so it passes on the "Using evaluators:" line alone.
- `go-new-app` read only the workspace root; fixed in d174cb9, all six arms pass in 20261102T152738Z_d174cb9_jacob-cable_4sbs. Control passes, so the probe does not separate arms.
- The `go-agent-session` judge is skipped on failed attempts, the ones it exists for.
- `web-fetched-hosts-refused` counts any `ok:false` fetch, so 404s read as refused; the `skills-installs` regex misses `npx -y skills`.
- `fallback-middleware` "npm start prints text" failed on docsite and index only because the agents' Anthropic fallback needs a key the checks lack.

### Run anomalies

- The harness's brokered `ANTHROPIC_API_KEY` placeholder (`aisdkhc_…`) is visible in the agent's shell; agents built on it, and their apps failed. It is a placeholder the gateway swaps only on the harness's own endpoints, not the real key, but it misleads agents.
- The built-in `claude-api` skill loaded in all five `anthropic-plugin` attempts, a context channel outside Genkit; the docsite agent still chose `genkitx-anthropic` from memory.
- `storage.googleapis.com` (Go module downloads) is blocked in the docsite, llms and index arms; no attempt failed from it yet.
- A one-turn attempt ends while a background task still runs.
- No provider errors and no unresolved hosts.
