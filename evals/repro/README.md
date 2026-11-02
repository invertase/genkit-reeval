# Repros

Each script installs pinned versions (genkit 1.42.0, genkit-cli 1.44.1, @genkit-ai/evaluator 1.42.0) into a temp dir, so it needs network for npm and no API key. Run on the host (macOS, Node 24.9), not Docker. Set `REPRO_DIR` to reuse a work dir. `npm view genkit-cli dist-tags` shows `latest: 1.44.1`, so no newer release exists to check.

## eval-flow-input.mts

```
node evals/repro/eval-flow-input.mts
```

`genkit eval:flow <flow> '<json>'` rejects the shape its own error asks for. Observed:

```
genkit eval:flow echo [{"input":{"text":"hello"}}]         (exit 1)
Error parsing the input. Please provide an array of inputs for the flow or a Array<{input: any; reference?: any;}> object. Error: [
  { "code": "invalid_type", "expected": "string", "received": "undefined", "path": [0, "testCaseId"], "message": "Required" } ]

genkit eval:flow echo {"input":{"text":"hello"}}           (exit 1)   "Expected array, received object"
genkit eval:flow echo [{"testCaseId":"t1","input":{...}}]  (exit 0)   Trace ID / Evaluation ID printed
genkit eval:flow echo --input doc-shape.json               (exit 0)   file holds [{"input":{...}}]
```

Verdict: partly confirmed. Inline `[data]` needs `testCaseId`. A file passed with `--input` does not, and the CLI generates it.

Source (genkit-cli 1.44.1, tools-common 1.44.1):

- `genkit-cli/dist/commands/eval-flow.js:44` sets `EVAL_FLOW_SCHEMA = 'Array<{input: any; reference?: any;}>'`, the text shown in the error.
- `eval-flow.js:181` validates inline data with `DatasetSchema.parse`; `eval-flow.js:184` throws the error text.
- `@genkit-ai/tools-common/src/types/eval.ts:91-97`: `DatasetSchema` has `testCaseId: z.string()` (required).
- `@genkit-ai/tools-common/src/types/eval.ts:73-77`: `InferenceSampleSchema` has `testCaseId` optional.
- `@genkit-ai/tools-common/src/utils/eval.ts:253-258`: the file path parses with `InferenceDatasetSchema`, fills `testCaseId` with `generateTestCaseId()`, then parses `DatasetSchema`. The inline path skips the fill.

Docs (`https://genkit.dev/docs/js/evaluation.md`, "eval:flow command"): documents only `--input testInputs.json` holding objects with `input` and optional `reference`. That shape works. The docs never show inline `[data]`.

## run-flow-two-runtimes.mts

```
node evals/repro/run-flow-two-runtimes.mts
```

Starts runtimes with `GENKIT_ENV=dev`, each with a `greet` flow that names its app, and drives `genkit mcp` over stdio with the MCP SDK. A macOS-only blocker in the script keeps the second runtime off port 3100 (get-port misses a port held on 127.0.0.1). Observed:

```
run_flow inputSchema properties: ["flowName","input"], required: ["flowName"]      (no runtime id, no port)

A. root app and root/second-app, each with its own package.json
root/.genkit/runtimes: ["8768-3100-....json"]   root/second-app/.genkit/runtimes: ["8790-3101-....json"]
genkit mcp --project-root root                  -> run_flow greet -> Hi Dana, welcome to ROOT app
genkit mcp --project-root root/second-app       -> run_flow greet -> Hi Dana, welcome to SECOND app
genkit mcp --explicit-project-root
  run_flow inputSchema properties: ["projectRoot","flowName","input"], required: ["projectRoot","flowName"]
  projectRoot=root/second-app                   -> run_flow greet -> Hi Dana, welcome to SECOND app

B. two runtimes in one project root (both files in root/.genkit/runtimes)
index.ts first, other.ts second  -> run_flow greet -> Hi Dana, welcome to OTHER app (same root)
other.ts first, index.ts second  -> run_flow greet -> Hi Dana, welcome to ROOT app
```

Verdict: partly confirmed.

- Confirmed: `run_flow` and `list_flows` take no runtime id or port.
- Refuted: it does not pick "the first". With several runtimes in one root it picks the newest by `timestamp`.
- Explains the agent run: `--project-root` scopes the server to `<root>/.genkit/runtimes`. A second app in a subdirectory with its own `package.json` writes to `second-app/.genkit/runtimes`, so the root server cannot see it. The only runtime visible was the root app, and it answered.
- Escape hatch: `--explicit-project-root` adds a required `projectRoot` argument to the tools. Choice is per project root, not per runtime.

Source (genkit-cli 1.44.1, tools-common 1.44.1):

- `genkit-cli/dist/mcp/flows.js:39-60`: `run_flow` schema is `flowName`, `input` (plus `projectRoot` from `getCommonSchema`); the call is `runAction({ key, input })` with no `runtimeId`.
- `genkit-cli/dist/mcp/utils.js:8-17` (`getCommonSchema`) adds `projectRoot` only when `explicitProjectRoot` is set; `utils.js:32-45` (`getManager`) starts one `RuntimeManager` per project root.
- `genkit-cli/dist/commands/mcp.js:9-22`: `--project-root` defaults to `findProjectRoot()`; `--explicit-project-root` is the flag.
- `@genkit-ai/tools-common/src/utils/utils.ts:92-94`: `findRuntimesDir` is `<projectRoot>/.genkit/runtimes`.
- `@genkit-ai/tools-common/src/manager/manager.ts:740-754`: the manager watches only that directory.
- `manager.ts:514-516`: `runAction` uses `getRuntimeById` when `runtimeId` is set, else `getMostRecentRuntime`. `manager.ts:397-403`: `getMostRecentRuntime` reduces by `timestamp`. The API supports a runtime id; the MCP tool never passes one.
