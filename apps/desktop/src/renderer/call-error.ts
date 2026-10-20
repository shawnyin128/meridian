import type { CallFailure, ContractMethod } from '../shared/contract.js'

/** A rejected Core call with the reason Core gave. Its message names only the method and the reason. */
export class CallError extends Error {
  constructor(readonly method: ContractMethod, readonly reason: CallFailure) {
    super(`${method}: ${reason}`)
    this.name = 'CallError'
  }
}
