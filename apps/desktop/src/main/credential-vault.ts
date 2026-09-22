import { safeStorage, type UtilityProcess } from 'electron'

type CredentialRequest = {
  type: 'credentials.request'
  id: number
  operation: 'encrypt' | 'decrypt'
  value: string
}

type CredentialResponse = {
  type: 'credentials.response'
  id: number
  ok: boolean
  value?: string
  replacement?: string
  error?: string
}

export type CredentialVaultCopy = {
  unavailable: string
  secureBackendMissing: string
  invalidCiphertext: string
  operationFailed: string
}

const DEFAULT_COPY: CredentialVaultCopy = {
  unavailable: 'The operating system credential vault is unavailable. The API key was not saved.',
  secureBackendMissing: 'No secure system credential vault was found. The API key was not saved.',
  invalidCiphertext: 'The saved API key is invalid.',
  operationFailed: 'The system credential vault operation failed.',
}

const requestOf = (message: unknown): CredentialRequest | null => {
  if (typeof message !== 'object' || message === null) return null
  const held = message as Partial<CredentialRequest>
  if (held.type !== 'credentials.request' || !Number.isInteger(held.id)
    || (held.operation !== 'encrypt' && held.operation !== 'decrypt')
    || typeof held.value !== 'string') return null
  return held as CredentialRequest
}

const requireSecureBackend = async (copy: CredentialVaultCopy) => {
  if (!await safeStorage.isAsyncEncryptionAvailable()) {
    throw new Error(copy.unavailable)
  }
  if (process.platform === 'linux') {
    const backend = safeStorage.getSelectedStorageBackend()
    if (backend === 'basic_text' || backend === 'unknown') {
      throw new Error(copy.secureBackendMissing)
    }
  }
}

const strictBase64 = (value: string, copy: CredentialVaultCopy): Buffer => {
  if (value === '' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(copy.invalidCiphertext)
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.toString('base64') !== value) throw new Error(copy.invalidCiphertext)
  return decoded
}

/** Handle only credential requests from the isolated Core utility process. */
export function attachCredentialVault(
  core: UtilityProcess,
  copyOf: () => CredentialVaultCopy = () => DEFAULT_COPY,
): void {
  core.on('message', (message: unknown) => {
    const request = requestOf(message)
    if (request === null) return
    void (async () => {
      const copy = copyOf()
      await requireSecureBackend(copy)
      if (request.operation === 'encrypt') {
        const encrypted = await safeStorage.encryptStringAsync(request.value)
        return { value: encrypted.toString('base64') }
      }
      const opened = await safeStorage.decryptStringAsync(strictBase64(request.value, copy))
      const replacement = opened.shouldReEncrypt
        ? (await safeStorage.encryptStringAsync(opened.result)).toString('base64')
        : undefined
      return {
        value: opened.result,
        ...(replacement === undefined ? {} : { replacement }),
      }
    })().then(
      (result) => core.postMessage({
        type: 'credentials.response', id: request.id, ok: true, ...result,
      } satisfies CredentialResponse),
      (cause: unknown) => core.postMessage({
        type: 'credentials.response', id: request.id, ok: false,
        error: cause instanceof Error ? cause.message : copyOf().operationFailed,
      } satisfies CredentialResponse),
    )
  })
}
