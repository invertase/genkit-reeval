import { BUGS } from './bugs.ts'
import { study } from './study.ts'

study('fixes a broken Genkit agent', BUGS.filter((b) => b.kind === 'agent'), 'agents')
