import { readFileSync } from 'node:fs'
import type { Probe } from '../probe.ts'

const solution = (probe: string, file: string) => readFileSync(new URL(`./sandbox/solutions/${probe}/${file}`, import.meta.url), 'utf8')

/** The pinned Genkit Go module path and version: the module is still `firebase/genkit/go` although the repository moved to `genkit-ai/genkit`. */
export const GO_MODULE = 'github.com/firebase/genkit/go'

/** The pinned Genkit Go version, warmed into the Go image's module cache. */
export const GO_VERSION = 'v1.14.0'

const goMod = (module: string, requires: string) => `module example.com/${module}\n\ngo 1.25.0\n\nrequire ${requires} ${GO_VERSION}\n`

/** Installs the pinned Genkit Python packages into `.venv`, from the image's warm cache. */
const PY_INSTALL = 'uv venv --quiet && uv pip install --quiet genkit genkit-google-genai'

const FIXED = 'agent ran without provider errors'

const APP_KEY = 'The Gemini API key is in the GEMINI_API_KEY environment variable.'
const ORDERS = '`orders.json` in this directory maps each order id to its `status` and `eta`.'

const goNewApp: Probe = {
  name: 'go-new-app',
  prompt: `Create a Genkit Go app here whose \`main\` prints a one-line Gemini answer to 'What is Genkit?' and exits non-zero if the call fails. ${APP_KEY}`,
  checks: [FIXED, 'requires the genkit module', 'builds', 'runs and prints an answer', 'calls the model'],
  oracle: {
    files: { 'main.go': solution('go-new-app', 'good.go'), 'go.mod': goMod('hello', GO_MODULE) },
    exec: 'go mod tidy',
  },
  cheat: {
    files: { 'main.go': solution('go-new-app', 'cheat.go'), 'go.mod': goMod('hello', 'github.com/genkit-ai/genkit/go') },
    fails: ['requires the genkit module', 'builds', 'runs and prints an answer', 'calls the model'],
  },
}

const goAgentSession: Probe = {
  name: 'go-agent-session',
  prompt:
    'Build a customer support Genkit agent in this directory, as a Go module with `package main` in the project root. ' +
    `It answers customers' questions about their orders with Gemini and has a tool that looks an order up by id; ${ORDERS} ${APP_KEY}\n` +
    'The agent keeps a persistent session per customer, so that a conversation continues after the process restarts. Expose this in `package main`:\n' +
    '`func Ask(ctx context.Context, sessionID string, message string) (reply string, newSessionID string, err error)`\n' +
    'An empty `sessionID` starts a new conversation; an id that an earlier call returned continues that conversation, even from a new process. ' +
    '`Ask` sets up everything it needs itself. `main` may chat with the agent however you like.',
  checks: [FIXED, 'imports the agents packages', 'opts in to the experimental API', 'builds', 'second process knows the order'],
  oracle: {
    files: { 'main.go': solution('go-agent-session', 'good.go'), 'go.mod': goMod('support', GO_MODULE) },
    exec: 'go mod tidy',
  },
  cheat: {
    files: { 'main.go': solution('go-agent-session', 'cheat.go'), 'go.mod': goMod('support', GO_MODULE) },
    exec: 'go mod tidy',
    fails: ['second process knows the order'],
  },
}

const pyToolCalling: Probe = {
  name: 'py-tool-calling',
  prompt:
    'Create a Python app here with Genkit and one tool that looks up the status of an order by id; ' +
    `${ORDERS} ${APP_KEY}\n` +
    'Expose `async def ask(question: str) -> str` in `app.py`: it answers the question with Gemini, calling the tool to look orders up. ' +
    "Install the dependencies in this directory (a `.venv` here is fine) so that `python3 -c 'import app'` works when run from it.",
  checks: [FIXED, 'defines a Genkit tool', 'imports resolve', 'answers from the tool'],
  oracle: { files: { 'app.py': solution('py-tool-calling', 'good.py') }, exec: PY_INSTALL },
  cheat: { files: { 'app.py': solution('py-tool-calling', 'cheat.py') }, exec: PY_INSTALL, fails: ['answers from the tool'] },
}

const pyAgentSession: Probe = {
  name: 'py-agent-session',
  prompt:
    'Build a customer support Genkit agent in this directory, in Python. ' +
    `It answers customers' questions about their orders with Gemini and has a tool that looks an order up by id; ${ORDERS} ${APP_KEY}\n` +
    'The agent keeps a persistent session per customer, so that a conversation continues after the process restarts. Expose this in `app.py`:\n' +
    '`async def ask(session_id: str | None, message: str) -> tuple[str, str]`, returning the reply and the conversation\'s session id.\n' +
    'With `None` it starts a new conversation; an id that an earlier call returned continues that conversation, even from a new process. ' +
    "Install the dependencies in this directory (a `.venv` here is fine) so that `python3 -c 'import app'` works when run from it.",
  checks: [FIXED, 'defines the agent with define_agent', 'imports resolve', 'second process knows the order'],
  oracle: { files: { 'app.py': solution('py-agent-session', 'good.py') }, exec: PY_INSTALL },
  cheat: { files: { 'app.py': solution('py-agent-session', 'cheat.py') }, exec: PY_INSTALL, fails: ['second process knows the order'] },
}

const pySkillSetup: Probe = {
  name: 'py-skill-setup',
  prompt: 'Set up this project so a coding agent writes good Genkit Python code.',
  checks: [FIXED, 'adds Genkit guidance', 'guidance is for Python Genkit'],
  oracle: { files: { 'AGENTS.md': solution('py-skill-setup', 'good.md') } },
  cheat: { files: { 'AGENTS.md': solution('py-skill-setup', 'cheat.md') }, fails: ['guidance is for Python Genkit'] },
}

/** The agents suite's probes. */
export const PROBES: Probe[] = [goNewApp, goAgentSession, pyToolCalling, pyAgentSession, pySkillSetup]
