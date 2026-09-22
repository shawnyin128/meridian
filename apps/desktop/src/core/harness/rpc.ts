import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import {
  type HarnessCapability,
  HARNESS_PROTOCOL_VERSION,
  type HarnessCallbackResultMessage,
  type HarnessErrorKind,
  type HarnessInboundMessage,
  type HarnessProtocolError,
  type HarnessRequestMessage,
  parseHarnessMessage,
  parseHarnessReadyData,
} from './protocol.js'

export type HarnessChild = {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): HarnessChild
  on(event: 'error', listener: (cause: Error) => void): HarnessChild
  kill(signal?: NodeJS.Signals): boolean
}

export type HarnessCallback = (params: unknown, requestId: number) => unknown | Promise<unknown>

export type HarnessRequestOptions = {
  signal?: AbortSignal
  onEvent?: (event: string, data: unknown) => void
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (cause: Error) => void
  onEvent?: HarnessRequestOptions['onEvent']
  timer: NodeJS.Timeout
  detachAbort?: () => void
}

type Dependencies = {
  launch: () => HarnessChild
  requiredCapabilities?: readonly HarnessCapability[]
  callbacks?: Readonly<Record<string, HarnessCallback>>
  onLog?: (line: string) => void
  readyTimeoutMs?: number
  requestTimeoutMs?: number
}

const MAX_HARNESS_STDERR_DETAIL = 4_000

export class HarnessRpcError extends Error {
  readonly kind: HarnessErrorKind
  readonly detail?: unknown

  constructor(error: HarnessProtocolError) {
    super(error.message)
    this.name = 'HarnessRpcError'
    this.kind = error.kind
    if ('detail' in error) this.detail = error.detail
  }
}

/** Lazy, version-checked RPC client for the one Harness subprocess owned by Core. */
export function createHarnessRpc(deps: Dependencies) {
  let child: HarnessChild | null = null
  let ready: Promise<void> | null = null
  let resolveReady: (() => void) | null = null
  let rejectReady: ((cause: Error) => void) | null = null
  let readyTimer: NodeJS.Timeout | null = null
  let nextId = 0
  let stopped = false
  const pending = new Map<number, Pending>()
  const callbacks = deps.callbacks ?? {}
  const readyTimeoutMs = deps.readyTimeoutMs ?? 5_000
  const requestTimeoutMs = deps.requestTimeoutMs ?? 120_000

  const writeTo = (target: HarnessChild, message: object) => {
    if (child !== target || target.stdin.destroyed) {
      throw new HarnessRpcError({ kind: 'harness_gone', message: 'Harness process is not available' })
    }
    target.stdin.write(`${JSON.stringify(message)}\n`, 'utf8')
  }

  const write = (message: object) => {
    if (child === null) {
      throw new HarnessRpcError({ kind: 'harness_gone', message: 'Harness process is not available' })
    }
    writeTo(child, message)
  }

  const finish = (id: number, settle: (held: Pending) => void) => {
    const held = pending.get(id)
    if (held === undefined) return
    pending.delete(id)
    clearTimeout(held.timer)
    held.detachAbort?.()
    settle(held)
  }

  const failAll = (cause: Error) => {
    if (readyTimer !== null) clearTimeout(readyTimer)
    readyTimer = null
    rejectReady?.(cause)
    resolveReady = null
    rejectReady = null
    for (const id of [...pending.keys()]) finish(id, (held) => held.reject(cause))
  }

  const replyToCallback = (
    message: Extract<HarnessInboundMessage, { type: 'callback' }>,
    target: HarnessChild,
  ) => {
    if (!pending.has(message.id)) {
      writeTo(target, {
        type: 'error', id: message.id, callbackId: message.callbackId, ok: false,
        error: { kind: 'cancelled', message: 'Harness request is no longer active' },
      } satisfies HarnessCallbackResultMessage)
      return
    }
    const handler = callbacks[message.method]
    if (handler === undefined) {
      writeTo(target, {
        type: 'error', id: message.id, callbackId: message.callbackId, ok: false,
        error: { kind: 'bad_request', message: `Harness callback is not allowed: ${message.method}` },
      } satisfies HarnessCallbackResultMessage)
      return
    }
    void Promise.resolve().then(() => handler(message.params, message.id)).then(
      (result) => {
        if (!pending.has(message.id) || child !== target) return
        writeTo(target, {
          type: 'response', id: message.id, callbackId: message.callbackId, ok: true, result,
        } satisfies HarnessCallbackResultMessage)
      },
      () => {
        if (!pending.has(message.id) || child !== target) return
        writeTo(target, {
          type: 'error', id: message.id, callbackId: message.callbackId, ok: false,
          error: {
            kind: 'internal',
            message: 'Core read callback failed',
          },
        } satisfies HarnessCallbackResultMessage)
      },
    ).catch((cause: unknown) => {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      retire(target, error, true)
    })
  }

  const retire = (target: HarnessChild, cause: Error, terminate = false) => {
    if (child !== target) return
    child = null
    failAll(cause)
    ready = null
    if (terminate) target.kill()
  }

  const handle = (message: HarnessInboundMessage, target: HarnessChild) => {
    if (message.type === 'event') {
      if (message.id === 0 && message.event === 'ready') {
        let data
        try {
          data = parseHarnessReadyData(message.data)
        } catch (cause) {
          retire(target, new HarnessRpcError({
            kind: 'bad_request',
            message: cause instanceof Error ? cause.message : 'Harness ready event is malformed',
          }), true)
          return
        }
        if (data.protocol !== HARNESS_PROTOCOL_VERSION) {
          retire(target, new HarnessRpcError({
            kind: 'bad_request',
            message: `Unsupported Harness protocol: ${data.protocol}`,
          }), true)
          return
        }
        const missing = (deps.requiredCapabilities ?? [])
          .filter((capability) => !data.capabilities.includes(capability))
        if (missing.length > 0) {
          retire(target, new HarnessRpcError({
            kind: 'bad_request',
            message: `Harness is missing required capabilities: ${missing.join(', ')}`,
          }), true)
          return
        }
        if (readyTimer !== null) clearTimeout(readyTimer)
        readyTimer = null
        resolveReady?.()
        resolveReady = null
        rejectReady = null
        return
      }
      pending.get(message.id)?.onEvent?.(message.event, message.data)
      return
    }
    if (message.type === 'callback') {
      replyToCallback(message, target)
      return
    }
    if (message.type === 'response') {
      finish(message.id, (held) => held.resolve(message.result))
      return
    }
    finish(message.id, (held) => held.reject(new HarnessRpcError(message.error)))
  }

  const start = (): Promise<void> => {
    if (ready !== null) return ready
    if (stopped) {
      return Promise.reject(new HarnessRpcError({
        kind: 'harness_gone', message: 'Harness client has already closed',
      }))
    }
    const starting = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    ready = starting
    let launched: HarnessChild
    let stderrTail = ''
    try {
      launched = deps.launch()
      child = launched
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      failAll(error)
      ready = null
      return starting
    }
    readyTimer = setTimeout(() => {
      const detail = stderrTail.trim()
      const cause = new HarnessRpcError({
        kind: 'harness_gone', message: 'Harness did not become ready',
        ...(detail === '' ? {} : { detail }),
      })
      retire(launched, cause, true)
    }, readyTimeoutMs)
    readyTimer.unref()

    const lines = createInterface({ input: launched.stdout })
    lines.on('line', (line) => {
      if (child !== launched || line.trim() === '') return
      try {
        handle(parseHarnessMessage(line), launched)
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause))
        retire(launched, error, true)
      }
    })
    launched.stderr.setEncoding('utf8')
    launched.stderr.on('data', (chunk: string) => {
      if (child !== launched) return
      stderrTail = `${stderrTail}${chunk}`.slice(-MAX_HARNESS_STDERR_DETAIL)
      for (const line of chunk.split(/\r?\n/)) if (line !== '') deps.onLog?.(line)
    })
    launched.on('error', (cause) => retire(launched, cause))
    launched.on('exit', (code, signal) => {
      const suffix = signal === null ? `code ${String(code)}` : `signal ${signal}`
      const detail = stderrTail.trim()
      retire(launched, new HarnessRpcError({
        kind: 'harness_gone', message: `Harness process exited with ${suffix}`,
        ...(detail === '' ? {} : { detail }),
      }))
    })
    return starting
  }

  const request = async <T>(
    method: string,
    params: unknown,
    options: HarnessRequestOptions = {},
  ): Promise<T> => {
    await start()
    if (options.signal?.aborted) {
      throw new HarnessRpcError({ kind: 'cancelled', message: 'Harness request cancelled' })
    }
    const id = ++nextId
    const requestChild = child
    if (requestChild === null) {
      throw new HarnessRpcError({ kind: 'harness_gone', message: 'Harness process is not available' })
    }
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        const cause = new HarnessRpcError({ kind: 'harness_gone', message: 'Harness request timed out' })
        retire(requestChild, cause, true)
      }, requestTimeoutMs)
      timer.unref()
      const held: Pending = {
        resolve, reject, timer,
        ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
      }
      if (options.signal !== undefined) {
        const cancel = () => {
          try { write({ type: 'cancel', id }) } catch { /* Process failure settles the request. */ }
          finish(id, (pendingRequest) => pendingRequest.reject(new HarnessRpcError({
            kind: 'cancelled', message: 'Harness request cancelled',
          })))
        }
        options.signal.addEventListener('abort', cancel, { once: true })
        held.detachAbort = () => options.signal?.removeEventListener('abort', cancel)
      }
      pending.set(id, held)
    })
    try {
      write({ type: 'request', id, method, params } satisfies HarnessRequestMessage)
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      retire(requestChild, error, true)
    }
    return result as Promise<T>
  }

  const close = () => {
    stopped = true
    const cause = new HarnessRpcError({ kind: 'harness_gone', message: 'Harness client closed' })
    failAll(cause)
    if (child !== null) {
      child.stdin.end()
      child.kill()
      child = null
    }
  }

  return { request, close }
}

export type HarnessRpc = ReturnType<typeof createHarnessRpc>
