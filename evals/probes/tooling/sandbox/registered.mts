// Run as `tsx ~/.verify-registered.mts` in the workspace; prints one `PROBE_RESULT {"keys":[...]}` line, the evaluator actions the app registers.
import path from 'node:path'

const { ai } = await import(path.resolve(process.cwd(), 'src/ai.ts'))
await import(path.resolve(process.cwd(), 'src/index.ts'))
const registry = ai.registry
const listed: Record<string, unknown> = await (registry.listResolvableActions ?? registry.listActions).call(registry)
console.log('PROBE_RESULT ' + JSON.stringify({ keys: Object.keys(listed).filter((k) => k.startsWith('/evaluator/')) }))
process.exit(0)
