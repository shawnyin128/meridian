/** Result of one GET request: status code and complete response body. */
export type HttpResponse = { status: number; body: Uint8Array; retryAfterMs?: number }

export type HttpOptions = {
  signal: AbortSignal
  /** Abort and throw when the response body exceeds this many bytes. */
  limit: number
  onProgress?: (received: number, total: number | null) => void
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
}

/** Core's only network entry point: Electron net.fetch in the app and a substitute in fixtures and tests. */
export type HttpGet = (url: string, options: HttpOptions) => Promise<HttpResponse>

export type HttpRequestOptions = Pick<HttpOptions, 'method' | 'headers' | 'body'>

export type RateLimitedHttpOptions = {
  minIntervalMs: number
  sleep: (ms: number) => Promise<void>
  now: () => number
  headers?: Record<string, string>
}

/**
 * Serializes one remote service behind a shared request clock. A 429 extends
 * the clock for every consumer, so author lookup, discovery and ranking do
 * not independently retry into the same server-side cooldown. The returned
 * Retry-After is consumed here; requestWithRetry only needs its normal short
 * backoff before it rejoins this queue.
 */
export function createRateLimitedGet(get: HttpGet, policy: RateLimitedHttpOptions): HttpGet {
  let tail: Promise<void> = Promise.resolve()
  let nextAt = 0
  return (url, options) => {
    const run = tail.catch(() => undefined).then(async () => {
      const now = policy.now()
      const wait = Math.max(0, nextAt - now)
      if (wait > 0) await policy.sleep(wait)
      nextAt = Math.max(nextAt, now) + policy.minIntervalMs
      const response = await get(url, {
        ...options,
        headers: { ...policy.headers, ...options.headers },
      })
      if (response.status !== 429) return response
      nextAt = Math.max(nextAt, policy.now() + (response.retryAfterMs ?? 15_000))
      return { ...response, retryAfterMs: 0 }
    })
    tail = run.then(() => undefined, () => undefined)
    return run
  }
}

/** Parses Retry-After seconds or an HTTP date into a non-negative delay. */
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (value === null) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}

/** The server returned a non-200 status code. */
export class HttpStatusError extends Error {
  constructor(readonly status: number, readonly retryAfterMs?: number) {
    super(`服务器返回 ${status}`)
  }
}

export type RetryPolicy = {
  timeoutMs: number
  tries: number
  backoffMs: number
  limit: number
  sleep: (ms: number) => Promise<void>
}

/** Wait for the specified number of milliseconds. */
export const sleep = (ms: number): Promise<void> => new Promise((done) => { setTimeout(done, ms) })

/**
 * GETs `url` and returns the body of a 200 response. Each attempt carries a
 * timeout of `timeoutMs` and the body limit. A network error, a timeout, a 429
 * or a 5xx is tried again, up to `tries` attempts in all, sleeping `backoffMs`
 * times the attempt number before each retry. Throws HttpStatusError at once
 * for any other status, and the last error once the attempts run out.
 */
export async function requestWithRetry(
  get: HttpGet, url: string, request: HttpRequestOptions, policy: RetryPolicy,
): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await get(url, {
        signal: AbortSignal.timeout(policy.timeoutMs), limit: policy.limit, ...request,
      })
      if (response.status !== 200) throw new HttpStatusError(response.status, response.retryAfterMs)
      return response.body
    } catch (error) {
      const final = error instanceof HttpStatusError && error.status !== 429 && error.status < 500
      if (final || attempt >= policy.tries) throw error
      const backoff = error instanceof HttpStatusError && error.status === 429
        ? Math.max(error.retryAfterMs ?? 15_000, policy.backoffMs * attempt)
        : policy.backoffMs * attempt
      await policy.sleep(backoff)
    }
  }
}

export function getWithRetry(get: HttpGet, url: string, policy: RetryPolicy): Promise<Uint8Array> {
  return requestWithRetry(get, url, {}, policy)
}

/** Returns why a network call failed, as a short phrase for the screen. */
export function netReason(error: unknown): string {
  if (error instanceof HttpStatusError) return error.message
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return '连接超时'
  if (error instanceof TypeError || (error instanceof Error && error.message.includes('net::ERR_'))) {
    return '网络不可用'
  }
  return error instanceof Error ? error.message : String(error)
}
