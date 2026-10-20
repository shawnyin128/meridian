import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { callFailure } from '../call-error.js'
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

  it('fails a key the OS store could not seal as key-unsaved and one it could not open as key-unreadable', async () => {
    const port = new FakeCredentialPort()
    const vault = createMainCredentialVault(port, 100)
    const sealed = vault.seal('secret').catch((error: unknown) => error)
    const opened = vault.open('ciphertext').catch((error: unknown) => error)
    port.respond({ type: 'credentials.response', id: 1, ok: false, error: 'The API key was not saved.' })
    port.respond({ type: 'credentials.response', id: 2, ok: false, error: 'The saved API key is invalid.' })

    expect(callFailure(await sealed)).toBe('key-unsaved')
    expect(callFailure(await opened)).toBe('key-unreadable')
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
