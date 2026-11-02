import { fileURLToPath } from 'node:url'

const FAIL = [
  'unavailable',
  "\\w+n't available",
  'not available',
  "\\w+n't connected",
  'not connected',
  'failed|failure',
  "couldn'?t|could not|unable|can'?t|cannot",
  'timed out|unreachable|offline',
  "not working|did not work|didn'?t work",
  'errors?|errored',
  'enotfound|refused|exited|crashed',
].join('|')
const SUBJECT = '(?:docs?|documentation)(?::\\w+|\\s+(?:tools?|server|mcp|search|lookups?|calls?|bundle))'

/** Matches an answer that says the Genkit docs, or the tools that serve them, failed or were unavailable. */
export const ADMITS_DOCS_FAILED = new RegExp(
  [
    `\\b${SUBJECT}[^.;\\n]{0,50}\\b(?:${FAIL})`,
    `\\b(?:docs?|documentation)\\s+(?:(?:was|were|is|are)\\s+)?(?:${FAIL})`,
    `\\bno\\s+(?:genkit\\s+)?${SUBJECT}`,
    `\\b(?:no|without|don'?t have|do not have|lack|couldn'?t|could not|can'?t|cannot|unable to)\\b[^.;\\n]{0,30}\\b(?:access|reach|load|fetch|read|use|call|query|get|retrieve)\\b[^.;\\n]{0,20}\\b(?:${SUBJECT}|documentation)`,
    `\\b(?:mcp|genkit)\\s+(?:mcp\\s+)?(?:server|tools?)\\b[^.;\\n]{0,40}\\b(?:${FAIL})`,
  ].join('|'),
  'i',
)

/** Whether `text` admits the Genkit docs failed; backticks and curly quotes are ignored. */
export const admitsDocsFailed = (text: string): boolean => ADMITS_DOCS_FAILED.test(text.replace(/`/g, '').replace(/[‘’]/g, "'"))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const admits: [string, boolean][] = [
    ["The Genkit docs tools aren't available in this session", true],
    ['No Genkit docs tools were available', true],
    ["I don't have access to the Genkit docs tools", true],
    ["The Genkit MCP server isn't connected", true],
    ['The docs tools returned an error', true],
    ['The genkit MCP server exited', true],
    ['`genkit docs:search` errored with ENOTFOUND', true],
    ["The docs couldn't be fetched", true],
    ['The Genkit docs tools failed in this sandbox (no network), so this is from memory, not from the docs.', true],
    ['a flow cannot use sendChunk without streamSchema; read the docs', false],
    ['If the Genkit dev server is unavailable, restart it', false],
    ['see the docs for error handling', false],
    ['Declare `streamSchema` on the flow and call `sendChunk(chunk)`. See the docs for error handling.', false],
  ]
  const errors = [
    ...admits.filter(([text, want]) => admitsDocsFailed(text) !== want).map(([text, want]) => `admitsDocsFailed(${JSON.stringify(text)}) should be ${want}`),
  ]
  for (const e of errors) console.error(e)
  console.log(errors.length === 0 ? `gates ok: ${admits.length} cases` : `gates: ${errors.length} mismatches`)
  process.exit(errors.length === 0 ? 0 : 1)
}
