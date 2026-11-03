import { probeErrors } from './probe.ts'
import { SUITES } from './registry.ts'

const errors = probeErrors(Object.values(SUITES).flat())
if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('OK')
