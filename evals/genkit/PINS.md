# Pins

Everything this eval holds fixed, with where it came from. `GENKIT.md` beside this file is the
one artifact; this file is its provenance.

## Table

| Thing | Pin | Source |
|---|---|---|
| genkit-cli (in the sandbox, `npm i -g genkit-cli@1.44.1`; also a root devDependency) | `1.44.1` | npm |
| genkit (app dependency) | `1.42.0` | npm |
| @genkit-ai/google-genai (app dependency) | `1.42.0` | npm |
| reeval (root devDependency) | `0.9.0` | npm |
| genkit-ai/skills repository | `d02d49da3a77687914715188d495999170bbf48b` (`main` on 2026-10-20) | `gh api repos/genkit-ai/skills/commits/HEAD --jq .sha` |
| Skill directory in that repository | `skills/developing-genkit-js/` (`SKILL.md` plus `references/*.md`, including `references/docs-and-cli.md`) | `gh api repos/genkit-ai/skills/git/trees/<sha>?recursive=1` |
| Skill's own CLI requirement | `genkit-cli >= 1.29.0` (`npm install -g genkit-cli@^1.29.0`); `SKILL.md` metadata `version: "1.0.0"` | `SKILL.md` lines 14-15, `references/docs-and-cli.md` line 7 |
| `GENKIT.md` content | the string `GENKIT_CONTEXT` in genkit-cli 1.44.1, `dist/commands/init-ai-tools/context/nodejs.js`, written byte for byte (11679 bytes, no trailing newline) | sha256 `71cd594de1577284a5ff40793e45d9f8e798d9d04658998f84e27ee1451d0ed4`; the CLI's own 8-char hash of it is `71cd594d` |
| `GENKIT.md` title line | `# Genkit Node.js API Rules (v1.20.0)` (the CLI never bumped the title) | same |
| Website copy, for the record, NOT used | `https://genkit.dev/GENKIT.js.md` fetched 2026-10-20T09:30Z, 10712 bytes | sha256 `b64c7122765c61d2fbf194636e3f52f8365adb58ea8d6ff96003b2664c64ffd8` |

## Why the CLI's copy, not the website's

`genkit init:ai-tools` (claude, cursor, gemini, generic) writes the string embedded in the CLI,
not a download. The two copies share the title and most examples but differ in 60-odd lines:

- The CLI copy adds "existing project" guidance (keep the structure, detect the package manager
  and ESM/CJS, do not refactor for Genkit) and drops the `data-urls node-fetch` install.
- The CLI copy recommends Gemini 3 preview models (`gemini-3-flash-preview`,
  `gemini-3-pro-image-preview`, `veo-3.1-generate-preview`); the website copy says `gemini-2.5-pro`,
  `imagen-3.0-generate-002`, `veo-3.0-generate-preview`.
- The CLI copy's "Running and Inspecting Flows" section tells the agent to use the `start_runtime`
  MCP tool and then tell the user to run `genkit start`; the website copy only lists `genkit start`
  forms for the user to run.
- Both carry the same "Important Guidelines" block, including the typo `youself`.

What `init:ai-tools --tool claude` installs around it, which the eval reproduces differently:

- `GENKIT.md` at the project root, plus a `<genkit_prompts hash="71cd594d">` block appended to
  `CLAUDE.md` that reads `Genkit Framework Instructions:\n - @./GENKIT.md`. The eval gives the
  content as `rules: file('./genkit/GENKIT.md')`, so the harness places it as `CLAUDE.md` /
  `AGENTS.md` / `.cursor/rules` directly. Same text, one hop fewer.
- `.mcp.json` with `{ "command": "genkit", "args": ["mcp", "--no-update-notification"] }`. The
  eval's `mcp.stdio` adds `--project-root /reeval/workspace`, because the harness may start the
  server from another cwd.

## Advice conflict

The `GENKIT.md` rules (the `rules` and `mcp` arms) and the `cli` arm's skill give opposite
instructions about running the CLI. Quoted verbatim.

`GENKIT.md` (CLI 1.44.1), "Important Guidelines":

> - ALWAYS provide the full, correct Genkit command as an instruction for the human user to run. Do not run Genkit commands (e.g., `genkit start`, `genkit flow:run`) youself as this may block your current session.

`GENKIT.md`, "Running and Inspecting Flows":

> 1. Identify the command to start the user's project's (e.g., `npm run dev`)
> 2. Use the `start_runtime` tool to start the runtime process. This is required for Genkit to discover flows.
>    - Example: If the project uses `npm run dev`, call `start_runtime` with `{ command: "npm", args: ["run", "dev"] }`.
> 3. After starting the runtime, instruct the user to run `genkit start` in their terminal to launch the Developer UI.

`skills/developing-genkit-js/references/docs-and-cli.md` at `d02d49da`, lines 37-53 and 78-80:

> `genkit start` runs until you stop it with Ctrl+C. That is expected and correct for the common cases: a server your web/mobile app calls, or an interactive CLI you exit yourself. `--noui` only drops the Dev UI; it is **not** a one-shot command and will not exit on its own. Do **not** use `genkit start` as a blocking step in automated/non-interactive contexts; use `flow:run` (below) for that.
>
> For non-interactive/agent/CI use, add the global `--non-interactive` flag before `--` so the CLI uses defaults and never blocks on a prompt (e.g. the first-run analytics notice), e.g. `genkit flow:run myFlow '<input>' --non-interactive -- npx tsx src/index.ts`.
>
> ## Flow Execution (secondary)
>
> -   **Run a flow**: `genkit flow:run <flowName> '<inputJSON>' -- <run cmd>`
>     -   Invokes a specific flow by name from the CLI. Append your run command after `--` to spin up the runtime for this run (the command runs as-is to register your flows): it runs once, prints a `Trace ID`, then exits, so it's the right choice for a quick, non-interactive check that must self-terminate (unlike `genkit start`). [...]
>     -   **Simple Input**:
>         ```bash
>         genkit flow:run tellJoke '"chicken"' -- npx tsx src/index.ts
>         ```
>
> -   **Get a trace**: `genkit trace:get <traceId>`
>     -   Retrieves detailed information for a specific trace by its ID. This is particularly useful for debugging failed model calls, inspecting tool execution, or analyzing the exact inputs and outputs of a specific step in your flow.
>     -   **Machine-readable output**: add `--format json` (e.g. `genkit trace:get <traceId> --format json`) to get clean JSON you can pipe into `jq` or other parsers.

`skills/developing-genkit-js/SKILL.md`, "Development Workflow" step 5 and "CLI Usage":

> -   Verify with traces, not a blind run. Running the app directly (`node`/`tsx`/`npm start`) does **not** capture dev traces.
>
> **Non-interactive use (agents/CI):** add the global `--non-interactive` flag before `--` so the CLI uses defaults and never blocks on a prompt (e.g. the first-run analytics notice): `genkit start --non-interactive -- npx tsx src/index.ts` (works with `flow:run` too).

So the `rules` and `mcp` arms are told not to run `genkit flow:run` and to lean on the MCP
server's `start_runtime` (which only `mcp` has); the `cli` arm is told to run
`genkit flow:run ... --non-interactive` and `genkit trace:get <id> --format json` itself. Tool adoption is read from the transcript, so this
is a finding to report, not something to normalise away.

## The skill.git call in environments.ts

reeval 0.9.0 scans a git skill source one level deep: the directory itself, or its immediate
subdirectories, must hold `SKILL.md`. Unlike `skill.registry`, `skill.git` does not try `skills/`
on its own, and this repository's root has only `README.md` and `skills/`. A call
without `path` fails each attempt as an infra error (`Skill source github:genkit-ai/skills#d02d49da...
has no SKILL.md (and no subdirectories with one)`). `evals/environments.ts` passes `path: 'skills'`:

```ts
export const PINS = {
  genkitCli: '1.44.1',
  skillSha: 'd02d49da3a77687914715188d495999170bbf48b',
} as const

skill.git('github:genkit-ai/skills', {
  ref: PINS.skillSha,
  path: 'skills',
  only: ['developing-genkit-js'],
})
```

The equivalent registry form (it does try `skills/`):

```ts
skill.registry('genkit-ai/skills@developing-genkit-js', { version: PINS.skillSha })
```

`DEFAULT_SKILL_EXCLUDE` (`/evals/`, `.history/`, `*.eval.ts`) removes nothing from this skill;
every `references/*.md` reaches the agent.

## Sandbox images

`docker({ install: ['npm i -g genkit-cli@1.44.1'] })` adds an install layer tagged
`reeval-install:<hash of base image id and commands>`, so the command list is part of the image
key; a different `genkit-cli` version builds a different layer. Base images for the four
harnesses at reeval 0.9.0: `reeval-sandbox:claude-code-1.0.152-patch.8edc594f`,
`reeval-sandbox:antigravity-0.1.6`, `reeval-sandbox:cursor-0.1.4`, `reeval-sandbox:codex-0.1.6`.
