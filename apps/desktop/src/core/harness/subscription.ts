import type { HarnessCli, HarnessSubscriptionStatus } from '../../shared/contract.js'
import type { CliDiscovery } from './cli/discovery.js'

/**
 * What Settings shows of subscription CLI `cli`, as `discover` finds it: missing, or installed with
 * its version and how it is signed in. The binary's path stays in Core.
 */
export async function subscriptionStatus(
  cli: HarnessCli,
  discover: (cli: HarnessCli) => Promise<CliDiscovery>,
): Promise<HarnessSubscriptionStatus> {
  const found = await discover(cli)
  if (!found.installed) return { state: 'missing' }
  return { state: 'found', version: found.version, signIn: found.signIn }
}
