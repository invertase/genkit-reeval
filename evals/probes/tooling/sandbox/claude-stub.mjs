#!/usr/bin/env node
// Stands in for Claude Code's `claude mcp add|get|list|remove` in the sandbox, which has no `claude` on PATH.
// Parses argv with the rules of the real CLI's option parser (commander): options may sit anywhere, `--` ends them,
// an unknown option is an error, and `-e` and `-H` take every argument up to the next option.
// Every invocation is appended to `~/.claude-stub/log.jsonl`.
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.HOME ?? '/home/reeval'
const LOG = path.join(HOME, '.claude-stub/log.jsonl')
const USER_FILE = path.join(HOME, '.claude.json')
const argv = process.argv.slice(2)

const out = []
const err = []
let code = 0
const say = (line) => out.push(line)
const fail = (line, status = 1) => {
  err.push(line)
  code = status
}

const ADD_HELP = `Usage: claude mcp add [options] <name> <commandOrUrl> [args...]

Add an MCP server to Claude Code.

Examples:
  # Add HTTP server:
  claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

  # Add HTTP server with headers:
  claude mcp add --transport http corridor https://app.corridor.dev/api/mcp
--header "Authorization: Bearer ..."

  # Add stdio server with environment variables:
  claude mcp add my-server -e API_KEY=xxx -- npx my-mcp-server

  # Add stdio server with subprocess flags:
  claude mcp add my-server -- my-command --some-flag arg1

Options:
  --callback-port <port>       Fixed port for OAuth callback (for servers
                               requiring pre-registered redirect URIs)
  --client-id <clientId>       OAuth client ID for HTTP/SSE servers
  --client-secret              Prompt for OAuth client secret (or set
                               MCP_CLIENT_SECRET env var)
  -e, --env <env...>           Set environment variables (e.g. -e KEY=value)
  -H, --header <header...>     Set headers for HTTP/SSE servers (e.g. -H
                               "X-Api-Key: abc123" -H "X-Custom: value")
  -h, --help                   Display help for command
  -s, --scope <scope>          Configuration scope (local, user, or project)
                               (default: "local")
  -t, --transport <transport>  Transport type (stdio, sse, http). Defaults to
                               stdio if not specified.`

const SCOPES = ['local', 'user', 'project']
const OPTIONS = {
  '--callback-port': { key: 'callbackPort', value: 'one' },
  '--client-id': { key: 'clientId', value: 'one' },
  '--client-secret': { key: 'clientSecret', value: 'none' },
  '-e': { key: 'env', value: 'many' },
  '--env': { key: 'env', value: 'many' },
  '-H': { key: 'header', value: 'many' },
  '--header': { key: 'header', value: 'many' },
  '-h': { key: 'help', value: 'none' },
  '--help': { key: 'help', value: 'none' },
  '-s': { key: 'scope', value: 'one' },
  '--scope': { key: 'scope', value: 'one' },
  '-t': { key: 'transport', value: 'one' },
  '--transport': { key: 'transport', value: 'one' },
}

/** Splits `args` into options and positionals the way commander does; returns an error line instead when it fails. */
function parseAdd(args) {
  const opts = {}
  const positional = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--') {
      positional.push(...args.slice(i + 1))
      break
    }
    if (arg.length < 2 || !arg.startsWith('-')) {
      positional.push(arg)
      continue
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const flag = eq > 0 ? arg.slice(0, eq) : arg
    const spec = OPTIONS[flag]
    if (!spec) return { error: `error: unknown option '${arg}'` }
    if (spec.value === 'none') {
      opts[spec.key] = true
      continue
    }
    const inline = eq > 0 ? [arg.slice(eq + 1)] : []
    if (spec.value === 'one') {
      const value = inline[0] ?? args[++i]
      if (value === undefined) return { error: `error: option '${flag} <${spec.key}>' argument missing` }
      opts[spec.key] = value
      continue
    }
    const values = [...inline]
    while (inline.length === 0 && i + 1 < args.length && !args[i + 1].startsWith('-')) values.push(args[++i])
    if (values.length === 0) return { error: `error: option '${flag} <${spec.key}...>' argument missing` }
    opts[spec.key] = [...(opts[spec.key] ?? []), ...values]
  }
  return { opts, positional }
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** Where the servers of `scope` live in `file`: the object that holds `mcpServers`. */
function holder(doc, scope) {
  if (scope !== 'local') return doc
  doc.projects ??= {}
  doc.projects[process.cwd()] ??= {}
  return doc.projects[process.cwd()]
}

const fileOf = (scope) => (scope === 'project' ? path.join(process.cwd(), '.mcp.json') : USER_FILE)

function add(args) {
  const parsed = parseAdd(args)
  if (parsed.error) return fail(parsed.error)
  const { opts, positional } = parsed
  if (opts.help) return say(ADD_HELP)
  if (positional.length < 1) return fail("error: missing required argument 'name'")
  if (positional.length < 2) return fail("error: missing required argument 'commandOrUrl'")
  const [name, commandOrUrl, ...rest] = positional
  const scope = opts.scope ?? 'local'
  if (!SCOPES.includes(scope)) return fail(`Invalid scope: ${scope}. Must be one of: local, user, project, dynamic, enterprise, claudeai, managed, agent`)
  const transport = opts.transport ?? 'stdio'
  if (!['stdio', 'sse', 'http', 'streamable-http'].includes(transport)) return fail(`Invalid transport type: ${transport}. Must be one of: stdio, sse, http (or streamable-http)`)
  const env = {}
  for (const pair of opts.env ?? []) {
    const at = pair.indexOf('=')
    if (at < 1) return fail(`Invalid environment variable format: ${pair}, environment variables should be added as: -e KEY1=value1 -e KEY2=value2`)
    env[pair.slice(0, at)] = pair.slice(at + 1)
  }
  const file = fileOf(scope)
  const doc = readJson(file) ?? {}
  const servers = (holder(doc, scope).mcpServers ??= {})
  if (name in servers) return fail(`MCP server ${name} already exists in ${scope === 'project' ? '.mcp.json' : `${scope} config`}`)
  if (transport === 'stdio') {
    servers[name] = { type: 'stdio', command: commandOrUrl, args: rest, env }
  } else {
    const headers = Object.fromEntries((opts.header ?? []).map((h) => [h.slice(0, h.indexOf(':')).trim(), h.slice(h.indexOf(':') + 1).trim()]))
    servers[name] = { type: transport === 'streamable-http' ? 'http' : transport, url: commandOrUrl, ...(Object.keys(headers).length > 0 ? { headers } : {}) }
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2))
  const what = transport === 'stdio' ? `stdio MCP server ${name} with command: ${[commandOrUrl, ...rest].join(' ')}` : `${transport.toUpperCase()} MCP server ${name} with URL: ${commandOrUrl}`
  say(`Added ${what} to ${scope} config`)
  if (transport !== 'stdio' && servers[name].headers) say(`Headers: ${JSON.stringify(servers[name].headers, null, 2)}`)
  say(`File modified: ${file}${scope === 'local' ? ` [project: ${process.cwd()}]` : ''}`)
}

/** Every server visible from the working directory, project scope first. */
function servers() {
  const project = readJson(fileOf('project'))?.mcpServers ?? {}
  const user = readJson(USER_FILE) ?? {}
  return { ...(user.mcpServers ?? {}), ...(user.projects?.[process.cwd()]?.mcpServers ?? {}), ...project }
}

function main() {
  if (argv[0] === '--version' || argv[0] === '-v') return say('2.1.316 (Claude Code)')
  if (argv[0] !== 'mcp') return fail('claude: only `claude mcp` is available in this sandbox')
  const [sub, ...rest] = argv.slice(1)
  if (sub === 'add') return add(rest)
  if (sub === 'list') {
    const all = servers()
    if (Object.keys(all).length === 0) return say("No MCP servers configured. Use `claude mcp add` to add a server.")
    say('Checking MCP server health...\n')
    for (const [name, s] of Object.entries(all)) say(`${name}: ${s.command ? [s.command, ...(s.args ?? [])].join(' ') : s.url}`)
    return
  }
  if (sub === 'get') {
    const s = servers()[rest[0]]
    if (!s) return fail(`No MCP server found with name: ${rest[0]}`)
    return say(JSON.stringify(s, null, 2))
  }
  if (sub === 'remove') {
    const name = rest.find((a) => !a.startsWith('-'))
    const scope = rest.includes('-s') ? rest[rest.indexOf('-s') + 1] : rest.includes('--scope') ? rest[rest.indexOf('--scope') + 1] : undefined
    for (const s of scope ? [scope] : SCOPES) {
      const file = fileOf(s)
      const doc = readJson(file)
      const held = doc && holder(doc, s).mcpServers
      if (held && name in held) {
        delete held[name]
        fs.writeFileSync(file, JSON.stringify(doc, null, 2))
        return say(`Removed MCP server ${name} from ${s} config`)
      }
    }
    return fail(`No MCP server found with name: "${name}"`)
  }
  return fail(`error: unknown command '${sub ?? ''}'`)
}

main()
fs.mkdirSync(path.dirname(LOG), { recursive: true })
fs.appendFileSync(LOG, `${JSON.stringify({ argv, cwd: process.cwd(), exit: code, stdout: out.join('\n'), stderr: err.join('\n') })}\n`)
if (out.length > 0) process.stdout.write(`${out.join('\n')}\n`)
if (err.length > 0) process.stderr.write(`${err.join('\n')}\n`)
process.exit(code)
