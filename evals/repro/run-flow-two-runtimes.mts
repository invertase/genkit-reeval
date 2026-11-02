// Usage: node evals/repro/run-flow-two-runtimes.mts   (Node 22+; set REPRO_DIR to reuse an installed work dir; needs network for npm only, no API key)
// Starts two Genkit dev runtimes with different `greet` flows, drives `genkit mcp` over stdio and prints which runtime
// answers `run_flow`. Case A: two apps in two directories. Case B: two runtimes in one project root, in both start orders.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = process.env.REPRO_DIR ?? mkdtempSync(join(tmpdir(), 'repro-two-runtimes-'));
const root = join(dir, 'root');
const second = join(root, 'second-app');
mkdirSync(join(second, 'src'), { recursive: true });
mkdirSync(join(root, 'src'), { recursive: true });
console.log(`work dir: ${dir}`);

writeFileSync(join(dir, 'package.json'), '{"name":"repro","private":true,"type":"module"}\n');
execFileSync(
  'npm',
  ['install', '--no-audit', '--no-fund', '--save-exact', 'genkit@1.42.0', 'genkit-cli@1.44.1', 'tsx', '@modelcontextprotocol/sdk@1.32.2'],
  { cwd: dir, stdio: 'ignore' },
);
const bin = join(dir, 'node_modules/.bin');
console.log(`genkit-cli: ${execFileSync(join(bin, 'genkit'), ['--version'], { cwd: dir, encoding: 'utf8' }).trim()}`);

// Each app's `greet` flow names the app, so the answer shows which runtime ran. Resolution of `genkit` walks up to `dir`.
const app = (label: string) => `import { genkit, z } from 'genkit';
const ai = genkit({});
ai.defineFlow({ name: 'greet', inputSchema: z.object({ customerName: z.string() }), outputSchema: z.string() },
  async ({ customerName }) => \`Hi \${customerName}, welcome to ${label}\`);
`;
writeFileSync(join(root, 'package.json'), '{"name":"root-app","private":true,"type":"module"}\n');
writeFileSync(join(second, 'package.json'), '{"name":"second-app","private":true,"type":"module"}\n');
writeFileSync(join(root, 'src/index.ts'), app('ROOT app'));
writeFileSync(join(second, 'src/index.ts'), app('SECOND app'));
writeFileSync(join(root, 'src/other.ts'), app('OTHER app (same root)'));

const client = `import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const [bin, ...args] = JSON.parse(process.argv[2]);
const callArgs = JSON.parse(process.argv[3] ?? '{}');
const client = new Client({ name: 'repro', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: bin, args, stderr: 'ignore' }));
const tools = (await client.listTools()).tools;
for (const name of ['list_flows', 'run_flow']) {
  const t = tools.find((x) => x.name === name);
  console.log(name + ' inputSchema properties: ' + JSON.stringify(Object.keys(t.inputSchema.properties ?? {})) + ', required: ' + JSON.stringify(t.inputSchema.required ?? []));
}
const listed = await client.callTool({ name: 'list_flows', arguments: callArgs.list ?? {} });
console.log('list_flows -> ' + listed.content[0].text.split('\\n').filter((l) => l.includes('Flow name')).join(' |'));
const ran = await client.callTool({ name: 'run_flow', arguments: { flowName: 'greet', input: '{"customerName":"Dana"}', ...(callArgs.run ?? {}) } });
console.log('run_flow greet -> ' + JSON.parse(ran.content[0].text).result);
await client.close();
`;
writeFileSync(join(dir, 'client.mts'), client);

const children: ChildProcess[] = [];
const blockers: Server[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const runtimeFiles = (cwd: string) => {
  const d = join(cwd, '.genkit', 'runtimes');
  return existsSync(d) ? readdirSync(d) : [];
};

/** Starts an app as `genkit start` would (GENKIT_ENV=dev) and waits for its runtime file. */
async function start(cwd: string, entry: string): Promise<void> {
  const before = runtimeFiles(cwd).length;
  // On macOS get-port misses a port held on 127.0.0.1, so the second runtime would collide on 3100; hold it on all interfaces so it moves on.
  for (let i = 0; i < children.length; i++) {
    const blocker = createServer().on('error', () => {});
    blocker.listen(3100 + i);
    blockers.push(blocker);
  }
  const env = { ...process.env, GENKIT_ENV: 'dev' };
  const child = spawn(join(bin, 'tsx'), [entry], { cwd, env, stdio: 'ignore', detached: true });
  children.push(child);
  for (let i = 0; i < 100 && runtimeFiles(cwd).length <= before; i++) await sleep(300);
  for (const b of blockers.splice(0)) b.close();
  if (runtimeFiles(cwd).length <= before) throw new Error(`no runtime file for ${entry}`);
}
async function stopAll(): Promise<void> {
  for (const c of children.splice(0)) {
    try {
      process.kill(-c.pid!, 'SIGTERM');
    } catch {}
  }
  await sleep(1500);
  for (const c of [root, second]) rmSync(join(c, '.genkit'), { recursive: true, force: true });
}

const mcp = (title: string, extra: string[], callArgs: object = {}) => {
  console.log(`\n--- ${title}`);
  console.log(`$ genkit mcp ${extra.join(' ')}`);
  const out = execFileSync(join(bin, 'tsx'), [join(dir, 'client.mts'), JSON.stringify([join(bin, 'genkit'), 'mcp', ...extra]), JSON.stringify(callArgs)], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120_000,
  });
  console.log(out.trim());
};

try {
  console.log('\n=== Case A: two apps, two directories (root first, then second-app)');
  await start(root, 'src/index.ts');
  await start(second, 'src/index.ts');
  console.log(`root/.genkit/runtimes: ${JSON.stringify(runtimeFiles(root))}`);
  console.log(`root/second-app/.genkit/runtimes: ${JSON.stringify(runtimeFiles(second))}`);
  mcp('A1: --project-root root', ['--project-root', root]);
  mcp('A2: --project-root root/second-app', ['--project-root', second]);
  mcp('A3: --explicit-project-root, projectRoot=root/second-app', ['--explicit-project-root'], {
    list: { projectRoot: second },
    run: { projectRoot: second },
  });
  await stopAll();

  for (const [first, next] of [['index', 'other'], ['other', 'index']]) {
    console.log(`\n=== Case B: two runtimes, one project root (${first}.ts first, then ${next}.ts)`);
    await start(root, `src/${first}.ts`);
    await sleep(1500);
    await start(root, `src/${next}.ts`);
    console.log(`root/.genkit/runtimes: ${JSON.stringify(runtimeFiles(root))}`);
    mcp(`B: --project-root root`, ['--project-root', root]);
    await stopAll();
  }
} finally {
  await stopAll();
}
