import { describe, expect, it, vi } from 'vitest'
import type { CliDiscovery } from './cli/discovery.js'
import { subscriptionStatus } from './subscription.js'

/** A stand-in for CLI discovery that answers `found` and records which CLI it was asked for. */
const discovery = (found: CliDiscovery) => vi.fn(async () => found)

describe('subscription status', () => {
  it('reports a CLI discovery does not find as missing', async () => {
    const discover = discovery({ cli: 'codex', installed: false })

    await expect(subscriptionStatus('codex', discover)).resolves.toEqual({ state: 'missing' })
    expect(discover).toHaveBeenCalledWith('codex')
  })

  it.each(['subscription', 'other', 'signed-out', 'unknown'] as const)(
    'reports an installed CLI signed in as %s with its version and never its path',
    async (signIn) => {
      const status = await subscriptionStatus('claude', discovery({
        cli: 'claude', installed: true, binary: '/Users/someone/.local/bin/claude', version: '2.1.280', signIn,
      }))

      expect(status).toEqual({ state: 'found', version: '2.1.280', signIn })
    },
  )

  it('reports an installed CLI whose version could not be read with no version', async () => {
    await expect(subscriptionStatus('claude', discovery({
      cli: 'claude', installed: true, binary: '/opt/homebrew/bin/claude', version: null, signIn: 'subscription',
    }))).resolves.toEqual({ state: 'found', version: null, signIn: 'subscription' })
  })
})
