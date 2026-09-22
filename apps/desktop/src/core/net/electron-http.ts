import { net } from 'electron'
import { retryAfterMs, type HttpGet } from './http.js'

/**
 * GETs through Chromium's network stack, which honours the system proxy.
 * Reads the body chunk by chunk, reporting bytes received and the
 * Content-Length (null when absent) after each chunk. Throws if the body grows
 * past `limit`, and whatever net.fetch throws, including the abort of `signal` or the lapse of `timeoutMs`.
 */
export const electronGet: HttpGet = async (url, { signal: given, timeoutMs, limit, onProgress, method, headers, body }) => {
  const signal = given ?? (timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs))
  const response = await net.fetch(url, {
    ...(signal === undefined ? {} : { signal }),
    ...(method === undefined ? {} : { method }),
    headers: { 'User-Agent': 'Meridian/0.0.0 (personal research desktop)', ...headers },
    ...(body === undefined ? {} : { body }),
  })
  const header = response.headers.get('content-length')
  const total = header === null ? null : Number(header)
  const chunks: Uint8Array[] = []
  let received = 0
  if (response.body !== null) {
    const reader = response.body.getReader()
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      received += next.value.byteLength
      if (received > limit) {
        await reader.cancel()
        throw new Error('文件超过大小上限')
      }
      chunks.push(next.value)
      onProgress?.(received, total)
    }
  }
  const retryDelay = response.status === 429 ? retryAfterMs(response.headers.get('retry-after')) : undefined
  return {
    status: response.status,
    body: new Uint8Array(Buffer.concat(chunks)),
    ...(retryDelay === undefined ? {} : { retryAfterMs: retryDelay }),
  }
}
