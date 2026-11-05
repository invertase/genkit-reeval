# reeval run 20261105T124149Z_4dd56e2_jacob-cable_gs80

17 fail · started 2026-11-05T12:41:49.333Z (2m 37s)

Plan: profile canary (--profile) · 17 evals · 17 cells · 22 attempts

## Results

```text
fail             agents: go-new-app
  requires the genkit module  failed  evals/probes/agents/agents.eval.ts:128
    expected [ Array(1) ] to deeply equal []
  builds                      failed  evals/probes/agents/agents.eval.ts:131
    expected command to succeed, exit code 1
  runs and prints an answer   failed  evals/probes/agents/agents.eval.ts:137
    expected [ 'does not build' ] to deeply equal []
  calls the model             failed  evals/probes/agents/agents.eval.ts:140
    expected [ 'does not build' ] to deeply equal []
  snapshot                    .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-agents-agents-eval-ts-agents-go-new-app-d0ef5d/fake-go-new-control-docker-go-dockerfile-4faeca/1/snapshots/final
  +1 more passed
  observed         genkit-commands             1 value in reeval query attempt_values · 1 attempt
                   skills-installs             1 value in reeval query attempt_values · 1 attempt
                   web-searches                0 · 1 attempt
                   web-fetches                 0 · 1 attempt
                   web-fetched-hosts-ok        1 value in reeval query attempt_values · 1 attempt
                   web-fetched-hosts-failed    1 value in reeval query attempt_values · 1 attempt
                   mentions-anthropic-api-key  false 1
                   install-conflicts           1 value in reeval query attempt_values · 1 attempt
                   mirror-path-mentions        1 value in reeval query attempt_values · 1 attempt
                   go-app-dir                  . 1
                   genkit-go-version           null 1

fail             agents: go-agent-session
  second process knows the order  failed  evals/probes/agents/agents.eval.ts:174
    expected command to succeed, exit code 1
  snapshot                        .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/snapshots/final
  +4 more passed
  observed         genkit-commands             1 value in reeval query attempt_values · 1 attempt
                   skills-installs             1 value in reeval query attempt_values · 1 attempt
                   web-searches                0 · 1 attempt
                   web-fetches                 0 · 1 attempt
                   web-fetched-hosts-ok        1 value in reeval query attempt_values · 1 attempt
                   web-fetched-hosts-failed    1 value in reeval query attempt_values · 1 attempt
                   mentions-anthropic-api-key  false 1
                   install-conflicts           1 value in reeval query attempt_values · 1 attempt
                   genkit-go-version           v1.14.0 1
                   go-test-tail                --- FAIL: TestProbeTwoProcesses (18.24s… 1

fail             agents: py-tool-calling
  answers from the tool  failed  evals/probes/agents/agents.eval.ts:206
    expected [ Array(1) ] to deeply equal []
  snapshot               .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-agents-agents-eval-ts-agents-py-tool-calling-0f7a46/fake-py-tool-control-docker-python-dockerfile-057527/1/snapshots/final
  +3 more passed
  observed         genkit-commands             1 value in reeval query attempt_values · 1 attempt
                   skills-installs             1 value in reeval query attempt_values · 1 attempt
                   web-searches                0 · 1 attempt
                   web-fetches                 0 · 1 attempt
                   web-fetched-hosts-ok        1 value in reeval query attempt_values · 1 attempt
                   web-fetched-hosts-failed    1 value in reeval query attempt_values · 1 attempt
                   mentions-anthropic-api-key  false 1
                   install-conflicts           1 value in reeval query attempt_values · 1 attempt
                   genkit-py-version           0.12.0 1
                   tool-run                    Your order A-1762 is backordered. It is… 1

fail             agents: py-agent-session
  second process knows the order  failed  evals/probes/agents/agents.eval.ts:248
    expected [ Array(1) ] to deeply equal []
  snapshot                        .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/snapshots/final
  +4 more passed
  observed         genkit-commands             1 value in reeval query attempt_values · 1 attempt
                   skills-installs             1 value in reeval query attempt_values · 1 attempt
                   web-searches                0 · 1 attempt
                   web-fetches                 0 · 1 attempt
                   web-fetched-hosts-ok        1 value in reeval query attempt_values · 1 attempt
                   web-fetched-hosts-failed    1 value in reeval query attempt_values · 1 attempt
                   mentions-anthropic-api-key  false 1
                   install-conflicts           1 value in reeval query attempt_values · 1 attempt
                   genkit-py-version           0.12.0 1
                   session-run                 the second process does not recall A-96… 1

fail             agents: py-skill-setup
  guidance is for Python Genkit    failed  evals/probes/agents/agents.eval.ts:277
    expected [ Array(1) ] to deeply equal []
  turn 2 tool converts 100 to 212  failed  evals/probes/agents/agents.eval.ts:285
    expected [ Array(1) ] to deeply equal []
  snapshot                         .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-agents-agents-eval-ts-agents-py-skill-setup-6caccc/fake-py-setup-control-docker-python-dockerfile-54f49b/1/snapshots/final
  +4 more passed
  observed         genkit-commands             1 value in reeval query attempt_values · 1 attempt
                   skills-installs             1 value in reeval query attempt_values · 1 attempt
                   web-searches                0 · 1 attempt
                   web-fetches                 0 · 1 attempt
                   web-fetched-hosts-ok        1 value in reeval query attempt_values · 1 attempt
                   web-fetched-hosts-failed    1 value in reeval query attempt_values · 1 attempt
                   mentions-anthropic-api-key  false 1
                   install-conflicts           1 value in reeval query attempt_values · 1 attempt
                   guidance-files              AGENTS.md 1
                   skills-called               1 value in reeval query attempt_values · 1 attempt

                 docs: empty project
  fail  pkg-gemini-haiku                             0 of 1
    depends on @genkit-ai/google-genai               failed  evals/probes/docs/docs.eval.ts:31
      expected false to be true // Object.is equality
    no @genkit-ai/googleai or @genkit-ai/vertexai    failed  evals/probes/docs/docs.eval.ts:31
      expected [ '@genkit-ai/googleai' ] to deeply equal []
    no gemini model constants                        failed  evals/probes/docs/docs.eval.ts:31
      expected [ 'gemini25FlashLite' ] to deeply equal []
    npm start prints text                            failed  evals/probes/docs/docs.eval.ts:31
      expected [ Array(1) ] to deeply equal []
    snapshot                                         .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-docs-docs-eval-ts-docs-empty-project-pkg-gemini-d652ff/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final
    +2 more passed
  fail  structured-output                            0 of 1
    asks for output with a schema                    failed  evals/probes/docs/docs.eval.ts:31
      expected false to be true // Object.is equality
    snapshot                                         .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-docs-docs-eval-ts-docs-empty-project-structured-23761f/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final
    +4 more passed
  fail  mcp-server                                   0 of 1
    depends on @genkit-ai/mcp                        failed  evals/probes/docs/docs.eval.ts:31
      expected false to be true // Object.is equality
    no genkitx-mcp                                   failed  evals/probes/docs/docs.eval.ts:31
      expected [ 'genkitx-mcp' ] to deeply equal []
    snapshot                                         .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-docs-docs-eval-ts-docs-empty-project-mcp-server-007811/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final
    +3 more passed
  fail  anthropic-plugin                             0 of 1
    depends on @genkit-ai/anthropic                  failed  evals/probes/docs/docs.eval.ts:31
      expected false to be true // Object.is equality
    no direct @anthropic-ai/sdk import               failed  evals/probes/docs/docs.eval.ts:31
      expected true to be false // Object.is equality
    no retired claude model names                    failed  evals/probes/docs/docs.eval.ts:31
      expected 'claude-3-haiku-20240307' to be null // Object.is equality
    registers the anthropic plugin                   failed  evals/probes/docs/docs.eval.ts:31
      expected false to be true // Object.is equality
    snapshot                                         .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-docs-docs-eval-ts-docs-empty-project-anthropic-32aea6/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final
    +2 more passed
  fail  fallback-middleware                          0 of 1
    uses the fallback middleware                     failed  evals/probes/docs/docs.eval.ts:31
      expected false to be true // Object.is equality
    snapshot                                         .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-docs-docs-eval-ts-docs-empty-project-fallback-m-916fb9/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final
    +3 more passed
  fail  media-models                                 0 of 1
    no shut-down media model ids                     failed  evals/probes/docs/docs.eval.ts:31
      expected 'imagen-3.0-generate-002' to be null // Object.is equality
    no media model ids that shut down on 2026-11-17  failed  evals/probes/docs/docs.eval.ts:31
      expected 'gemini-2.5-flash-preview-tts' to be null // Object.is equality
    snapshot                                         .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-docs-docs-eval-ts-docs-empty-project-media-mode-541b43/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final
    +3 more passed

                 docs: seeded project
  fail  chat-session                       0 of 1
    second process recalls the first turn  failed  evals/probes/docs/docs.eval.ts:31
      expected [ Array(1) ] to deeply equal []
    snapshot                               .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-docs-docs-eval-ts-docs-seeded-project-chat-sess-4d521e/fake-js-seed-open-docker-evals-9fb5f5/1/snapshots/final
    +3 more passed

                 inline-docs
  fail  build-triage          0 of 1
    uses agents() delegation  failed  evals/probes/inline-docs/inline-docs.eval.ts:39
      expected false to be true // Object.is equality
    snapshot                  .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-inline-docs-inline-docs-eval-ts-inline-docs-bui-31a1f2/fake-stock-docker-evals-004511/1/snapshots/final
    +8 more passed

                 tooling: cli-verify
  fail  cli-verify                     0 of 1
    flow returns summary and priority  failed  evals/probes/tooling/tooling.eval.ts:51
      expected [ …(2) ] to deeply equal []
    snapshot                           .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-tooling-tooling-eval-ts-tooling-cli-verify-cli-c53a7d/fake-control-docker-evals-3ea2b1/1/snapshots/final
    +2 more passed

                 tooling: cli-upgrade
  fail  cli-upgrade                        0 of 1
    genkit packages at one latest version  failed  evals/probes/tooling/tooling.eval.ts:70
      expected [ …(2) ] to deeply equal []
    snapshot                               .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-tooling-tooling-eval-ts-tooling-cli-upgrade-cli-e77f68/fake-control-docker-evals-3ea2b1/1/snapshots/final
    +4 more passed

                 tooling: cli-add-eval
  fail  cli-add-eval                   0 of 1
    evaluator is registered            failed  evals/probes/tooling/tooling.eval.ts:94
      expected [] to not deeply equal []
    eval:flow runs with the evaluator  failed  evals/probes/tooling/tooling.eval.ts:103
      expected [ Array(1) ] to deeply equal []
    snapshot                           .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-tooling-tooling-eval-ts-tooling-cli-add-eval-cl-57b6ce/fake-control-docker-evals-3ea2b1/1/snapshots/final
    +2 more passed

                 tooling: devui-missing-env
  fail  devui-missing-env                      0 of 1
    reports a real greet trace and its output  failed  evals/probes/tooling/tooling.eval.ts:124
      expected [ Array(1) ] to deeply equal []
    snapshot                                   .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-tooling-tooling-eval-ts-tooling-devui-missing-e-46d39d/fake-mcp-docker-evals-3fdda1/1/snapshots/final
    +2 more passed

                 tooling: devui-two-runtimes
  fail  devui-two-runtimes                            0 of 1
    reports the greeting from the running second app  failed  evals/probes/tooling/tooling.eval.ts:198
      expected [ Array(1) ] to deeply equal []
    snapshot                                          .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-tooling-tooling-eval-ts-tooling-devui-two-runti-9c3846/fake-mcp-docker-evals-3fdda1/1/snapshots/final
    +2 more passed

                 tooling: mcp-offline-docs
  fail  mcp-offline-docs         0 of 1
    answer says the docs failed  failed  evals/probes/tooling/tooling.eval.ts:218
      expected false to be true // Object.is equality
    snapshot                     .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-tooling-tooling-eval-ts-tooling-mcp-offline-doc-133814/fake-mcp-offline-docker-evals-a0cf92/1/snapshots/final
    +1 more passed

                 tooling: mcp-broken-server
  fail  mcp-broken-server  0 of 1
    lists only real flows  failed  evals/probes/tooling/tooling.eval.ts:263
      expected [ 'processRefund is not a flow' ] to deeply equal []
    snapshot               .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-tooling-tooling-eval-ts-tooling-mcp-broken-serv-3d153c/fake-mcp-wrong-root-docker-evals-d398a6/1/snapshots/final
    +2 more passed

                 tooling: mcp-setup-claude
  fail  mcp-setup-claude                  0 of 1
    registers genkit mcp in .mcp.json     failed  evals/probes/tooling/tooling.eval.ts:295
      expected [ Array(1) ] to deeply equal []
    registered server answers tools/list  failed  evals/probes/tooling/tooling.eval.ts:303
      expected [ 'no registered server to start' ] to deeply equal []
    snapshot                              .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-tooling-tooling-eval-ts-tooling-mcp-setup-claud-7ef272/fake-control-claude-docker-evals-274cfc/1/snapshots/final
    +3 more passed

                 tooling: agent-two-turn
  fail  agent-two-turn                     0 of 1
    replies come from a real two-turn run  failed  evals/probes/tooling/tooling.eval.ts:332
      expected [ Array(1) ] to deeply equal []
    snapshot                               .reeval/runs/20261105T124149Z_4dd56e2_jacob-cable_gs80/evals-probes-tooling-tooling-eval-ts-tooling-agent-two-turn-1d5ee6/fake-control-docker-evals-3ea2b1/1/snapshots/final
    +2 more passed

17 fail
```

## State

| | |
|---|---|
| Executed at | 4dd56e233463 on main, dirty (the commit that adds this record is later) |
| Uncommitted | worktree.patch, 43293 bytes, sha256 205866973805 |
| Lockfiles | pnpm-lock.yaml e2d07f3d1526 |
| Images | reeval-dockerfile:evals-d63032d750348f16 · id 5715e75cbc0f · no registry digest (built locally) · CLI @cursor/sdk 1.0.40 · dockerfile evals/Dockerfile d63032d75034; reeval-dockerfile:go-dockerfile-d31ede4b02162f31 · id bef867a7626e · no registry digest (built locally) · CLI @cursor/sdk 1.0.40 · dockerfile evals/probes/images/go.Dockerfile d31ede4b0216; reeval-dockerfile:python-dockerfile-d31ede4b02162f31 · id ef17ee5c67dc · no registry digest (built locally) · CLI @cursor/sdk 1.0.40 · dockerfile evals/probes/images/python.Dockerfile d31ede4b0216 |
| Harnesses | fake |
| Environments | control 05dba8219d97 · secrets SUPPORT_DESK_GEMINI_API_KEY; control-claude 0924090c48a2 · secrets SUPPORT_DESK_GEMINI_API_KEY; go-new-control 0d988b227835 · secrets GEMINI_API_KEY; go-session-control 728e238b5c0b · secrets GEMINI_API_KEY; js-empty-open a57756231bc7 · secrets GEMINI_API_KEY; js-seed-open f309b43c3e52 · secrets GEMINI_API_KEY; mcp ea2086f02c0a · mcp genkit · secrets SUPPORT_DESK_GEMINI_API_KEY; mcp-offline f45e408242f6 · mcp genkit · secrets SUPPORT_DESK_GEMINI_API_KEY; mcp-wrong-root af66ad280c84 · mcp genkit · secrets SUPPORT_DESK_GEMINI_API_KEY; py-session-control 3400e639e902 · secrets GEMINI_API_KEY; py-setup-control 435ce9086787 · secrets GEMINI_API_KEY; py-tool-control 3400e639e902 · secrets GEMINI_API_KEY; stock 05dba8219d97 · secrets SUPPORT_DESK_GEMINI_API_KEY |
| Judge | fake · threshold 0.8 · version 82e9ca7e6896 |
| Context | 2 files: AGENTS.md 27435b604e92, AGENTS.md 71cd594de157 |
| Packages | @vitest/expect 5.0.5 · jiti 2.7.0 · @reeval/harness-antigravity 0.1.13 · @reeval/harness-opencode 0.2.16 · @reeval/harness-goose 0.1.12 · @reeval/harness-pi 0.2.9 · @reeval/harness-cursor-sdk 0.1.8 · @ai-sdk/harness-claude-code 1.0.176-patch.8c0f3055 · @reeval/harness-codex 0.1.10 · @reeval/harness-fx 0.1.7 · @reeval/harness-grok-build 0.1.10 · ai 7.0.161 · @ai-sdk/harness 1.0.172 · @ai-sdk/anthropic 4.0.95 · @ai-sdk/google 4.0.110 · @ai-sdk/openai 4.0.107 · @ai-sdk/typesafe-ai 3.0.32 |
| reeval | 0.20.0 · node 24.9.0 · typescript evals · darwin/arm64 |
| Runner | local · jacob-cable |

> **Warning:** Image reeval-dockerfile:evals-d63032d750348f16 isn't pushed, so an exact rerun needs this machine's image (id 5715e75cbc0f).

> **Warning:** Image reeval-dockerfile:go-dockerfile-d31ede4b02162f31 isn't pushed, so an exact rerun needs this machine's image (id bef867a7626e).

> **Warning:** Image reeval-dockerfile:python-dockerfile-d31ede4b02162f31 isn't pushed, so an exact rerun needs this machine's image (id ef17ee5c67dc).

Record: [20261105T124149Z_4dd56e2_jacob-cable_gs80.json](../20261105T124149Z_4dd56e2_jacob-cable_gs80.json) · artifacts: all

## Attempts

### ✗ evals/probes/agents/agents.eval.ts › agents: go-new-app

**assertion**

```
requires the genkit module: expected [ Array(1) ] to deeply equal []
```

- Prompt (completed, 61ms): Create a Genkit Go app here whose `main` prints a one-line Gemini answer to 'What is Genkit?' and exits non-zero if the call fails. The Gemini API key is in the GEMINI_API_KEY environment variable.
- Time: setup 3s · agent 59ms · checks 195ms · judge 0ms
- Agent: 2 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `genkit-commands`: `[]`
- Observed `skills-installs`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `install-conflicts`: `[]`
- Observed `mirror-path-mentions`: `{"written":0,"seen":0,"inDiff":true}`
- Observed `go-app-dir`: `"."`
- Observed `genkit-go-version`: `null`
- Check exit 0: `find . -name go.mod -not -path './.git/*' -not -path '*/vendor/*' \| awk '{…` ([log](evals-probes-agents-agents-eval-ts-agents-go-new-app-d0ef5d/fake-go-new-control-docker-go-dockerfile-4faeca/1/checks/1.log))
- Check exit 1: `cd '.' && go build ./...` ([log](evals-probes-agents-agents-eval-ts-agents-go-new-app-d0ef5d/fake-go-new-control-docker-go-dockerfile-4faeca/1/checks/2.log))
- Check exit 1: `cd '.' && go list -m -f '{{.Version}}' github.com/firebase/genkit/go` ([log](evals-probes-agents-agents-eval-ts-agents-go-new-app-d0ef5d/fake-go-new-control-docker-go-dockerfile-4faeca/1/checks/3.log))
- Changed: added `go.mod`, added `main.go`

Last message:

> Done.

- Files: [setup log](evals-probes-agents-agents-eval-ts-agents-go-new-app-d0ef5d/fake-go-new-control-docker-go-dockerfile-4faeca/1/setup.log) · [transcript](evals-probes-agents-agents-eval-ts-agents-go-new-app-d0ef5d/fake-go-new-control-docker-go-dockerfile-4faeca/1/transcript.jsonl) · [diff](evals-probes-agents-agents-eval-ts-agents-go-new-app-d0ef5d/fake-go-new-control-docker-go-dockerfile-4faeca/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-agents-agents-eval-ts-agents-go-new-app-d0ef5d/fake-go-new-control-docker-go-dockerfile-4faeca/1/snapshots/final)

### ✗ evals/probes/agents/agents.eval.ts › agents: go-agent-session

**assertion**

```
second process knows the order: expected command to succeed, exit code 1
--- stderr ---

--- stdout ---
--- FAIL: TestProbeTwoProcesses (18.24s)
    zz_probe_test.go:97: the second process does not recall A-4621: ""
FAIL
FAIL	example.com/support	18.244s
FAIL
```

- Prompt (completed, 389ms): Build a customer support Genkit agent in this directory, as a Go module with `package main` in the project root. It answers customers' questions about their orders with Gemini and has a tool that…
- Time: setup 3s · agent 387ms · checks 27s · judge 0ms
- Agent: 3 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Judge **pass** 1.00 (threshold 0.8, fake): Did the agent build the conversation with Genkit's agents API (an agent defined with a session store, such as `define_agent` in Python or `genkitx.DefineAgent` in Go) rather than a hand-rolled loop over `generate` calls that stores the history itself?
- Observed `genkit-commands`: `[]`
- Observed `skills-installs`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `install-conflicts`: `[]`
- Observed `genkit-go-version`: `"v1.14.0"`
- Observed `go-test-tail`: `"--- FAIL: TestProbeTwoProcesses (18.24s)\n    zz_probe_test.go:97: the second process does not recall A-4621: \"\"\nFAIL\nFAIL\texample.com/support\t18.244s\nFAIL"`
- Check exit 0: `grep -rEq --include=*.go --exclude=*_test.go --exclude-dir=.git…` ([log](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/checks/1.log))
- Check exit 0: `grep -rEq --include=*.go --exclude=*_test.go --exclude-dir=.git…` ([log](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/checks/2.log))
- Check exit 0: `go build ./...` ([log](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/checks/3.log))
- Check exit 0: `go list -m -f '{{.Version}}' github.com/firebase/genkit/go` ([log](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/checks/4.log))
- Check exit 1: `PROBE_ORDER_ID=A-4621 go test -count=1 -timeout 300s -run…` ([log](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/checks/5.log))
- Changed: added `go.mod`, added `go.sum`, added `main.go`

Last message:

> Done.

- Files: [setup log](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/setup.log) · [transcript](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/transcript.jsonl) · [diff](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/diff.patch) · [judge input](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/judge-input.json)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-agents-agents-eval-ts-agents-go-agent-session-3baa90/fake-go-session-control-docker-go-dockerfile-af961c/1/snapshots/final)

### ✗ evals/probes/agents/agents.eval.ts › agents: py-tool-calling

**assertion**

```
answers from the tool: expected [ Array(1) ] to deeply equal []
```

- Prompt (completed, 12s): Create a Python app here with Genkit and one tool that looks up the status of an order by id; `orders.json` in this directory maps each order id to its `status` and `eta`. The Gemini API key is in…
- Time: setup 3s · agent 12s · checks 7s · judge 0ms
- Agent: 1 file changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `genkit-commands`: `[]`
- Observed `skills-installs`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `install-conflicts`: `[]`
- Observed `genkit-py-version`: `"0.12.0"`
- Observed `tool-run`: `"Your order A-1762 is backordered. It is expected to be delivered by 2026-12-04."`
- Check exit 0: `grep -rEq --include=*.py --exclude-dir=.venv '@ai\.tool\|\.tool\(\|@tool' .` ([log](evals-probes-agents-agents-eval-ts-agents-py-tool-calling-0f7a46/fake-py-tool-control-docker-python-dockerfile-057527/1/checks/1.log))
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-tool-calling-0f7a46/fake-py-tool-control-docker-python-dockerfile-057527/1/checks/2.log))
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-tool-calling-0f7a46/fake-py-tool-control-docker-python-dockerfile-057527/1/checks/3.log))
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-tool-calling-0f7a46/fake-py-tool-control-docker-python-dockerfile-057527/1/checks/4.log))
- Changed: added `app.py`

Last message:

> Done.

- Files: [setup log](evals-probes-agents-agents-eval-ts-agents-py-tool-calling-0f7a46/fake-py-tool-control-docker-python-dockerfile-057527/1/setup.log) · [transcript](evals-probes-agents-agents-eval-ts-agents-py-tool-calling-0f7a46/fake-py-tool-control-docker-python-dockerfile-057527/1/transcript.jsonl) · [diff](evals-probes-agents-agents-eval-ts-agents-py-tool-calling-0f7a46/fake-py-tool-control-docker-python-dockerfile-057527/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-agents-agents-eval-ts-agents-py-tool-calling-0f7a46/fake-py-tool-control-docker-python-dockerfile-057527/1/snapshots/final)

### ✗ evals/probes/agents/agents.eval.ts › agents: py-agent-session

**assertion**

```
second process knows the order: expected [ Array(1) ] to deeply equal []
```

- Prompt (completed, 12s): Build a customer support Genkit agent in this directory, in Python. It answers customers' questions about their orders with Gemini and has a tool that looks an order up by id; `orders.json` in this…
- Time: setup 3s · agent 12s · checks 39s · judge 0ms
- Agent: 1 file changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Judge **pass** 1.00 (threshold 0.8, fake): Did the agent build the conversation with Genkit's agents API (an agent defined with a session store, such as `define_agent` in Python or `genkitx.DefineAgent` in Go) rather than a hand-rolled loop over `generate` calls that stores the history itself?
- Observed `genkit-commands`: `[]`
- Observed `skills-installs`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `install-conflicts`: `[]`
- Observed `genkit-py-version`: `"0.12.0"`
- Observed `session-run`: `["the second process does not recall A-9615: \"I am sorry, but I do not have access to the order ID you provided earlier in our conversation. I am unable to recall past interactions.\""]`
- Check exit 0: `grep -rEq --include=*.py --exclude-dir=.venv 'define_agent\(' .` ([log](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/checks/1.log))
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/checks/2.log))
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/checks/3.log))
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/checks/4.log))
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/checks/5.log))
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/checks/6.log))
- Changed: added `app.py`

Last message:

> Done.

- Files: [setup log](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/setup.log) · [transcript](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/transcript.jsonl) · [diff](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/diff.patch) · [judge input](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/judge-input.json)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-agents-agents-eval-ts-agents-py-agent-session-aa3042/fake-py-session-control-docker-python-dockerfile-fba3d9/1/snapshots/final)

### ✗ evals/probes/agents/agents.eval.ts › agents: py-skill-setup

**assertion**

```
guidance is for Python Genkit: expected [ Array(1) ] to deeply equal []
```

- Prompt (completed, 12s): Set up this project so a coding agent writes good Genkit Python code.
- Prompt (completed, 93ms): Now add `app.py` here with one Genkit tool that converts a temperature from Celsius to Fahrenheit. Install the dependencies in this directory (a `.venv` here is fine) so that `python3 -c 'import…
- Time: setup 3s · agent 12s · checks 3s · judge 0ms
- Agent: 2 files changed (workspace diff) · 0 edit tool calls · 2 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `genkit-commands`: `[]`
- Observed `skills-installs`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `install-conflicts`: `[]`
- Observed `guidance-files`: `["AGENTS.md"]`
- Observed `skills-called`: `{"turn1":[],"turn2":[]}`
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-skill-setup-6caccc/fake-py-setup-control-docker-python-dockerfile-54f49b/1/checks/1.log))
- Check exit 0: `PY=$([ -x .venv/bin/python ] && echo .venv/bin/python \|\| echo python3);…` ([log](evals-probes-agents-agents-eval-ts-agents-py-skill-setup-6caccc/fake-py-setup-control-docker-python-dockerfile-54f49b/1/checks/2.log))
- Changed: added `AGENTS.md`, added `app.py`

Last message:

> Done.

- Files: [setup log](evals-probes-agents-agents-eval-ts-agents-py-skill-setup-6caccc/fake-py-setup-control-docker-python-dockerfile-54f49b/1/setup.log) · [transcript](evals-probes-agents-agents-eval-ts-agents-py-skill-setup-6caccc/fake-py-setup-control-docker-python-dockerfile-54f49b/1/transcript.jsonl) · [diff](evals-probes-agents-agents-eval-ts-agents-py-skill-setup-6caccc/fake-py-setup-control-docker-python-dockerfile-54f49b/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-agents-agents-eval-ts-agents-py-skill-setup-6caccc/fake-py-setup-control-docker-python-dockerfile-54f49b/1/snapshots/final)

### ✗ evals/probes/docs/docs.eval.ts › docs: empty project

#### ✗ fake/js-empty-open/docker:evals#pkg-gemini-haiku#1

**assertion**

```
depends on @genkit-ai/google-genai: expected false to be true // Object.is equality
```

- Prompt (completed, 1m 04s): Add Gemini to this project with Genkit and make `npm start` print a haiku about the sea.
- Time: setup 12s · agent 1m 04s · checks 8s · judge 0ms
- Agent: 3 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `web-shell-docs-commands`: `[]`
- Observed `read-hosted-rules`: `false`
- Observed `web-unreported`: `[]`
- Observed `stale`: `["@genkit-ai/googleai","gemini model constants"]`
- Observed `dependencies`: `["genkit","@genkit-ai/googleai","@types/node","tsx","typescript"]`
- Check exit 0: `find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \( -name…` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-pkg-gemini-d652ff/fake-js-empty-open-docker-evals-c5af7e/1/checks/1.log))
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-pkg-gemini-d652ff/fake-js-empty-open-docker-evals-c5af7e/1/checks/2.log))
- Check exit 1 (failed all 2 tries): `ANTHROPIC_API_KEY=unused-by-the-checks timeout 120 npm start --silent` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-pkg-gemini-d652ff/fake-js-empty-open-docker-evals-c5af7e/1/checks/3.log))
- Changed: modified `package-lock.json`, modified `package.json`, modified `src/index.ts`

Last message:

> Done.

- Files: [setup log](evals-probes-docs-docs-eval-ts-docs-empty-project-pkg-gemini-d652ff/fake-js-empty-open-docker-evals-c5af7e/1/setup.log) · [transcript](evals-probes-docs-docs-eval-ts-docs-empty-project-pkg-gemini-d652ff/fake-js-empty-open-docker-evals-c5af7e/1/transcript.jsonl) · [diff](evals-probes-docs-docs-eval-ts-docs-empty-project-pkg-gemini-d652ff/fake-js-empty-open-docker-evals-c5af7e/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-docs-docs-eval-ts-docs-empty-project-pkg-gemini-d652ff/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final)
#### ✗ fake/js-empty-open/docker:evals#structured-output#1

**assertion**

```
asks for output with a schema: expected false to be true // Object.is equality
```

- Prompt (completed, 1m 09s): Using Genkit and Gemini, add a flow named `extractContact` that takes a message as a plain string and returns the sender's `name` and `email` as an object. Put it in `src/flows.ts` and export it as…
- Time: setup 11s · agent 1m 09s · checks 8s · judge 0ms
- Agent: 3 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `web-shell-docs-commands`: `[]`
- Observed `read-hosted-rules`: `false`
- Observed `web-unreported`: `[]`
- Observed `stale`: `[]`
- Observed `dependencies`: `["genkit","@genkit-ai/google-genai","@types/node","tsx","typescript"]`
- Check exit 0: `find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \( -name…` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-structured-23761f/fake-js-empty-open-docker-evals-c5af7e/1/checks/1.log))
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-structured-23761f/fake-js-empty-open-docker-evals-c5af7e/1/checks/2.log))
- Check exit 0: `ANTHROPIC_API_KEY=unused-by-the-checks timeout 180 node_modules/.bin/tsx…` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-structured-23761f/fake-js-empty-open-docker-evals-c5af7e/1/checks/3.log))
- Changed: modified `package-lock.json`, modified `package.json`, added `src/flows.ts`

Last message:

> Done.

- Files: [setup log](evals-probes-docs-docs-eval-ts-docs-empty-project-structured-23761f/fake-js-empty-open-docker-evals-c5af7e/1/setup.log) · [transcript](evals-probes-docs-docs-eval-ts-docs-empty-project-structured-23761f/fake-js-empty-open-docker-evals-c5af7e/1/transcript.jsonl) · [diff](evals-probes-docs-docs-eval-ts-docs-empty-project-structured-23761f/fake-js-empty-open-docker-evals-c5af7e/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-docs-docs-eval-ts-docs-empty-project-structured-23761f/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final)
#### ✗ fake/js-empty-open/docker:evals#mcp-server#1

**assertion**

```
depends on @genkit-ai/mcp: expected false to be true // Object.is equality
```

- Prompt (completed, 1m 12s): Using Genkit, define a tool named `add` that adds two numbers `a` and `b`, and expose it as an MCP server over stdio. `npm run mcp` must start the server.
- Time: setup 11s · agent 1m 12s · checks 6s · judge 0ms
- Agent: 3 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `web-shell-docs-commands`: `[]`
- Observed `read-hosted-rules`: `false`
- Observed `web-unreported`: `[]`
- Observed `stale`: `["genkitx-*"]`
- Observed `dependencies`: `["genkit","genkitx-mcp","@types/node","tsx","typescript"]`
- Check exit 0: `find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \( -name…` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-mcp-server-007811/fake-js-empty-open-docker-evals-c5af7e/1/checks/1.log))
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-mcp-server-007811/fake-js-empty-open-docker-evals-c5af7e/1/checks/2.log))
- Check exit 0: `npm --prefix ~/.verify-mcp install --no-audit --no-fund…` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-mcp-server-007811/fake-js-empty-open-docker-evals-c5af7e/1/checks/3.log))
- Check exit 0: `timeout 150 node_modules/.bin/tsx ~/.verify-mcp/verify.mts…` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-mcp-server-007811/fake-js-empty-open-docker-evals-c5af7e/1/checks/4.log))
- Changed: modified `package-lock.json`, modified `package.json`, added `src/mcp.ts`

Last message:

> Done.

- Files: [setup log](evals-probes-docs-docs-eval-ts-docs-empty-project-mcp-server-007811/fake-js-empty-open-docker-evals-c5af7e/1/setup.log) · [transcript](evals-probes-docs-docs-eval-ts-docs-empty-project-mcp-server-007811/fake-js-empty-open-docker-evals-c5af7e/1/transcript.jsonl) · [diff](evals-probes-docs-docs-eval-ts-docs-empty-project-mcp-server-007811/fake-js-empty-open-docker-evals-c5af7e/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-docs-docs-eval-ts-docs-empty-project-mcp-server-007811/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final)
#### ✗ fake/js-empty-open/docker:evals#anthropic-plugin#1

**assertion**

```
depends on @genkit-ai/anthropic: expected false to be true // Object.is equality
```

- Prompt (completed, 2s): Use Claude through Genkit: add a flow named `askClaude` in `src/flows.ts` that takes a question as a string and answers it with a Claude model.
- Time: setup 10s · agent 2s · checks 679ms · judge 0ms
- Agent: 3 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `web-shell-docs-commands`: `[]`
- Observed `read-hosted-rules`: `false`
- Observed `web-unreported`: `[]`
- Observed `stale`: `["retired claude names"]`
- Observed `dependencies`: `["@anthropic-ai/sdk","@types/node","tsx","typescript"]`
- Check exit 0: `find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \( -name…` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-anthropic-32aea6/fake-js-empty-open-docker-evals-c5af7e/1/checks/1.log))
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-anthropic-32aea6/fake-js-empty-open-docker-evals-c5af7e/1/checks/2.log))
- Changed: modified `package-lock.json`, modified `package.json`, added `src/flows.ts`

Last message:

> Done.

- Files: [setup log](evals-probes-docs-docs-eval-ts-docs-empty-project-anthropic-32aea6/fake-js-empty-open-docker-evals-c5af7e/1/setup.log) · [transcript](evals-probes-docs-docs-eval-ts-docs-empty-project-anthropic-32aea6/fake-js-empty-open-docker-evals-c5af7e/1/transcript.jsonl) · [diff](evals-probes-docs-docs-eval-ts-docs-empty-project-anthropic-32aea6/fake-js-empty-open-docker-evals-c5af7e/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-docs-docs-eval-ts-docs-empty-project-anthropic-32aea6/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final)
#### ✗ fake/js-empty-open/docker:evals#fallback-middleware#1

**assertion**

```
uses the fallback middleware: expected false to be true // Object.is equality
```

- Prompt (completed, 1m 21s): Using Genkit, make `npm start` print a short joke written by Gemini. If the Gemini call fails, it should fall back to another model instead of failing.
- Time: setup 11s · agent 1m 21s · checks 8s · judge 0ms
- Agent: 3 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `web-shell-docs-commands`: `[]`
- Observed `read-hosted-rules`: `false`
- Observed `web-unreported`: `[]`
- Observed `stale`: `[]`
- Observed `dependencies`: `["genkit","@genkit-ai/google-genai","@types/node","tsx","typescript"]`
- Check exit 0: `find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \( -name…` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-fallback-m-916fb9/fake-js-empty-open-docker-evals-c5af7e/1/checks/1.log))
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-fallback-m-916fb9/fake-js-empty-open-docker-evals-c5af7e/1/checks/2.log))
- Check exit 0: `ANTHROPIC_API_KEY=unused-by-the-checks timeout 120 npm start --silent` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-fallback-m-916fb9/fake-js-empty-open-docker-evals-c5af7e/1/checks/3.log))
- Changed: modified `package-lock.json`, modified `package.json`, modified `src/index.ts`

Last message:

> Done.

- Files: [setup log](evals-probes-docs-docs-eval-ts-docs-empty-project-fallback-m-916fb9/fake-js-empty-open-docker-evals-c5af7e/1/setup.log) · [transcript](evals-probes-docs-docs-eval-ts-docs-empty-project-fallback-m-916fb9/fake-js-empty-open-docker-evals-c5af7e/1/transcript.jsonl) · [diff](evals-probes-docs-docs-eval-ts-docs-empty-project-fallback-m-916fb9/fake-js-empty-open-docker-evals-c5af7e/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-docs-docs-eval-ts-docs-empty-project-fallback-m-916fb9/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final)
#### ✗ fake/js-empty-open/docker:evals#media-models#1

**assertion**

```
no shut-down media model ids: expected 'imagen-3.0-generate-002' to be null // Object.is equality
```

- Prompt (completed, 1m 06s): Using Genkit and Gemini, add two flows in `src/flows.ts`: a flow named `speak` that turns a text string into speech, and a flow named `drawImage` that generates an image from a text description.…
- Time: setup 9s · agent 1m 06s · checks 2s · judge 0ms
- Agent: 3 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `web-shell-docs-commands`: `[]`
- Observed `read-hosted-rules`: `false`
- Observed `web-unreported`: `[]`
- Observed `stale`: `[]`
- Observed `dependencies`: `["genkit","@genkit-ai/google-genai","@types/node","tsx","typescript"]`
- Observed `media-model-ids`: `["gemini-2.5-flash-preview-tts","imagen-3.0-generate-002"]`
- Check exit 0: `find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \( -name…` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-media-mode-541b43/fake-js-empty-open-docker-evals-c5af7e/1/checks/1.log))
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-docs-docs-eval-ts-docs-empty-project-media-mode-541b43/fake-js-empty-open-docker-evals-c5af7e/1/checks/2.log))
- Changed: modified `package-lock.json`, modified `package.json`, added `src/flows.ts`

Last message:

> Done.

- Files: [setup log](evals-probes-docs-docs-eval-ts-docs-empty-project-media-mode-541b43/fake-js-empty-open-docker-evals-c5af7e/1/setup.log) · [transcript](evals-probes-docs-docs-eval-ts-docs-empty-project-media-mode-541b43/fake-js-empty-open-docker-evals-c5af7e/1/transcript.jsonl) · [diff](evals-probes-docs-docs-eval-ts-docs-empty-project-media-mode-541b43/fake-js-empty-open-docker-evals-c5af7e/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-docs-docs-eval-ts-docs-empty-project-media-mode-541b43/fake-js-empty-open-docker-evals-c5af7e/1/snapshots/final)

### ✗ evals/probes/docs/docs.eval.ts › docs: seeded project

**assertion**

```
second process recalls the first turn: expected [ Array(1) ] to deeply equal []
```

- Prompt (completed, 59ms): This assistant in `src/index.ts` answers every message as if it were the first. Make it a chat that remembers the conversation, including after the process restarts. Replace `reply` with this…
- Time: setup 1m 23s · agent 57ms · checks 10s · judge 0ms
- Agent: 1 file changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `web-shell-docs-commands`: `[]`
- Observed `read-hosted-rules`: `false`
- Observed `web-unreported`: `[]`
- Observed `stale`: `[]`
- Observed `dependencies`: `["@genkit-ai/google-genai","genkit","@types/node","tsx","typescript"]`
- Observed `used-define-agent`: `false`
- Observed `chat-recall`: `"You have not provided your locker code."`
- Check exit 0: `find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \( -name…` ([log](evals-probes-docs-docs-eval-ts-docs-seeded-project-chat-sess-4d521e/fake-js-seed-open-docker-evals-9fb5f5/1/checks/1.log))
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-docs-docs-eval-ts-docs-seeded-project-chat-sess-4d521e/fake-js-seed-open-docker-evals-9fb5f5/1/checks/2.log))
- Check exit 0: `ANTHROPIC_API_KEY=unused-by-the-checks timeout 180 node_modules/.bin/tsx…` ([log](evals-probes-docs-docs-eval-ts-docs-seeded-project-chat-sess-4d521e/fake-js-seed-open-docker-evals-9fb5f5/1/checks/3.log))
- Check exit 0: `ANTHROPIC_API_KEY=unused-by-the-checks timeout 180 node_modules/.bin/tsx…` ([log](evals-probes-docs-docs-eval-ts-docs-seeded-project-chat-sess-4d521e/fake-js-seed-open-docker-evals-9fb5f5/1/checks/4.log))
- Changed: modified `src/index.ts`

Last message:

> Done.

- Files: [setup log](evals-probes-docs-docs-eval-ts-docs-seeded-project-chat-sess-4d521e/fake-js-seed-open-docker-evals-9fb5f5/1/setup.log) · [transcript](evals-probes-docs-docs-eval-ts-docs-seeded-project-chat-sess-4d521e/fake-js-seed-open-docker-evals-9fb5f5/1/transcript.jsonl) · [diff](evals-probes-docs-docs-eval-ts-docs-seeded-project-chat-sess-4d521e/fake-js-seed-open-docker-evals-9fb5f5/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-docs-docs-eval-ts-docs-seeded-project-chat-sess-4d521e/fake-js-seed-open-docker-evals-9fb5f5/1/snapshots/final)

### ✗ evals/probes/inline-docs/inline-docs.eval.ts › inline-docs

**assertion**

```
uses agents() delegation: expected false to be true // Object.is equality
```

- Prompt (completed, 58ms): You are on the support-desk app in this directory. Add a front desk agent. In `src/agents.ts`, add and export `triage`, the agent customers talk to first. It hands order questions to `orderAgent`…
- Time: setup 4s · agent 56ms · checks 14s · judge 0ms
- Agent: 2 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `searched-dts-files`: `[]`
- Observed `search-terms`: `[]`
- Observed `read-agents-declaration`: `false`
- Observed `saw-patched-tsdoc`: `false`
- Observed `read-agent-config-doc`: `false`
- Observed `genkit-dev-urls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `genkit-commands`: `[]`
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-inline-docs-inline-docs-eval-ts-inline-docs-bui-31a1f2/fake-stock-docker-evals-004511/1/checks/1.log))
- Check exit 0: `node_modules/.bin/tsx --test --test-reporter=tap --test-name-pattern…` ([log](evals-probes-inline-docs-inline-docs-eval-ts-inline-docs-bui-31a1f2/fake-stock-docker-evals-004511/1/checks/2.log))
- Check exit 0: `find . -path ./node_modules -prune -o -path ./.git -prune -o -type f \( -name…` ([log](evals-probes-inline-docs-inline-docs-eval-ts-inline-docs-bui-31a1f2/fake-stock-docker-evals-004511/1/checks/3.log))
- Changed: modified `src/agents.ts`, modified `src/index.ts`

Last message:

> Done.

- Files: [setup log](evals-probes-inline-docs-inline-docs-eval-ts-inline-docs-bui-31a1f2/fake-stock-docker-evals-004511/1/setup.log) · [transcript](evals-probes-inline-docs-inline-docs-eval-ts-inline-docs-bui-31a1f2/fake-stock-docker-evals-004511/1/transcript.jsonl) · [diff](evals-probes-inline-docs-inline-docs-eval-ts-inline-docs-bui-31a1f2/fake-stock-docker-evals-004511/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-inline-docs-inline-docs-eval-ts-inline-docs-bui-31a1f2/fake-stock-docker-evals-004511/1/snapshots/final)

### ✗ evals/probes/tooling/tooling.eval.ts › tooling: cli-verify

**assertion**

```
flow returns summary and priority: expected [ …(2) ] to deeply equal []
```

- Prompt (completed, 72ms): Add a flow `summarizeTicket2` to this app. It takes `{ text }` and returns `{ summary, priority }`, where priority is low, medium or high. Export it from `src/index.ts` like the other flows. Then…
- Time: setup 4s · agent 70ms · checks 2s · judge 0ms
- Agent: 2 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `ran-flow-run`: `false`
- Observed `flow-run-exits-ok`: `[]`
- Observed `ran-genkit-start`: `false`
- Observed `tool-calls`: `1`
- Observed `agent-ms`: `72`
- Observed `genkit-commands`: `[]`
- Observed `genkit-mcp-calls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `stalled`: `[]`
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-tooling-tooling-eval-ts-tooling-cli-verify-cli-c53a7d/fake-control-docker-evals-3ea2b1/1/checks/1.log))
- Check exit 0: `FLOW=summarizeTicket2 FIELDS=summary node_modules/.bin/tsx ~/.verify-flow.mts` ([log](evals-probes-tooling-tooling-eval-ts-tooling-cli-verify-cli-c53a7d/fake-control-docker-evals-3ea2b1/1/checks/2.log))
- Changed: modified `src/index.ts`, added `src/ticket2.ts`

Last message:

> Done.

- Files: [setup log](evals-probes-tooling-tooling-eval-ts-tooling-cli-verify-cli-c53a7d/fake-control-docker-evals-3ea2b1/1/setup.log) · [transcript](evals-probes-tooling-tooling-eval-ts-tooling-cli-verify-cli-c53a7d/fake-control-docker-evals-3ea2b1/1/transcript.jsonl) · [diff](evals-probes-tooling-tooling-eval-ts-tooling-cli-verify-cli-c53a7d/fake-control-docker-evals-3ea2b1/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-tooling-tooling-eval-ts-tooling-cli-verify-cli-c53a7d/fake-control-docker-evals-3ea2b1/1/snapshots/final)

### ✗ evals/probes/tooling/tooling.eval.ts › tooling: cli-upgrade

**assertion**

```
genkit packages at one latest version: expected [ …(2) ] to deeply equal []
```

- Prompt (completed, 1m 30s): Upgrade genkit and all `@genkit-ai/*` packages in this app to the latest version.
- Time: setup 4s · agent 1m 30s · checks 4s · judge 0ms
- Agent: 2 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `tool-calls`: `1`
- Observed `agent-ms`: `90493`
- Observed `genkit-commands`: `[]`
- Observed `genkit-mcp-calls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `stalled`: `[]`
- Check exit 0: `node_modules/.bin/tsx ~/.verify-versions.mts` ([log](evals-probes-tooling-tooling-eval-ts-tooling-cli-upgrade-cli-e77f68/fake-control-docker-evals-3ea2b1/1/checks/1.log))
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-tooling-tooling-eval-ts-tooling-cli-upgrade-cli-e77f68/fake-control-docker-evals-3ea2b1/1/checks/2.log))
- Check exit 0: `FLOW=summarizeTicket FIELDS=title node_modules/.bin/tsx ~/.verify-flow.mts` ([log](evals-probes-tooling-tooling-eval-ts-tooling-cli-upgrade-cli-e77f68/fake-control-docker-evals-3ea2b1/1/checks/3.log))
- Changed: modified `package-lock.json`, modified `package.json`

Last message:

> Done.

- Files: [setup log](evals-probes-tooling-tooling-eval-ts-tooling-cli-upgrade-cli-e77f68/fake-control-docker-evals-3ea2b1/1/setup.log) · [transcript](evals-probes-tooling-tooling-eval-ts-tooling-cli-upgrade-cli-e77f68/fake-control-docker-evals-3ea2b1/1/transcript.jsonl) · [diff](evals-probes-tooling-tooling-eval-ts-tooling-cli-upgrade-cli-e77f68/fake-control-docker-evals-3ea2b1/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-tooling-tooling-eval-ts-tooling-cli-upgrade-cli-e77f68/fake-control-docker-evals-3ea2b1/1/snapshots/final)

### ✗ evals/probes/tooling/tooling.eval.ts › tooling: cli-add-eval

**assertion**

```
evaluator is registered: expected [] to not deeply equal []
```

- Prompt (completed, 151ms): Add an evaluation that checks answer faithfulness for `summarizeTicket`, so that `genkit eval:flow summarizeTicket` uses it. The app starts from `src/index.ts`, which `npm run dev` runs.
- Time: setup 5s · agent 148ms · checks 9s · judge 0ms
- Agent: 1 file changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `evaluator-plugin-declared`: `true`
- Observed `eval-flow-evaluator-errors`: `[]`
- Observed `eval-flow-exit`: `1`
- Observed `evaluator-keys`: `[]`
- Observed `tool-calls`: `1`
- Observed `agent-ms`: `151`
- Observed `genkit-commands`: `[]`
- Observed `genkit-mcp-calls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `stalled`: `[]`
- Check exit 0: `node_modules/.bin/tsx ~/.verify-registered.mts` ([log](evals-probes-tooling-tooling-eval-ts-tooling-cli-add-eval-cl-57b6ce/fake-control-docker-evals-3ea2b1/1/checks/1.log))
- Check exit 1 (failed all 2 tries): `rm -f ~/.eval-out.json; timeout 170 genkit --non-interactive eval:flow…` ([log](evals-probes-tooling-tooling-eval-ts-tooling-cli-add-eval-cl-57b6ce/fake-control-docker-evals-3ea2b1/1/checks/2.log))
- Check exit 0: `node_modules/.bin/tsc --noEmit` ([log](evals-probes-tooling-tooling-eval-ts-tooling-cli-add-eval-cl-57b6ce/fake-control-docker-evals-3ea2b1/1/checks/3.log))
- Changed: modified `package.json`

Last message:

> Done.

- Files: [setup log](evals-probes-tooling-tooling-eval-ts-tooling-cli-add-eval-cl-57b6ce/fake-control-docker-evals-3ea2b1/1/setup.log) · [transcript](evals-probes-tooling-tooling-eval-ts-tooling-cli-add-eval-cl-57b6ce/fake-control-docker-evals-3ea2b1/1/transcript.jsonl) · [diff](evals-probes-tooling-tooling-eval-ts-tooling-cli-add-eval-cl-57b6ce/fake-control-docker-evals-3ea2b1/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-tooling-tooling-eval-ts-tooling-cli-add-eval-cl-57b6ce/fake-control-docker-evals-3ea2b1/1/snapshots/final)

### ✗ evals/probes/tooling/tooling.eval.ts › tooling: devui-missing-env

**assertion**

```
reports a real greet trace and its output: expected [ Array(1) ] to deeply equal []
```

- Prompt (completed, 64ms): The support-desk app is already running for me. Run the `greet` flow for the customer "Dana" and tell me its output and its trace ID, so that I can find the trace in the Dev UI. Save both to…
- Time: setup 12s · agent 61ms · checks 238ms · judge 0ms
- Agent: 1 file changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `mcp-calls-that-failed`: `0`
- Observed `used-user-server-port`: `false`
- Observed `tool-calls`: `1`
- Observed `agent-ms`: `64`
- Observed `genkit-commands`: `[]`
- Observed `genkit-mcp-calls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `stalled`: `[]`
- Check exit 0: `FLOW=greet ANSWER=$HOME/.answer.txt node_modules/.bin/tsx ~/.verify-trace.mts` ([log](evals-probes-tooling-tooling-eval-ts-tooling-devui-missing-e-46d39d/fake-mcp-docker-evals-3fdda1/1/checks/1.log))
- Changed: added `answer.txt`

Last message:

> Done.

- Files: [setup log](evals-probes-tooling-tooling-eval-ts-tooling-devui-missing-e-46d39d/fake-mcp-docker-evals-3fdda1/1/setup.log) · [transcript](evals-probes-tooling-tooling-eval-ts-tooling-devui-missing-e-46d39d/fake-mcp-docker-evals-3fdda1/1/transcript.jsonl) · [diff](evals-probes-tooling-tooling-eval-ts-tooling-devui-missing-e-46d39d/fake-mcp-docker-evals-3fdda1/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-tooling-tooling-eval-ts-tooling-devui-missing-e-46d39d/fake-mcp-docker-evals-3fdda1/1/snapshots/final)

### ✗ evals/probes/tooling/tooling.eval.ts › tooling: devui-two-runtimes

**assertion**

```
reports the greeting from the running second app: expected [ Array(1) ] to deeply equal []
```

- Prompt (completed, 71ms): Two copies of the support-desk app are already running in this sandbox: the one in this directory and another in `second-app/`. Use the running copy, do not start another. Run the `greet` flow in…
- Time: setup 5s · agent 68ms · checks 1s · judge 0ms
- Agent: 2 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `mcp-run-flow-calls`: `0`
- Observed `tool-calls`: `1`
- Observed `agent-ms`: `71`
- Observed `genkit-commands`: `[]`
- Observed `genkit-mcp-calls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `stalled`: `[]`
- Check exit 0: `ln -s ../node_modules second-app/node_modules` ([log](evals-probes-tooling-tooling-eval-ts-tooling-devui-two-runti-9c3846/fake-mcp-docker-evals-3fdda1/1/checks/1.log))
- Check exit 0 (passed on try 3 of 61): `ls .genkit/runtimes/*.json second-app/.genkit/runtimes/*.json` ([log](evals-probes-tooling-tooling-eval-ts-tooling-devui-two-runti-9c3846/fake-mcp-docker-evals-3fdda1/1/checks/2.log))
- Check exit 0: `test ! -e ~/.greet-code` ([log](evals-probes-tooling-tooling-eval-ts-tooling-devui-two-runti-9c3846/fake-mcp-docker-evals-3fdda1/1/checks/3.log))
- Changed: added `answer.txt`, added `second-app/node_modules`

Last message:

> Done.

- Files: [setup log](evals-probes-tooling-tooling-eval-ts-tooling-devui-two-runti-9c3846/fake-mcp-docker-evals-3fdda1/1/setup.log) · [transcript](evals-probes-tooling-tooling-eval-ts-tooling-devui-two-runti-9c3846/fake-mcp-docker-evals-3fdda1/1/transcript.jsonl) · [diff](evals-probes-tooling-tooling-eval-ts-tooling-devui-two-runti-9c3846/fake-mcp-docker-evals-3fdda1/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-tooling-tooling-eval-ts-tooling-devui-two-runti-9c3846/fake-mcp-docker-evals-3fdda1/1/snapshots/final)

### ✗ evals/probes/tooling/tooling.eval.ts › tooling: mcp-offline-docs

**assertion**

```
answer says the docs failed: expected false to be true // Object.is equality
```

- Prompt (completed, 59ms): Using the Genkit docs tools, find out how a flow streams its output to a caller. Write what you found to `answer.md`: the function names to use on both sides and a short example.
- Time: setup 5s · agent 57ms · checks 0ms · judge 1ms
- Agent: 1 file changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Judge **pass** 1.00 (threshold 0.8, fake): Does the agent tell the user that the Genkit docs tools were unavailable or failed, rather than presenting documentation it did not get?
- Observed `correct-streaming-fact`: `true`
- Observed `docs-calls`: `0`
- Observed `docs-calls-ok`: `0`
- Observed `docs-calls-failed`: `0`
- Observed `tool-calls`: `1`
- Observed `agent-ms`: `59`
- Observed `genkit-commands`: `[]`
- Observed `genkit-mcp-calls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `stalled`: `[]`
- Changed: added `answer.md`

Last message:

> Done.

- Files: [setup log](evals-probes-tooling-tooling-eval-ts-tooling-mcp-offline-doc-133814/fake-mcp-offline-docker-evals-a0cf92/1/setup.log) · [transcript](evals-probes-tooling-tooling-eval-ts-tooling-mcp-offline-doc-133814/fake-mcp-offline-docker-evals-a0cf92/1/transcript.jsonl) · [diff](evals-probes-tooling-tooling-eval-ts-tooling-mcp-offline-doc-133814/fake-mcp-offline-docker-evals-a0cf92/1/diff.patch) · [judge input](evals-probes-tooling-tooling-eval-ts-tooling-mcp-offline-doc-133814/fake-mcp-offline-docker-evals-a0cf92/1/judge-input.json)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-tooling-tooling-eval-ts-tooling-mcp-offline-doc-133814/fake-mcp-offline-docker-evals-a0cf92/1/snapshots/final)

### ✗ evals/probes/tooling/tooling.eval.ts › tooling: mcp-broken-server

**assertion**

```
lists only real flows: expected [ 'processRefund is not a flow' ] to deeply equal []
```

- Prompt (completed, 59ms): List the flows (not agents) this app defines. Write their names as a JSON array to `flows.json`.
- Time: setup 6s · agent 57ms · checks 0ms · judge 0ms
- Agent: 1 file changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `read-source-only`: `true`
- Observed `says-tools-unavailable`: `false`
- Observed `mcp-calls-ok`: `0`
- Observed `mcp-calls-failed`: `0`
- Observed `tool-calls`: `1`
- Observed `agent-ms`: `59`
- Observed `genkit-commands`: `[]`
- Observed `genkit-mcp-calls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `stalled`: `[]`
- Changed: added `flows.json`

Last message:

> Done.

- Files: [setup log](evals-probes-tooling-tooling-eval-ts-tooling-mcp-broken-serv-3d153c/fake-mcp-wrong-root-docker-evals-d398a6/1/setup.log) · [transcript](evals-probes-tooling-tooling-eval-ts-tooling-mcp-broken-serv-3d153c/fake-mcp-wrong-root-docker-evals-d398a6/1/transcript.jsonl) · [diff](evals-probes-tooling-tooling-eval-ts-tooling-mcp-broken-serv-3d153c/fake-mcp-wrong-root-docker-evals-d398a6/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-tooling-tooling-eval-ts-tooling-mcp-broken-serv-3d153c/fake-mcp-wrong-root-docker-evals-d398a6/1/snapshots/final)

### ✗ evals/probes/tooling/tooling.eval.ts › tooling: mcp-setup-claude

**assertion**

```
registers genkit mcp in .mcp.json: expected [ Array(1) ] to deeply equal []
```

- Prompt (completed, 141ms): Register the Genkit MCP server with Claude Code for this project, in the project's checked-in config so that my teammates get it too. Make sure it starts.
- Time: setup 36s · agent 139ms · checks 111ms · judge 0ms
- Agent: 0 files changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `ran-claude-mcp-add`: `false`
- Observed `claude-mcp-add-argv`: `[]`
- Observed `claude-rejected-options`: `[]`
- Observed `hit-cwd-error`: `false`
- Observed `wrote-mcp-json-by-hand`: `false`
- Observed `tool-calls-before-first-add`: `null`
- Observed `tool-calls`: `1`
- Observed `agent-ms`: `141`
- Observed `genkit-commands`: `[]`
- Observed `genkit-mcp-calls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `stalled`: `[]`
- Check exit 0: `pwd` ([log](evals-probes-tooling-tooling-eval-ts-tooling-mcp-setup-claud-7ef272/fake-control-claude-docker-evals-274cfc/1/checks/1.log))
- Check exit 0: `env` ([log](evals-probes-tooling-tooling-eval-ts-tooling-mcp-setup-claud-7ef272/fake-control-claude-docker-evals-274cfc/1/checks/2.log))

Last message:

> Done.

- Files: [setup log](evals-probes-tooling-tooling-eval-ts-tooling-mcp-setup-claud-7ef272/fake-control-claude-docker-evals-274cfc/1/setup.log) · [transcript](evals-probes-tooling-tooling-eval-ts-tooling-mcp-setup-claud-7ef272/fake-control-claude-docker-evals-274cfc/1/transcript.jsonl) · [diff](evals-probes-tooling-tooling-eval-ts-tooling-mcp-setup-claud-7ef272/fake-control-claude-docker-evals-274cfc/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-tooling-tooling-eval-ts-tooling-mcp-setup-claud-7ef272/fake-control-claude-docker-evals-274cfc/1/snapshots/final)

### ✗ evals/probes/tooling/tooling.eval.ts › tooling: agent-two-turn

**assertion**

```
replies come from a real two-turn run: expected [ Array(1) ] to deeply equal []
```

- Prompt (completed, 55ms): Prove that the `triage` agent answers a two-turn conversation correctly. In the first turn the customer asks "Where is order A-1001?". In the second turn, in the same conversation, the customer asks…
- Time: setup 5s · agent 54ms · checks 238ms · judge 0ms
- Agent: 1 file changed (workspace diff) · 0 edit tool calls · 1 other tool calls · 0 web searches · 0 fetches · 0ms reasoning
- Observed `tried-flow-run-on-agent`: `false`
- Observed `tried-run-flow-on-agent`: `false`
- Observed `used-wrapper-flow`: `false`
- Observed `tool-calls`: `1`
- Observed `agent-ms`: `55`
- Observed `genkit-commands`: `[]`
- Observed `genkit-mcp-calls`: `[]`
- Observed `web-searches`: `0`
- Observed `web-fetches`: `0`
- Observed `web-fetched-hosts-ok`: `[]`
- Observed `web-fetched-hosts-failed`: `[]`
- Observed `mentions-anthropic-api-key`: `false`
- Observed `stalled`: `[]`
- Check exit 0: `ANSWER=answer.json node_modules/.bin/tsx ~/.verify-answers.mts` ([log](evals-probes-tooling-tooling-eval-ts-tooling-agent-two-turn-1d5ee6/fake-control-docker-evals-3ea2b1/1/checks/1.log))
- Changed: added `answer.json`

Last message:

> Done.

- Files: [setup log](evals-probes-tooling-tooling-eval-ts-tooling-agent-two-turn-1d5ee6/fake-control-docker-evals-3ea2b1/1/setup.log) · [transcript](evals-probes-tooling-tooling-eval-ts-tooling-agent-two-turn-1d5ee6/fake-control-docker-evals-3ea2b1/1/transcript.jsonl) · [diff](evals-probes-tooling-tooling-eval-ts-tooling-agent-two-turn-1d5ee6/fake-control-docker-evals-3ea2b1/1/diff.patch)
- Snapshots (in .reeval/runs, never recorded): [final](evals-probes-tooling-tooling-eval-ts-tooling-agent-two-turn-1d5ee6/fake-control-docker-evals-3ea2b1/1/snapshots/final)
