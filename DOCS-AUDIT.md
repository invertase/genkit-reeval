# Genkit docs audit

Fetched: 2026-11-02T12:27:32.728Z (UTC). Regenerate with `pnpm -s tsx scripts/docs-audit.ts`.

Every fact below is **live**: fetched from the URL shown at the time above, or read from a GitHub tree pinned by commit sha. No agent ran. Verdicts say whether an external claim holds against the fetched text; `unverified` means a fetch failed.

Pinned commits:

- genkit-ai/genkit: `effdb1471a969cecdffce741de036b62b0541fbf`
- genkit-ai/skills: `196e1f64a6915fbe5ab507e8119f9eef6c18a1f5`
- google/skills: `928940c02e9973dbf31322fb5463dff0a53e9d8e`

## Candidate findings

Ranked by how likely a coding agent is to trip on it. Rank 1 breaks code, rank 5 is noise.

1. (rank 1) https://genkit.dev/llms-js.txt has 4 x `ai.chat(` in fenced code on pages not marked deprecated: "Defining AI workflows" (1), "Tool calling" (1), "Pause generation using interrupts" (1), "Chat with a PDF file" (1), although the same bundle says `The 'ai.chat()' API is deprecated.`.
2. (rank 3) The website rules file https://genkit.dev/GENKIT.js.md is titled `# Genkit Node.js API Rules (v1.20.0)`, while `npm view genkit version` is 1.43.0 (repo CLI pin `genkit-cli 1.44.1`). It differs by 74 + 55 lines from `evals/rules/GENKIT.md`, the template `genkit init:ai-tools` writes in genkit-cli 1.44.1, yet both carry the same title, so an agent cannot tell which is current.
3. (rank 3) `github.com/genkit-ai/genkit/go` (the path an agent would guess from the repo URL github.com/genkit-ai/genkit) resolves on proxy.golang.org but its go.mod declares `github.com/firebase/genkit/go`, so `go get github.com/genkit-ai/genkit/go` fails with a module path mismatch. The fetched llms bundles use it 0 x.
4. (rank 4) npm shows no deprecation for `genkitx-mcp` (latest 1.14.1), although `@genkit-ai/mcp` is the maintained package; nothing at install time warns an agent off it.

## 1. Which skills exist, per source

Claim: an agent that starts from a language's `develop-with-ai` page cannot find that language's skill. Verdict per page: `refuted` if the page names the skill for its own language or shows `npx skills add genkit-ai/skills`, `confirmed` if it does neither, `unverified` if the fetch failed. The genkit-ai/skills tree is the reference (from source, pinned sha `196e1f64a6915fbe5ab507e8119f9eef6c18a1f5`); `npx skills add genkit-ai/skills` appears in the skills README and the tree holds 4 skills.

| Docs page | Fetch | Skills named | Own-language skill | Shows npx skills add genkit-ai/skills | Verdict |
| --- | --- | --- | --- | --- | --- |
| https://genkit.dev/docs/js/develop-with-ai.md | 200 | `developing-genkit-js` | `developing-genkit-js` named | yes | refuted |
| https://genkit.dev/docs/go/develop-with-ai.md | 200 | `developing-genkit-go` | `developing-genkit-go` named | yes | refuted |
| https://genkit.dev/docs/python/develop-with-ai.md | 200 | none | `developing-genkit-python` not named | yes | refuted |
| https://genkit.dev/docs/dart/develop-with-ai.md | 200 | none | `developing-genkit-dart` not named | yes | refuted |

Other sources. Verdict: `confirmed` if the source names none of the skills in the reference tree, `partly` if it names some, `refuted` if it names all.

| Source | Skills named | Fetch | Verdict |
| --- | --- | --- | --- |
| https://github.com/genkit-ai/genkit README @ effdb1471a | `developing-genkit-dart`, `developing-genkit-go`, `developing-genkit-js`, `developing-genkit-python` | ok | refuted |
| https://github.com/genkit-ai/skills README @ 196e1f64a6 | `developing-genkit-dart`, `developing-genkit-go`, `developing-genkit-js`, `developing-genkit-python` | ok | refuted |
| https://github.com/genkit-ai/skills tree @ 196e1f64a6 | `developing-genkit-dart`, `developing-genkit-go`, `developing-genkit-js`, `developing-genkit-python` | ok | - |
| https://github.com/google/skills tree @ 928940c02e | `developing-genkit-dart`, `developing-genkit-go`, `developing-genkit-js`, `developing-genkit-python` | ok | refuted |

| Claim | Evidence | Verdict |
| --- | --- | --- |
| google/skills carries developing-genkit-python | `skills/cloud/developing-genkit-python/SKILL.md` present; genkit paths found: `skills/cloud/developing-genkit-dart/SKILL.md`, `skills/cloud/developing-genkit-go/SKILL.md`, `skills/cloud/developing-genkit-js/SKILL.md`, `skills/cloud/developing-genkit-python/SKILL.md` (sha `928940c02e9973dbf31322fb5463dff0a53e9d8e`) | confirmed |

## 2. Stale content on /docs/develop-with-ai

Claim: the page still documents `genkit init:ai-tools` and embeds "Genkit Node.js API Rules (v1.20.0)". Verdict `confirmed` means the text is on the fetched page.

| Page | Needle | Count | Excerpt | Verdict |
| --- | --- | --- | --- | --- |
| https://genkit.dev/docs/develop-with-ai (final https://genkit.dev/docs/js/develop-with-ai/) | `init:ai-tools` | 0 | `` | refuted |
| https://genkit.dev/docs/develop-with-ai (final https://genkit.dev/docs/js/develop-with-ai/) | `Genkit Node.js API Rules` | 0 | `` | refuted |
| https://genkit.dev/docs/develop-with-ai (final https://genkit.dev/docs/js/develop-with-ai/) | `v1.20.0` | 0 | `` | refuted |
| https://genkit.dev/docs/develop-with-ai (final https://genkit.dev/docs/js/develop-with-ai/) | `GENKIT.md` | 0 | `` | - |
| https://genkit.dev/docs/js/develop-with-ai/ | `init:ai-tools` | 0 | `` | refuted |
| https://genkit.dev/docs/js/develop-with-ai/ | `Genkit Node.js API Rules` | 0 | `` | refuted |
| https://genkit.dev/docs/js/develop-with-ai/ | `v1.20.0` | 0 | `` | refuted |
| https://genkit.dev/docs/js/develop-with-ai/ | `GENKIT.md` | 0 | `` | - |
| https://genkit.dev/docs/js/develop-with-ai.md | `init:ai-tools` | 0 | `` | refuted |
| https://genkit.dev/docs/js/develop-with-ai.md | `Genkit Node.js API Rules` | 0 | `` | refuted |
| https://genkit.dev/docs/js/develop-with-ai.md | `v1.20.0` | 0 | `` | refuted |
| https://genkit.dev/docs/js/develop-with-ai.md | `GENKIT.md` | 0 | `` | - |

## 3. Hosted rules files

| URL | Size | Title line | Version in title | Needle counts | Gemini models |
| --- | --- | --- | --- | --- | --- |
| https://genkit.dev/GENKIT.js.md | 10710 bytes | `# Genkit Node.js API Rules (v1.20.0)` | 1.20.0 | `ai.chat(` x0, `@genkit-ai/googleai` x0, `@genkit-ai/vertexai` x0, `genkitx-mcp` x0, `init:ai-tools` x0, `github.com/firebase/genkit/go` x0, `github.com/genkit-ai/genkit/go` x0 | `gemini-2.5-pro` x4, `gemini-2.5-flash-preview-tts` x3, `gemini-2.5-flash` x1, `gemini-2.5-flash-image-preview` x1 |
| https://genkit.dev/GENKIT.go.md | 8745 bytes | `# Genkit Go API rules` | none in title | `ai.chat(` x0, `@genkit-ai/googleai` x0, `@genkit-ai/vertexai` x0, `genkitx-mcp` x0, `init:ai-tools` x0, `github.com/firebase/genkit/go` x29, `github.com/genkit-ai/genkit/go` x0 | `gemini-2.5-flash-preview-tts` x2, `gemini-2.5-pro` x2, `gemini-2.5-flash` x1, `gemini-2.5-flash-image-preview` x1 |

| Comparison | Diff size (line level, from source) | Titles | Models |
| --- | --- | --- | --- |
| GENKIT.js.md vs evals/rules/GENKIT.md (identical to the template in the installed genkit-cli 1.44.1) | 74 lines only in vendored, 55 lines only on website (vendored 388 lines, website 369) | vendored title `# Genkit Node.js API Rules (v1.20.0)` | vendored models: `gemini-3-flash-preview` x4, `gemini-2.5-flash-preview-tts` x3, `gemini-3-pro-image-preview` x2, `gemini-2.5-flash` x1, `gemini-2.5-flash-image` x1, `gemini-2.5-pro` x1, `gemini-3-pro-preview` x1 |

## 4. llms.txt and the per-language bundles

### 4a. Gemini model names

| URL | Size | Models by count | Families |
| --- | --- | --- | --- |
| https://genkit.dev/llms.txt | 7285 bytes | none | 1.5: 0, 2.0: 0, 2.5: 0, 3: 0, latest aliases: 0 |
| https://genkit.dev/llms-js.txt | 986242 bytes | `gemini-flash-latest` x100, `gemini-3.1-pro-preview` x9, `gemini-pro-latest` x8, `gemini-3.8-flash` x7, `gemini-3.8-flash-tts` x6, `gemini-3-pro-image` x5, `gemini-3.5-flash` x5, `gemini-3.8-flash-lite-tts` x5, `gemini-4-argon` x4, `gemini-flash-lite-latest` x4, `gemini-3.1-flash-tts-preview` x2, `gemini-3.5-flash-lite` x2, +3 more | 1.5: 0, 2.0: 0, 2.5: 2, 3: 42, latest aliases: 112 |
| https://genkit.dev/llms-go.txt | 1358985 bytes | `gemini-flash-latest` x104, `gemini-3.8-flash` x9, `gemini-3.1-flash-image` x7, `gemini-pro-latest` x5, `gemini-2.5-flash` x4, `gemini-2.5-flash-lite` x3, `gemini-2.5-pro` x3, `gemini-3.1-flash-tts-preview` x3, `gemini-flash-lite-latest` x3, `gemini-2.5-flash-image` x2, `gemini-3-flash-preview` x2, `gemini-3-pro-image` x2, +13 more | 1.5: 0, 2.0: 0, 2.5: 17, 3: 38, latest aliases: 112 |
| https://genkit.dev/llms-python.txt | 534967 bytes | `gemini-flash-latest` x63, `gemini-3.8-flash` x10, `gemini-pro-latest` x5, `gemini-3.1-flash-image` x4, `gemini-3.1-pro-preview` x4, `gemini-3-pro-image` x3, `gemini-3.5-flash-lite` x3, `gemini-3.1-flash-tts-preview` x2, `gemini-2.5-flash-preview-tts` x1, `gemini-2.5-pro-preview-tts` x1 | 1.5: 0, 2.0: 0, 2.5: 2, 3: 26, latest aliases: 68 |
| https://genkit.dev/llms-dart.txt | 440102 bytes | `gemini-flash-latest` x69, `gemini-3.1-flash-image` x5, `gemini-3.8-flash` x4, `gemini-pro-latest` x3, `gemini-3-pro-image` x1, `gemini-3.1-flash-tts-preview` x1, `gemini-3.1-pro-preview` x1, `gemini-3.5-flash-lite` x1, `gemini-flash-lite-latest` x1 | 1.5: 0, 2.0: 0, 2.5: 0, 3: 13, latest aliases: 73 |

### 4b. Watched package names and commands (occurrence counts)

Raw substring counts. Candidate findings count `ai.chat(` only in fenced code on pages not marked deprecated.

| Bundle | `@genkit-ai/googleai` | `@genkit-ai/vertexai` | `genkitx-mcp` | `ai.chat(` | `init:ai-tools` | `@genkit-ai/googleai` lines not framed as previous or replacement |
| --- | --- | --- | --- | --- | --- | --- |
| index | 0 | 0 | 0 | 0 | 0 | 0 |
| js | 1 | 15 | 0 | 10 | 0 | 0 |
| go | 0 | 1 | 0 | 0 | 0 | 0 |
| python | 0 | 1 | 0 | 0 | 0 | 0 |
| dart | 0 | 1 | 0 | 0 | 0 | 0 |

### 4c. Go module path (occurrence counts)

| Bundle | `github.com/firebase/genkit/go` | `github.com/genkit-ai/genkit/go` |
| --- | --- | --- |
| index | 0 | 0 |
| js | 7 | 0 |
| go | 531 | 0 |
| python | 0 | 0 |
| dart | 0 | 0 |

### 4d. Stability label for the Agents API

| Language | Label sentence | Import markers | Fallback line (when no sentence) |
| --- | --- | --- | --- |
| js | `beta` x11 | genkit/beta x53, genkit/experimental x2, experimental.dart x0 | - |
| go | `beta` x11 | genkit/beta x18, genkit/experimental x2, experimental.dart x0 | - |
| python | `beta` x10 | genkit/beta x15, genkit/experimental x0, experimental.dart x0 | - |
| dart | `beta` x11 | genkit/beta x17, genkit/experimental x34, experimental.dart x17 | - |

## 5. Legacy pages

| URL | Redirect chain | Final URL | Status | Needles on final page | Verdict |
| --- | --- | --- | --- | --- | --- |
| https://firebase.google.com/docs/genkit | 301 https://firebase.google.com/docs/genkit -> https://genkit.dev/ ; 200 https://genkit.dev/ | https://genkit.dev/ | 200 | `@genkit-ai/googleai` x0, `gemini20Flash` x0, `gemini-2.0-flash` x0 | refuted |

Verdict: `confirmed` if the page an agent lands on still shows the old package or model; `refuted` if it redirects away and none appear.

## 6. npm facts (`npm view`, latest dist-tag)

| Package | Latest | Deprecation message | dist-tags | Last modified |
| --- | --- | --- | --- | --- |
| @genkit-ai/googleai | 1.28.0 | `Use @genkit-ai/google-genai package instead. See: https://genkit.dev/docs/js/integrations/google-genai/` | latest=1.28.0, next=1.29.0-rc.0 | 2026-03-26T20:15:27.857Z |
| @genkit-ai/google-genai | 1.43.0 | not deprecated | latest=1.43.0, next=1.43.0-rc.3 | 2026-10-21T19:23:19.619Z |
| @genkit-ai/vertexai | 1.43.0 | not deprecated | latest=1.43.0, next=1.43.0-rc.3 | 2026-10-21T19:24:39.353Z |
| genkitx-mcp | 1.14.1 | not deprecated | next=1.14.0-rc.0, latest=1.14.1 | 2025-07-10T22:07:01.193Z |
| @genkit-ai/mcp | 1.43.0 | not deprecated | latest=1.43.0, next=1.43.0-rc.3 | 2026-10-21T19:26:55.317Z |
| genkit-cli | 1.44.1 | not deprecated | next=1.39.0-rc.0, latest=1.44.1 | 2026-10-06T18:35:13.901Z |

## 7. Go module proxy

| Module requested | URL | Status | Response | Resolves | go.mod declares | Path matches |
| --- | --- | --- | --- | --- | --- | --- |
| github.com/firebase/genkit/go | https://proxy.golang.org/github.com/firebase/genkit/go/@latest | 200 | `{"Version":"v1.14.0","Time":"2026-10-19T19:24:58Z","Origin":{"VCS":"git","URL":"https://github.com/firebase/genkit","Subdir":"go","Hash":"6b34d5fe691002a217e112` | yes | github.com/firebase/genkit/go | yes |
| github.com/genkit-ai/genkit/go | https://proxy.golang.org/github.com/genkit-ai/genkit/go/@latest | 200 | `{"Version":"v1.14.0","Time":"2026-10-19T19:24:58Z","Origin":{"VCS":"git","URL":"https://github.com/genkit-ai/genkit","Subdir":"go","Hash":"6b34d5fe691002a217e11` | yes | github.com/firebase/genkit/go | no |
