import { describe, expect, it, vi } from 'vitest'
import type { HarnessSubscriptionStatus } from '../../shared/contract.js'
import { checkSubscription } from './subscription.js'

/** A stand-in for CLI discovery that answers `status` for every CLI and records which it was asked for. */
const discovery = (status: HarnessSubscriptionStatus) => vi.fn(async () => status)

describe('subscription connection check', () => {
  it('connects a CLI that is installed and signed in with a subscription without calling a model', async () => {
    const discover = discovery({ state: 'found', version: '2.1.3', signIn: 'subscription' })

    await expect(checkSubscription(discover, 'claude')).resolves.toEqual({
      state: 'connected', modelCalls: 0, maxOutputTokens: 1,
    })
    expect(discover).toHaveBeenCalledWith('claude')
  })

  it.each([
    [{ state: 'missing' }, 'cli-missing', 'codex'],
    [{ state: 'unsupported', version: '0.1.0' }, 'cli-unsupported', 'codex 0.1.0'],
    [{ state: 'found', version: '0.50.0', signIn: 'signed-out' }, 'cli-signed-out', 'codex 0.50.0'],
    [{ state: 'found', version: '0.50.0', signIn: 'other' }, 'cli-not-subscribed', 'codex 0.50.0'],
  ] as const)('names why a CLI found as %o cannot run the model', async (status, reason, detail) => {
    await expect(checkSubscription(discovery(status), 'codex')).resolves.toEqual({
      state: 'failed', reason, detail, modelCalls: 0, maxOutputTokens: 1,
    })
  })

  it('reports a discovery that fails as a failed check with its cleaned message', async () => {
    const discover = vi.fn(async (): Promise<HarnessSubscriptionStatus> => {
      throw new Error('claude auth status\ntimed out after 10 s')
    })

    await expect(checkSubscription(discover, 'claude')).resolves.toEqual({
      state: 'failed', reason: 'unknown', detail: 'claude auth status timed out after 10 s', modelCalls: 0, maxOutputTokens: 1,
    })
  })
})
