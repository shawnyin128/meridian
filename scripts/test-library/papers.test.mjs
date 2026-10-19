import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createArxiv } from '../../apps/desktop/src/core/net/arxiv.ts'
import { createCannedGet } from '../../apps/desktop/src/core/net/canned-http.ts'
import { arxivMetadata, PAPERS } from './papers.mjs'

const ids = PAPERS.flatMap((paper) => paper.arxiv === undefined ? [] : [paper.arxiv])
const abs = (id) => `https://arxiv.org/abs/${id}`
const batch = `https://export.arxiv.org/api/query?id_list=${ids.join('%2C')}&max_results=${ids.length}`

let out = ''
afterEach(() => rmSync(out, { recursive: true, force: true }))

/**
 * A stand-in for arXiv that answers abstract pages and Atom id lookups in arXiv's formats, with
 * LaTeX in every title and abstract, and records each URL asked. `failing` is answered with a 429
 * page that names the URL.
 */
const fakeArxiv = (failing) => {
  const asked = []
  const title = (id) => `H$_2$O at $\\infty$ ${id}`
  const summary = (id) => `Runs in $\\mathcal{O}(n)$ for ${id}.`
  const get = async (url) => {
    asked.push(url)
    if (url === failing) return new Response(`Too many requests for ${url}`, { status: 429 })
    if (url.startsWith('https://arxiv.org/abs/')) {
      const id = url.slice('https://arxiv.org/abs/'.length)
      return new Response(`<html><head><meta name="citation_title" content="${title(id)}">`
        + `<meta name="citation_author" content="Lin, Mei"><meta name="citation_date" content="2024/01/02">`
        + `<meta name="citation_arxiv_id" content="${id}"><meta name="citation_abstract" content="${summary(id)}">`
        + `<link rel="canonical" href="https://arxiv.org/abs/${id}"></head></html>`)
    }
    const entries = new URL(url).searchParams.get('id_list').split(',').map((id) => `<entry><id>http://arxiv.org/abs/${id}v2</id>`
      + `<published>2024-01-02T00:00:00Z</published><title>${title(id)}</title><summary>${summary(id)}</summary>`
      + `<author><name>Mei Lin</name></author></entry>`)
    return new Response(`<feed xmlns="http://www.w3.org/2005/Atom">${entries.join('')}</feed>`)
  }
  return { asked, get }
}

const offline = async (url) => { throw new Error(`Asked ${url} with a filled cache`) }

describe('测试库的 arXiv 元数据缓存', () => {
  it('第一次从 arXiv 取齐每篇论文的元数据，之后的种子不再联网', async () => {
    out = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
    const arxiv = fakeArxiv()
    const file = await arxivMetadata(out, { get: arxiv.get, intervalMs: 0 })
    expect(arxiv.asked).toEqual([...ids.map(abs), batch])
    expect(await arxivMetadata(out, { get: offline, intervalMs: 0 })).toBe(file)
  })

  it('缓存不联网就能回答 Core 的单篇和任意批量查询，标题和摘要里的 LaTeX 原样保留', async () => {
    out = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
    const file = await arxivMetadata(out, { get: fakeArxiv().get, intervalMs: 0 })
    const core = createArxiv({
      get: createCannedGet(JSON.parse(readFileSync(file, 'utf8')), out), minIntervalMs: 0, now: Date.now, sleep: async () => {},
    })
    const alone = await core.lookup(ids[4])
    expect(alone).toMatchObject({ title: `H$_2$O at $\\infty$ ${ids[4]}`, abstract: `Runs in $\\mathcal{O}(n)$ for ${ids[4]}.` })
    const some = await core.lookupMany([ids[7], ids[1], ids[5]])
    expect([...some.keys()].sort()).toEqual([ids[1], ids[5], ids[7]].sort())
    expect(some.get(ids[5])).toMatchObject({ title: `H$_2$O at $\\infty$ ${ids[5]}`, abstract: `Runs in $\\mathcal{O}(n)$ for ${ids[5]}.` })
  })

  it('不缓存 arXiv 的错误回答，下一次只补缺的部分', async () => {
    out = mkdtempSync(join(tmpdir(), 'meridian-test-library-'))
    await expect(arxivMetadata(out, { get: fakeArxiv(abs(ids[3])).get, intervalMs: 0 })).rejects.toThrow(/HTTP 429/)
    const retry = fakeArxiv()
    await arxivMetadata(out, { get: retry.get, intervalMs: 0 })
    expect(retry.asked).toEqual([...ids.slice(3).map(abs), batch])
  })
})
