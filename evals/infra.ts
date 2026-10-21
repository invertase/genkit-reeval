import type { Turn } from 'reeval'

/** Provider-side failures that stop an agent before it can work: billing, quota, rate limits. */
const PROVIDER_FAILURE = /credit balance|insufficient[_ ]quota|quota exceeded|RESOURCE_EXHAUSTED|billing|rate[_ ]limit|overloaded_error/i

/** Error events in the turn that come from the model provider, not from the agent's work. */
export const providerErrors = (turn: Turn): string[] =>
  turn.transcript.flatMap((e) => (e.type === 'error' && PROVIDER_FAILURE.test(e.message) ? [e.message] : []))
