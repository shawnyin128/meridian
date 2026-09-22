import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createMainCredentialVault } from './credential-vault.js'

class FakeCredentialPort extends EventEmitter {
  readonly postMessage = vi.fn()

  respond(data: object) {
    this.emit('message', { data })
  }
}

describe('Core credential vault client', () => {
  it('matches an OS credential response without exposing another response', async () => {
    const port = new FakeCredentialPort()
    const vault = createMainCredentialVault(port, 100)
    const sealed = vault.seal('secret')
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'credentials.request', id: 1, operation: 'encrypt', value: 'secret',
    })
    port.respond({ type: 'credentials.response', id: 99, ok: true, value: 'wrong' })
    port.respond({ type: 'credentials.response', id: 1, ok: true, value: 'ciphertext' })

    await expect(sealed).resolves.toBe('ciphertext')
  })

  it('rejects instead of hanging when the OS credential channel stops responding', async () => {
    vi.useFakeTimers()
    try {
      const port = new FakeCredentialPort()
      const vault = createMainCredentialVault(port, 100)
      const opened = vault.open('ciphertext')
      const rejected = expect(opened).rejects.toThrow('响应超时')
      await vi.advanceTimersByTimeAsync(100)

      await rejected
    } finally {
      vi.useRealTimers()
    }
  })
})
