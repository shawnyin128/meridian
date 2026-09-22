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

type CredentialPort = {
  on(event: 'message', listener: (event: { data: unknown }) => void): void
  postMessage(message: CredentialRequest): void
}

export type OpenedCredential = {
  secret: string
  replacement?: string
}

export type CredentialVault = {
  seal(secret: string): Promise<string>
  open(ciphertext: string): Promise<OpenedCredential>
}

/** Narrow, time-bounded Core-to-Main client for OS-backed credential encryption and decryption. */
export function createMainCredentialVault(
  port: CredentialPort = process.parentPort,
  timeoutMs = 10_000,
): CredentialVault {
  let serial = 0
  const pending = new Map<number, {
    resolve: (response: CredentialResponse) => void
    reject: (cause: Error) => void
    timer: NodeJS.Timeout
  }>()

  port.on('message', (event) => {
    const response = event.data as Partial<CredentialResponse> | undefined
    if (response?.type !== 'credentials.response' || typeof response.id !== 'number') return
    const held = pending.get(response.id)
    if (held === undefined) return
    pending.delete(response.id)
    clearTimeout(held.timer)
    if (response.ok === true && typeof response.value === 'string') {
      held.resolve(response as CredentialResponse)
    } else {
      held.reject(new Error(response.error ?? '系统凭据库操作失败'))
    }
  })

  const request = (operation: CredentialRequest['operation'], value: string) => {
    const id = serial += 1
    return new Promise<CredentialResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('系统凭据库响应超时'))
      }, timeoutMs)
      timer.unref()
      pending.set(id, { resolve, reject, timer })
      port.postMessage({
        type: 'credentials.request', id, operation, value,
      } satisfies CredentialRequest)
    })
  }

  return {
    async seal(secret) {
      return (await request('encrypt', secret)).value!
    },
    async open(ciphertext) {
      const response = await request('decrypt', ciphertext)
      return {
        secret: response.value!,
        ...(response.replacement === undefined ? {} : { replacement: response.replacement }),
      }
    },
  }
}
