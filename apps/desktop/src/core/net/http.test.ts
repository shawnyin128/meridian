import { describe, expect, it } from 'vitest'
import {
  createRateLimitedGet, getWithRetry, HttpStatusError, netReason, retryAfterMs, type HttpGet,
} from './http.js'

const bytes = (text: string) => new TextEncoder().encode(text)
const policy = (sleeps: number[]) => ({
  timeoutMs: 1000, tries: 3, backoffMs: 3000, limit: 1024,
  sleep: async (ms: number) => { sleeps.push(ms) },
})

describe('getWithRetry', () => {
  it('503 之后再试,第二次拿到 200 就返回响应体,中间等 3 秒', async () => {
    const statuses = [503, 200]
    const get: HttpGet = async () => ({ status: statuses.shift()!, body: bytes('ok') })
    const sleeps: number[] = []
    expect(new TextDecoder().decode(await getWithRetry(get, 'https://x', policy(sleeps)))).toBe('ok')
    expect(sleeps).toEqual([3000])
  })

  it('429 尊重 Retry-After,没有时也至少等 15 秒再试', async () => {
    const sleeps: number[] = []
    const responses = [
      { status: 429, body: bytes(''), retryAfterMs: 21_000 },
      { status: 429, body: bytes('') },
      { status: 200, body: bytes('ok') },
    ]
    const get: HttpGet = async () => responses.shift()!
    expect(new TextDecoder().decode(await getWithRetry(get, 'https://x', policy(sleeps)))).toBe('ok')
    expect(sleeps).toEqual([21_000, 15_000])
  })

  it('404 不重试,直接抛出带状态码的错误', async () => {
    let calls = 0
    const get: HttpGet = async () => { calls += 1; return { status: 404, body: bytes('') } }
    await expect(getWithRetry(get, 'https://x', policy([]))).rejects.toThrow('服务器返回 404')
    expect(calls).toBe(1)
  })

  it('网络错误试满三次后抛出最后那个错误,两次等待是 3 秒与 6 秒', async () => {
    let calls = 0
    const get: HttpGet = async () => { calls += 1; throw new TypeError(`fetch failed ${calls}`) }
    const sleeps: number[] = []
    await expect(getWithRetry(get, 'https://x', policy(sleeps))).rejects.toThrow('fetch failed 3')
    expect(sleeps).toEqual([3000, 6000])
  })

  it('每次请求都带着还没中止的超时信号与大小上限', async () => {
    const seen: { aborted: boolean; limit: number }[] = []
    const get: HttpGet = async (_url, options) => {
      seen.push({ aborted: options.signal.aborted, limit: options.limit })
      return { status: 200, body: bytes('') }
    }
    await getWithRetry(get, 'https://x', policy([]))
    expect(seen).toEqual([{ aborted: false, limit: 1024 }])
  })
})

describe('netReason', () => {
  it('把几类失败说成给人看的短话', () => {
    expect(netReason(new HttpStatusError(503))).toBe('服务器返回 503')
    expect(netReason(new DOMException('t', 'TimeoutError'))).toBe('连接超时')
    expect(netReason(new TypeError('fetch failed'))).toBe('网络不可用')
    expect(netReason(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe('网络不可用')
    expect(netReason(new Error('别的原因'))).toBe('别的原因')
  })
})

describe('retryAfterMs', () => {
  it('支持秒数与 HTTP 日期,坏值不臆测', () => {
    expect(retryAfterMs('12')).toBe(12_000)
    expect(retryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('2015-10-21T07:27:50Z'))).toBe(10_000)
    expect(retryAfterMs('bad')).toBeUndefined()
    expect(retryAfterMs(null)).toBeUndefined()
  })
})

describe('createRateLimitedGet', () => {
  it('串行化同一服务，并把一次 429 的冷却共享给下一位调用者', async () => {
    let now = 0
    const waits: number[] = []
    let calls = 0
    const raw: HttpGet = async () => {
      calls += 1
      return calls === 1
        ? { status: 429, body: bytes(''), retryAfterMs: 5_000 }
        : { status: 200, body: bytes('ok') }
    }
    const get = createRateLimitedGet(raw, {
      minIntervalMs: 1_000, now: () => now,
      sleep: async (ms) => { waits.push(ms); now += ms },
    })
    const options = { signal: new AbortController().signal, limit: 100 }
    expect((await get('https://s2/one', options)).retryAfterMs).toBe(0)
    expect((await get('https://s2/two', options)).status).toBe(200)
    expect(waits).toEqual([5_000])
  })

  it('给服务的每个请求合并固定请求头', async () => {
    let headers: Record<string, string> | undefined
    const get = createRateLimitedGet(async (_url, options) => {
      headers = options.headers
      return { status: 200, body: bytes('ok') }
    }, { minIntervalMs: 0, now: () => 0, sleep: async () => {}, headers: { 'x-api-key': 'secret' } })
    await get('https://s2', {
      signal: new AbortController().signal, limit: 100, headers: { Accept: 'application/json' },
    })
    expect(headers).toEqual({ 'x-api-key': 'secret', Accept: 'application/json' })
  })
})
