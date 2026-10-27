import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HttpGet, HttpOptions } from '../net/http.js'
import { createEmbeddings, EMBEDDING_BATCH_LIMIT, semanticEmbeddingUrl } from './embeddings.js'

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const vectorOf = (id: string): number[] => [id.length, id.charCodeAt(id.length - 1) / 100, -0.5]
const ids = (count: number, prefix = 'ARXIV:2601.'): string[] => (
  Array.from({ length: count }, (_, at) => `${prefix}${String(at).padStart(5, '0')}`)
)

type Answer = (asked: string[]) => { status: number; rows?: unknown; body?: string }

/** A stub batch endpoint that records each request's ids and answers with `answer`, SPECTER2 rows by default. */
function stubApi(answer: Answer = (asked) => ({
  status: 200, rows: asked.map((id) => ({ paperId: `s2-${id}`, embedding: { model: 'specter_v2', vector: vectorOf(id) } })),
})) {
  const requests: Array<{ url: string; ids: string[]; options: HttpOptions }> = []
  const get: HttpGet = async (url, options) => {
    const asked = (JSON.parse(options.body!) as { ids: string[] }).ids
    requests.push({ url, ids: asked, options })
    const { status, rows, body } = answer(asked)
    return { status, body: body === undefined ? bytes(rows ?? { message: 'Too Many Requests' }) : new TextEncoder().encode(body) }
  }
  return { get, requests }
}

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'meridian-embeddings-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const open = (get: HttpGet, apiKey: string | null = 'saved-key') => createEmbeddings({
  get, apiKey: () => apiKey ?? undefined, dir, sleep: async () => {},
})

describe('paper embeddings', () => {
  it('fetches SPECTER2 vectors from the paper batch endpoint and reports the papers it has none for', async () => {
    const api = stubApi((asked) => ({
      status: 200,
      rows: asked.map((id) => (id === 'ARXIV:unknown' ? null
        : id === 'ARXIV:bare' ? { paperId: 's2-bare', embedding: null }
          : { paperId: `s2-${id}`, embedding: { model: 'specter_v2', vector: vectorOf(id) } })),
    }))
    const embeddings = open(api.get)
    const result = await embeddings.vectorsFor(['ARXIV:1', 'ARXIV:unknown', 'ARXIV:bare', 'ARXIV:1'], embeddings.startRun())
    expect(api.requests).toHaveLength(1)
    expect(api.requests[0]!.url).toBe(semanticEmbeddingUrl)
    expect(new URL(api.requests[0]!.url).searchParams.get('fields')).toBe('embedding.specter_v2')
    expect(api.requests[0]!.options.method).toBe('POST')
    expect(api.requests[0]!.ids).toEqual(['ARXIV:1', 'ARXIV:unknown', 'ARXIV:bare'])
    expect(result.path).toBe('api')
    expect(result.model).toBe('specter_v2')
    expect([...result.vectors]).toEqual([['ARXIV:1', vectorOf('ARXIV:1')]])
    expect(result.missing).toEqual(['ARXIV:unknown', 'ARXIV:bare'])
  })

  it('answers papers it fetched before from the cache without calling the API', async () => {
    const first = stubApi()
    await open(first.get).vectorsFor(['ARXIV:1', 'ARXIV:2'], { path: 'api' })
    const second = stubApi()
    const reopened = open(second.get)
    const result = await reopened.vectorsFor(['ARXIV:2', 'ARXIV:1', 'ARXIV:3'], reopened.startRun())
    expect(second.requests.map((request) => request.ids)).toEqual([['ARXIV:3']])
    expect(result.vectors.get('ARXIV:1')).toEqual(vectorOf('ARXIV:1'))
    expect(result.vectors.get('ARXIV:2')).toEqual(vectorOf('ARXIV:2'))
    expect(result.vectors.get('ARXIV:3')).toEqual(vectorOf('ARXIV:3'))
    expect(result.missing).toEqual([])
  })

  it('splits the papers it must fetch into batches of at most 100 ids', async () => {
    const api = stubApi()
    const embeddings = open(api.get)
    const asked = ids(250)
    const result = await embeddings.vectorsFor(asked, embeddings.startRun())
    expect(EMBEDDING_BATCH_LIMIT).toBe(100)
    expect(api.requests.map((request) => request.ids.length)).toEqual([100, 100, 50])
    expect(api.requests.flatMap((request) => request.ids)).toEqual(asked)
    expect(result.vectors.size).toBe(250)
    expect(result.path).toBe('api')
  })

  it('switches the rest of a run to the fallback once Semantic Scholar answers 429, and tries the API again next run', async () => {
    let calls = 0
    const api = stubApi((asked) => {
      calls += 1
      return calls === 1
        ? { status: 200, rows: asked.map((id) => ({ embedding: { model: 'specter_v2', vector: vectorOf(id) } })) }
        : { status: 429 }
    })
    const embeddings = open(api.get)
    const run = embeddings.startRun()
    const asked = ids(250)
    const result = await embeddings.vectorsFor(asked, run)
    expect(result.path).toBe('fallback')
    expect(result.reason).toBe('rate-limit')
    expect(run).toEqual({ path: 'fallback', reason: 'rate-limit' })
    expect(result.vectors.size).toBe(100)
    expect(result.missing).toEqual(asked.slice(100))
    const requestsAfterSwitch = api.requests.length
    expect(api.requests.slice(1).every((request) => request.ids.join() === asked.slice(100, 200).join())).toBe(true)

    const later = await embeddings.vectorsFor([asked[0]!, 'ARXIV:new'], run)
    expect(api.requests).toHaveLength(requestsAfterSwitch)
    expect(later.path).toBe('fallback')
    expect(later.reason).toBe('rate-limit')
    expect(later.vectors.get(asked[0]!)).toEqual(vectorOf(asked[0]!))
    expect(later.missing).toEqual(['ARXIV:new'])

    await embeddings.vectorsFor(['ARXIV:new'], embeddings.startRun())
    expect(api.requests.at(-1)!.ids).toEqual(['ARXIV:new'])
  })

  const timeout = (): never => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }) }
  const offline = (): never => { throw new TypeError('fetch failed') }
  it.each([
    ['quota', () => ({ status: 403, body: '{"message":"API key quota exceeded"}' })],
    ['timeout', timeout],
    ['network', offline],
    ['server', () => ({ status: 503, body: '{"message":"Service Unavailable"}' })],
  ] as const)('switches the rest of a run to the fallback on a %s answer, recording why', async (reason, refuse: Answer) => {
    let calls = 0
    const api = stubApi((asked) => {
      calls += 1
      return calls === 1
        ? { status: 200, rows: asked.map((id) => ({ embedding: { model: 'specter_v2', vector: vectorOf(id) } })) }
        : refuse(asked)
    })
    const embeddings = open(api.get)
    const run = embeddings.startRun()
    const asked = ids(150)
    const result = await embeddings.vectorsFor(asked, run)
    expect(result).toMatchObject({ path: 'fallback', reason, missing: asked.slice(100) })
    expect(result.vectors.size).toBe(100)
    expect(run).toEqual({ path: 'fallback', reason })
    const sent = api.requests.length
    expect((await embeddings.vectorsFor(['ARXIV:new'], run)).reason).toBe(reason)
    expect(api.requests).toHaveLength(sent)
  })

  it.each([
    ['a bad request', () => ({ status: 400, body: '{"error":"Unrecognized or unsupported fields"}' })],
    ['an invalid key', () => ({ status: 401, body: '{"message":"Unauthorized"}' })],
    ['a forbidden key', () => ({ status: 403, body: '{"message":"Forbidden"}' })],
    ['a response that is not a list', () => ({ status: 200, body: '{"data":[]}' })],
  ] as const)('throws on %s instead of falling back', async (_name, refuse: Answer) => {
    const embeddings = open(stubApi(refuse).get)
    const run = embeddings.startRun()
    await expect(embeddings.vectorsFor(['ARXIV:1'], run)).rejects.toThrow()
    expect(run.path).toBe('api')
  })

  it('reports no fallback reason while the API answers', async () => {
    const embeddings = open(stubApi().get)
    const result = await embeddings.vectorsFor(['ARXIV:1'], embeddings.startRun())
    expect(result.path).toBe('api')
    expect('reason' in result).toBe(false)
  })

  it('reports the API unavailable and never calls it while no key is saved, still answering from the cache', async () => {
    await open(stubApi().get).vectorsFor(['ARXIV:1'], { path: 'api' })
    const api = stubApi()
    const embeddings = open(api.get, null)
    const result = await embeddings.vectorsFor(['ARXIV:1', 'ARXIV:2'], embeddings.startRun())
    expect(api.requests).toEqual([])
    expect(result.path).toBe('unavailable')
    expect(result.vectors.get('ARXIV:1')).toEqual(vectorOf('ARXIV:1'))
    expect(result.missing).toEqual(['ARXIV:2'])
  })

  it('drops an unreadable cache entry and fetches its paper again', async () => {
    await open(stubApi().get).vectorsFor(['ARXIV:1'], { path: 'api' })
    const entries = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name !== 'model.json')
    expect(entries).toHaveLength(1)
    const file = join(entries[0]!.parentPath, entries[0]!.name)
    writeFileSync(file, '{"id": "ARXIV:1", "vector": [1, ')
    const api = stubApi()
    const embeddings = open(api.get)
    const result = await embeddings.vectorsFor(['ARXIV:1'], embeddings.startRun())
    expect(api.requests.map((request) => request.ids)).toEqual([['ARXIV:1']])
    expect(result.vectors.get('ARXIV:1')).toEqual(vectorOf('ARXIV:1'))
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ id: 'ARXIV:1', vector: vectorOf('ARXIV:1') })
  })

  it('does not mix vectors of another model into a lookup', async () => {
    await open(stubApi().get).vectorsFor(['ARXIV:1', 'ARXIV:2'], { path: 'api' })
    const api = stubApi((asked) => ({
      status: 200, rows: asked.map(() => ({ embedding: { model: 'specter_v3', vector: [9, 9, 9] } })),
    }))
    const embeddings = open(api.get)
    const result = await embeddings.vectorsFor(['ARXIV:1', 'ARXIV:3'], embeddings.startRun())
    expect(result.model).toBe('specter_v3')
    expect([...result.vectors]).toEqual([['ARXIV:3', [9, 9, 9]]])
    expect(result.missing).toEqual(['ARXIV:1'])

    const next = await embeddings.vectorsFor(['ARXIV:1'], embeddings.startRun())
    expect(api.requests.at(-1)!.ids).toEqual(['ARXIV:1'])
    expect(next.vectors.get('ARXIV:1')).toEqual([9, 9, 9])
  })

  it('keeps at most its limit of papers, evicting the least recently used', async () => {
    let now = 1_000_000
    const timed = (get: HttpGet) => createEmbeddings({
      get, apiKey: () => 'saved-key', dir, sleep: async () => {}, now: () => now, limit: 2,
    })
    const embeddings = timed(stubApi().get)
    await embeddings.vectorsFor(['ARXIV:1'], { path: 'api' })
    now += 60_000
    await embeddings.vectorsFor(['ARXIV:2'], { path: 'api' })
    now += 60_000
    await embeddings.vectorsFor(['ARXIV:1'], { path: 'api' })
    now += 60_000
    await embeddings.vectorsFor(['ARXIV:3'], { path: 'api' })
    const api = stubApi()
    await timed(api.get).vectorsFor(['ARXIV:1', 'ARXIV:2', 'ARXIV:3'], { path: 'api' })
    expect(api.requests.map((request) => request.ids)).toEqual([['ARXIV:2']])
  })
})
