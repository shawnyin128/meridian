import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HttpStatusError, requestWithRetry, type HttpGet } from '../net/http.js'

export const semanticEmbeddingUrl = `https://api.semanticscholar.org/graph/v1/paper/batch?${new URLSearchParams({
  fields: 'embedding.specter_v2',
}).toString()}`
/** The most paper ids one embedding request carries. */
export const EMBEDDING_BATCH_LIMIT = 100
/** The most papers the cache keeps; the least recently used go first. */
export const EMBEDDING_CACHE_LIMIT = 5_000
const BODY_LIMIT = 10 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MODEL_FILE = 'model.json'

/**
 * One refresh's way to embeddings: `api` until Semantic Scholar answers 429, then `fallback` for the
 * rest of that refresh. A new refresh starts again at `api`.
 */
export type EmbeddingRun = { path: 'api' | 'fallback' }

/**
 * The vectors of one lookup, keyed by the paper id asked, all from `model` (null when there are
 * none); `missing` lists the ids asked that have no vector, in the order asked. `path` is `api` while
 * the API answers, `fallback` once this run met a 429, `unavailable` while no key is saved.
 */
export type EmbeddingLookup = {
  model: string | null
  vectors: Map<string, number[]>
  missing: string[]
  path: 'api' | 'fallback' | 'unavailable'
}

export type Embeddings = {
  /** A new run on the `api` path. */
  startRun(): EmbeddingRun
  /**
   * Returns the SPECTER2 vectors of `paperIds`, Semantic Scholar batch ids such as `ARXIV:2401.01234`
   * or a Semantic Scholar paper id, from the cache and else from the API, which it calls only with a
   * key and only while `run` is on the `api` path, at most EMBEDDING_BATCH_LIMIT ids a request. A
   * 429 sets `run.path` to `fallback` and leaves the ids not yet fetched missing. Fetched vectors are
   * cached under the model the API names; a cached vector of another model counts as missing and is
   * fetched again. Throws on any other failed request or a response that is not a list.
   */
  vectorsFor(paperIds: readonly string[], run: EmbeddingRun): Promise<EmbeddingLookup>
}

type CacheEntry = { id: string; model: string; vector: number[] }

const isVector = (value: unknown): value is number[] => (
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'number' && Number.isFinite(item))
)

/** Reads `file` as JSON, or undefined when it is missing or unreadable. */
const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/** The model and vector of each row of a batch response, in the order of the ids asked; null for a row without one. */
function parseEmbeddings(body: Uint8Array): Array<{ model: string; vector: number[] } | null> {
  const rows: unknown = JSON.parse(new TextDecoder().decode(body))
  if (!Array.isArray(rows)) throw new Error('Semantic Scholar 返回了无法识别的论文结果')
  return rows.map((row: unknown) => {
    const embedding = row !== null && typeof row === 'object' ? (row as { embedding?: unknown }).embedding : null
    if (embedding === null || typeof embedding !== 'object') return null
    const { model, vector } = embedding as { model?: unknown; vector?: unknown }
    return typeof model === 'string' && model !== '' && isVector(vector) ? { model, vector } : null
  })
}

/**
 * Paper embeddings from Semantic Scholar's paper batch endpoint through `get`, which carries the key
 * and the shared request queue, cached in `dir` as one file per paper, at most `limit` papers
 * (EMBEDDING_CACHE_LIMIT by default). The cache is derived: an unreadable file is deleted and its
 * paper fetched again.
 */
export function createEmbeddings(deps: {
  get: HttpGet
  apiKey: () => string | undefined
  dir: string
  sleep: (ms: number) => Promise<void>
  now?: () => number
  limit?: number
}): Embeddings {
  const now = deps.now ?? Date.now
  const limit = deps.limit ?? EMBEDDING_CACHE_LIMIT
  const policy = { timeoutMs: TIMEOUT_MS, tries: 2, backoffMs: 1_000, limit: BODY_LIMIT, sleep: deps.sleep }
  const fileOf = (id: string): string => (
    join(deps.dir, `${createHash('sha256').update(id).digest('hex').slice(0, 40)}.json`)
  )
  const currentModel = (): string | null => {
    const held = readJson(join(deps.dir, MODEL_FILE))
    const model = held !== null && typeof held === 'object' ? (held as { model?: unknown }).model : undefined
    return typeof model === 'string' && model !== '' ? model : null
  }
  const cached = (id: string, model: string): number[] | undefined => {
    const file = fileOf(id)
    const held = readJson(file)
    if (held === undefined) {
      rmSync(file, { force: true })
      return undefined
    }
    const entry = held as Partial<CacheEntry> | null
    if (entry === null || entry.id !== id || typeof entry.model !== 'string' || !isVector(entry.vector)) {
      rmSync(file, { force: true })
      return undefined
    }
    if (entry.model !== model) return undefined
    const at = new Date(now())
    utimesSync(file, at, at)
    return entry.vector
  }
  const store = (entries: CacheEntry[]): void => {
    const at = new Date(now())
    for (const entry of entries) {
      const file = fileOf(entry.id)
      writeFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8')
      utimesSync(file, at, at)
    }
    const files = readdirSync(deps.dir).filter((name) => name !== MODEL_FILE && name.endsWith('.json'))
    if (files.length <= limit) return
    const byUse = files
      .map((name) => ({ file: join(deps.dir, name), used: statSync(join(deps.dir, name)).mtimeMs }))
      .sort((a, b) => a.used - b.used)
    for (const { file } of byUse.slice(0, files.length - limit)) rmSync(file, { force: true })
  }
  return {
    startRun: () => ({ path: 'api' }),
    async vectorsFor(paperIds, run) {
      const asked = [...new Set(paperIds)]
      mkdirSync(deps.dir, { recursive: true })
      let model = currentModel()
      const vectors = new Map<string, number[]>()
      if (model !== null) {
        for (const id of asked) {
          const vector = cached(id, model)
          if (vector !== undefined) vectors.set(id, vector)
        }
      }
      const lookup = (path: EmbeddingLookup['path']): EmbeddingLookup => ({
        model: vectors.size === 0 ? null : model,
        vectors,
        missing: asked.filter((id) => !vectors.has(id)),
        path,
      })
      if (deps.apiKey() === undefined) return lookup('unavailable')
      const toFetch = asked.filter((id) => !vectors.has(id))
      for (let from = 0; from < toFetch.length && run.path === 'api'; from += EMBEDDING_BATCH_LIMIT) {
        const batch = toFetch.slice(from, from + EMBEDDING_BATCH_LIMIT)
        let body: Uint8Array
        try {
          body = await requestWithRetry(deps.get, semanticEmbeddingUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: batch }),
          }, policy)
        } catch (error) {
          if (!(error instanceof HttpStatusError && error.status === 429)) throw error
          run.path = 'fallback'
          break
        }
        const rows = parseEmbeddings(body)
        const answered = rows.find((row) => row !== null)?.model
        if (answered !== undefined && answered !== model) {
          vectors.clear()
          model = answered
          writeFileSync(join(deps.dir, MODEL_FILE), `${JSON.stringify({ model })}\n`, 'utf8')
        }
        const fetched: CacheEntry[] = []
        batch.forEach((id, at) => {
          const row = rows[at]
          if (row === null || row === undefined || row.model !== model) return
          vectors.set(id, row.vector)
          fetched.push({ id, model: row.model, vector: row.vector })
        })
        store(fetched)
      }
      return lookup(run.path)
    },
  }
}
