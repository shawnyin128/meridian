import type { VaultStore } from './vault.js'

/**
 * Returns a VaultStore standing in for a vault that could not be opened: calling any of its
 * methods throws an Error whose message is `reason`.
 */
export function unopenedStore(reason: string): VaultStore {
  return new Proxy({} as VaultStore, {
    get: () => () => { throw new Error(reason) },
  })
}
