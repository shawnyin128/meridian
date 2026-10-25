import type {
  HarnessCli, HarnessModelConnectionCheckResult, HarnessModelConnectionFailure, HarnessSubscriptionStatus,
} from '../../shared/contract.js'
import { sanitizeModelConnectionDetail } from './chat.js'

/**
 * Finds subscription CLI `cli` on this machine without a shell PATH and reports whether it is
 * installed, its version, and how it is signed in. Never reads or returns the CLI's credentials.
 */
export type SubscriptionDiscovery = (cli: HarnessCli) => Promise<HarnessSubscriptionStatus>

/**
 * Checks, as `discover` finds it, that subscription CLI `cli` can run the model: installed, in a
 * version Meridian runs, and signed in with a subscription. Calls no model. A discovery that fails
 * is a failed check whose detail is its cleaned message.
 */
export async function checkSubscription(
  discover: SubscriptionDiscovery,
  cli: HarnessCli,
): Promise<HarnessModelConnectionCheckResult> {
  const failed = (reason: HarnessModelConnectionFailure, detail: string) => ({
    state: 'failed' as const, reason, detail, modelCalls: 0 as const, maxOutputTokens: 1 as const,
  })
  let status: HarnessSubscriptionStatus
  try {
    status = await discover(cli)
  } catch (cause) {
    return failed('unknown', sanitizeModelConnectionDetail(cause instanceof Error ? cause.message : String(cause)) || cli)
  }
  if (status.state === 'missing') return failed('cli-missing', cli)
  if (status.state === 'unsupported') return failed('cli-unsupported', `${cli} ${status.version}`)
  if (status.signIn === 'signed-out') return failed('cli-signed-out', `${cli} ${status.version}`)
  if (status.signIn === 'other') return failed('cli-not-subscribed', `${cli} ${status.version}`)
  return { state: 'connected', modelCalls: 0, maxOutputTokens: 1 }
}
