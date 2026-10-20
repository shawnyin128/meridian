import type { CallFailure } from '../shared/contract.js'
import { CallError } from './call-error.js'
import type { VaultStore } from './vault.js'

/**
 * Returns a VaultStore standing in for a vault that could not be opened: calling any of its
 * methods throws a CallError for `failure` whose message is `reason`.
 */
export function unopenedStore(reason: string, failure: CallFailure): VaultStore {
  return new Proxy({} as VaultStore, {
    get: () => () => { throw new CallError(failure, reason) },
  })
}
