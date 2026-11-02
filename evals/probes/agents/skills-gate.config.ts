import { defineConfig } from 'reeval'
import { fakeSandbox } from 'reeval/sandbox'

export default defineConfig({
  include: ['skills-gate.check.ts'],
  sandbox: fakeSandbox(),
})
