import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCannedGet } from './canned-http.js'

const ROOT = resolve(import.meta.dirname, '../fixtures/vault')
const FILE = 'sources/papers/paper-pdf-e0b2ea3a1a54-Fast-Inference-from-Transformers-via-Speculative-Decoding.pdf'

describe('createCannedGet', () => {
  const get = createCannedGet({
    'https://a/file': { status: 200, file: FILE },
    'https://a/pdf': { status: 200, pdf: { lines: ['Built'] } },
    'https://a/atom': { status: 200, atom: '<feed/>' },
    'https://a/down': { status: 503 },
    'https://a/slow': { status: 200, delayMs: 50, atom: 'slow' },
    'https://authors/search?*': { status: 200, kind: 'semantic-author-search' },
  }, ROOT)
  const options = () => ({ signal: new AbortController().signal, limit: 1_000_000 })

  it('按网址逐字查找并返回文件、现做 PDF 或 Atom 文本', async () => {
    expect((await get('https://a/file', options())).body.byteLength).toBeGreaterThan(1000)
    expect(new TextDecoder().decode((await get('https://a/pdf', options())).body.slice(0, 8)))
      .toBe('%PDF-1.4')
    expect(new TextDecoder().decode((await get('https://a/atom', options())).body)).toBe('<feed/>')
    expect(await get('https://a/down', options()))
      .toEqual({ status: 503, body: new Uint8Array() })
  })

  it('没有预置的网址返回 404', async () => {
    expect((await get('https://a/nope', options())).status).toBe(404)
  })

  it('通配 fixture 可以按输入生成同名作者候选', async () => {
    const response = await get('https://authors/search?query=Alex+Kim', options())
    const decoded = JSON.parse(new TextDecoder().decode(response.body)) as {
      data: { name: string; affiliations: string[] }[]
    }
    expect(decoded.data).toHaveLength(3)
    expect(decoded.data.map((author) => author.name)).toEqual(['Alex Kim', 'Alex Kim', 'Alex Kim'])
    expect(new Set(decoded.data.flatMap((author) => author.affiliations)).size).toBe(3)
  })

  it('延迟响应先报一半进度,完成再报到底;中止时抛出原因', async () => {
    const seen: number[] = []
    await get('https://a/slow', {
      ...options(), onProgress: (received) => { seen.push(received) },
    })
    expect(seen).toEqual([2, 4])
    const abort = new AbortController()
    const pending = get('https://a/slow', { signal: abort.signal, limit: 1_000_000 })
    abort.abort(new Error('停'))
    await expect(pending).rejects.toThrow('停')
  })
})
