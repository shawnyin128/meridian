import type { CallFailure } from '../shared/contract.js'
import { CallError } from './call-error.js'
import type { VaultStore } from './vault.js'

/** Every store unopenedStore has made. */
const unopened = new WeakSet<VaultStore>()

/**
 * Returns a VaultStore standing in for a vault that could not be opened: calling any of its
 * methods throws a CallError for `failure` whose message is `reason`.
 */
export function unopenedStore(reason: string, failure: CallFailure): VaultStore {
  const store = new Proxy({} as VaultStore, {
    get: () => () => { throw new CallError(failure, reason) },
  })
  unopened.add(store)
  return store
}

/** Returns whether `store` stands in for a vault that could not be opened. */
export function isUnopenedStore(store: VaultStore): boolean {
  return unopened.has(store)
}
