// Run as `FLOW=<export> FIELDS=<a,b> tsx ~/.verify-flow.mts` in the workspace; prints one JSON line `{ errors }`.
import path from 'node:path'

const flowName = process.env.FLOW ?? ''
const fields = (process.env.FIELDS ?? '').split(',').filter(Boolean)
const tickets = [
  'I was charged twice for order A-1001 and I cannot place a new order until it is fixed.',
  'Could you add a gift receipt option to the checkout page? No rush.',
]
const errors: string[] = []
try {
  const app = await import(path.resolve(process.cwd(), 'src/index.ts'))
  const flow = app[flowName]
  if (typeof flow !== 'function') {
    errors.push(`src/index.ts does not export ${flowName}`)
  } else {
    if (flow.__action?.name !== flowName) errors.push(`the flow is registered as ${JSON.stringify(flow.__action?.name)}, not ${flowName}`)
    for (const text of tickets) {
      const out = await flow({ text })
      for (const field of fields) {
        if (typeof out?.[field] !== 'string' || out[field].trim() === '') errors.push(`${field} is not a non-empty string in ${JSON.stringify(out)}`)
      }
      if (!['low', 'medium', 'high'].includes(out?.priority)) errors.push(`priority is not low, medium or high in ${JSON.stringify(out)}`)
    }
  }
} catch (error) {
  errors.push(`the flow threw: ${error instanceof Error ? error.message : String(error)}`)
}
console.log(JSON.stringify({ errors }))
process.exit(0)
