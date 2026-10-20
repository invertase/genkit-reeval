import { BUGS } from './bugs.ts'
import { study } from './study.ts'

study('fixes a broken Genkit app', BUGS.filter((b) => b.kind === 'flow'), 'flows')
