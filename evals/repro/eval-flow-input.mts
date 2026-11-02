// Usage: node evals/repro/eval-flow-input.mts   (Node 22+; set REPRO_DIR to reuse an installed work dir; needs network for npm only, no API key)
// Builds a throwaway Genkit app with the faithfulness evaluator and a scripted judge model, then feeds
// `genkit eval:flow` the documented `{input, reference?}` shape inline and from a file, and the `{testCaseId, input}` shape inline.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = process.env.REPRO_DIR ?? mkdtempSync(join(tmpdir(), 'repro-eval-flow-'));
mkdirSync(join(dir, 'src'), { recursive: true });
console.log(`work dir: ${dir}`);

writeFileSync(join(dir, 'package.json'), '{"name":"repro","private":true,"type":"module"}\n');
execFileSync(
  'npm',
  ['install', '--no-audit', '--no-fund', '--save-exact', 'genkit@1.42.0', '@genkit-ai/evaluator@1.42.0', 'genkit-cli@1.44.1', 'tsx'],
  { cwd: dir, stdio: 'ignore' },
);

// `echo` needs no model. The judge is scripted: statement extraction, then one passing verdict per statement.
writeFileSync(
  join(dir, 'src/index.ts'),
  `import { GenkitMetric, genkitEval } from '@genkit-ai/evaluator';
import { genkit, z } from 'genkit';
import { genkitPlugin } from 'genkit/plugin';

const scripted = genkitPlugin('scripted', async (ai) => {
  ai.defineModel({ name: 'scripted/judge' }, async (req) => {
    const keys = Object.keys((req.output?.schema as { properties?: object } | undefined)?.properties ?? {});
    const json = keys.includes('statements')
      ? { statements: ['The answer repeats the question.'] }
      : { responses: [{ statement: 'The answer repeats the question.', reason: 'it does', verdict: true }] };
    return { message: { role: 'model', content: [{ text: JSON.stringify(json) }] } };
  });
});

const ai = genkit({ plugins: [scripted, genkitEval({ judge: 'scripted/judge', metrics: [GenkitMetric.FAITHFULNESS] })] });

ai.defineFlow({ name: 'echo', inputSchema: z.object({ text: z.string() }), outputSchema: z.string() }, async ({ text }) => text);
`,
);

const bin = join(dir, 'node_modules/.bin/genkit');
const run = (label: string, args: string[]) => {
  console.log(`\n=== ${label}`);
  console.log(`$ genkit ${args.join(' ')} -- npx tsx src/index.ts`);
  const r = spawnSync(bin, [...args, '--force', '--', 'npx', 'tsx', 'src/index.ts'], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
  const text = `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '').trim();
  console.log(text);
  console.log(`exit code: ${r.status}`);
};

console.log(`genkit-cli: ${execFileSync(bin, ['--version'], { cwd: dir, encoding: 'utf8' }).trim()}`);

const sample = { text: 'hello' };
writeFileSync(join(dir, 'doc-shape.json'), JSON.stringify([{ input: sample }]));

run('1. documented shape, inline: [{input}]', ['eval:flow', 'echo', JSON.stringify([{ input: sample }])]);
run('2. object, inline (the "{input, reference?}" reading): {input}', ['eval:flow', 'echo', JSON.stringify({ input: sample })]);
run('3. enforced shape, inline: [{testCaseId, input}]', ['eval:flow', 'echo', JSON.stringify([{ testCaseId: 't1', input: sample }])]);
run('4. documented shape from a file: --input doc-shape.json', ['eval:flow', 'echo', '--input', 'doc-shape.json']);
