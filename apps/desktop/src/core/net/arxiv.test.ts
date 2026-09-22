import { describe, expect, it } from 'vitest'
import type { HttpGet } from './http.js'
import { batchLookupUrl, createArxiv, lookupUrl, parseAbs, parseAtom, searchUrl, watchQuery } from './arxiv.js'

/** Atom response shaped after the arXiv API documentation; two papers, with journal_ref and escapes on the second. */
const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2211.17192v2</id>
    <updated>2023-05-18T17:57:09Z</updated>
    <published>2022-11-30T17:33:28Z</published>
    <title>Fast Inference from Transformers via
  Speculative Decoding</title>
    <summary>  Inference from large autoregressive models
like Transformers is slow.
</summary>
    <author><name>Yaniv Leviathan</name></author>
    <author><name>Matan Kalman</name></author>
    <link title="pdf" href="http://arxiv.org/pdf/2211.17192v2" rel="related" type="application/pdf"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2407.08608v1</id>
    <published>2024-07-11T17:53:36Z</published>
    <title>FlashAttention-3: Fast &amp; Accurate</title>
    <summary>Attention &lt;fast&gt;.</summary>
    <author><name>Tri Dao</name></author>
    <arxiv:journal_ref xmlns:arxiv="http://arxiv.org/schemas/atom">NeurIPS 2024</arxiv:journal_ref>
  </entry>
</feed>`

const ERROR_ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <id>http://arxiv.org/api/errors#incorrect_id_format_for_1234.12345</id>
  <title>Error</title><summary>incorrect id format for 1234.12345</summary>
</entry></feed>`

const ABS = `<html><head>
  <meta name="citation_title" content="Not All Disagreement Is Learnable: Token Teachability in On-Policy Distillation" />
  <meta name="citation_author" content="Wang, Yuanyi" />
  <meta name="citation_author" content="Lu, Su" />
  <meta name="citation_date" content="2026/05/26" />
  <meta name="citation_pdf_url" content="https://arxiv.org/pdf/2605.26844" />
  <meta name="citation_arxiv_id" content="2605.26844v1" />
  <meta name="citation_abstract" content="Teacher&#39;s signal &amp; student support." />
</head></html>`

describe('arXiv 查询', () => {
  it('主题按整句搜全部字段,缩写名字的作者写成姓_首字母,全名作者加引号', () => {
    expect(watchQuery({ type: 'topic', name: 'speculative decoding' })).toBe('all:"speculative decoding"')
    expect(watchQuery({ type: 'author', name: 'T. Dao' })).toBe('au:Dao_T')
    expect(watchQuery({ type: 'author', name: 'Tri Dao' })).toBe('au:"Tri Dao"')
  })

  it('搜索地址按提交日期倒序取 20 篇,编号查询走摘要页', () => {
    expect(searchUrl('all:"speculative decoding"')).toBe(
      'https://export.arxiv.org/api/query?search_query=all%3A%22speculative+decoding%22&sortBy=submittedDate&sortOrder=descending&max_results=20')
    expect(lookupUrl('2211.17192')).toBe('https://arxiv.org/abs/2211.17192')
    expect(batchLookupUrl(['2211.17192', '2407.08608', '2211.17192'])).toBe(
      'https://export.arxiv.org/api/query?id_list=2211.17192%2C2407.08608&max_results=2',
    )
  })
})

describe('parseAtom', () => {
  it('每篇的编号去掉版本号,标题与摘要压成一行,作者按序,日期取第一版', () => {
    expect(parseAtom(ATOM)).toEqual([
      {
        id: '2211.17192',
        title: 'Fast Inference from Transformers via Speculative Decoding',
        authors: ['Yaniv Leviathan', 'Matan Kalman'],
        abstract: 'Inference from large autoregressive models like Transformers is slow.',
        submitted: '2022-11-30',
        journalRef: null,
        pdf: 'https://arxiv.org/pdf/2211.17192',
      },
      {
        id: '2407.08608',
        title: 'FlashAttention-3: Fast & Accurate',
        authors: ['Tri Dao'],
        abstract: 'Attention <fast>.',
        submitted: '2024-07-11',
        journalRef: 'NeurIPS 2024',
        pdf: 'https://arxiv.org/pdf/2407.08608',
      },
    ])
  })

  it('arXiv 的错误条目抛出它自己的说明', () => {
    expect(() => parseAtom(ERROR_ATOM)).toThrow('arXiv 拒绝了这次查询:incorrect id format for 1234.12345')
  })
})

describe('parseAbs', () => {
  it('从摘要页标准 citation 元数据还原论文,作者恢复为名字在前', () => {
    expect(parseAbs(ABS)).toEqual({
      id: '2605.26844',
      title: 'Not All Disagreement Is Learnable: Token Teachability in On-Policy Distillation',
      authors: ['Yuanyi Wang', 'Su Lu'],
      abstract: "Teacher's signal & student support.",
      submitted: '2026-05-26',
      journalRef: null,
      pdf: 'https://arxiv.org/pdf/2605.26844',
    })
  })

  it('不是论文摘要页时明确失败,不把代理错误页当成无结果', () => {
    expect(() => parseAbs('<html><title>Gateway</title></html>')).toThrow('arXiv 摘要页没有书目元数据')
  })
})

describe('createArxiv', () => {
  it('两次请求之间至少隔 3 秒,不够就先等', async () => {
    let clock = 0
    const sleeps: number[] = []
    const urls: string[] = []
    const get: HttpGet = async (url) => {
      urls.push(url)
      clock += 500
      return { status: 200, body: new TextEncoder().encode(urls.length === 1 ? ATOM : ABS) }
    }
    const arxiv = createArxiv({
      get, minIntervalMs: 3000, now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms },
    })
    const [found, one] = await Promise.all([arxiv.search('all:"speculative decoding"'), arxiv.lookup('2605.26844')])
    expect(urls).toEqual([searchUrl('all:"speculative decoding"'), lookupUrl('2605.26844')])
    expect(sleeps).toEqual([2500])
    expect(found).toHaveLength(2)
    expect(one?.id).toBe('2605.26844')
  })

  it('前一次失败不挡住后一次', async () => {
    const statuses = [404, 200]
    const get: HttpGet = async () => ({ status: statuses.shift()!, body: new TextEncoder().encode(ABS) })
    const arxiv = createArxiv({ get, minIntervalMs: 0, now: () => 0, sleep: async () => {} })
    await expect(arxiv.lookup('2605.26844')).rejects.toThrow('服务器返回 404')
    expect((await arxiv.lookup('2605.26844'))?.title).toBe('Not All Disagreement Is Learnable: Token Teachability in On-Policy Distillation')
  })

  it('同一编号的并发与后续查询共享会话缓存,不重复占用 arXiv 配额', async () => {
    let calls = 0
    const get: HttpGet = async () => { calls += 1; return { status: 200, body: new TextEncoder().encode(ABS) } }
    const arxiv = createArxiv({ get, minIntervalMs: 0, now: () => 0, sleep: async () => {} })
    await Promise.all([arxiv.lookup('2605.26844'), arxiv.lookup('2605.26844')])
    await arxiv.lookup('2605.26844')
    expect(calls).toBe(1)
  })

  it('多个编号合并成一次 API 查询,并与单篇查询共享缓存', async () => {
    const urls: string[] = []
    const get: HttpGet = async (url) => {
      urls.push(url)
      return { status: 200, body: new TextEncoder().encode(ATOM) }
    }
    const arxiv = createArxiv({ get, minIntervalMs: 0, now: () => 0, sleep: async () => {} })
    const found = await arxiv.lookupMany?.(['2211.17192', '2407.08608'])
    expect([...found!.keys()]).toEqual(['2211.17192', '2407.08608'])
    expect((await arxiv.lookup('2211.17192'))?.title).toContain('Speculative Decoding')
    expect(urls).toEqual([batchLookupUrl(['2211.17192', '2407.08608'])])
  })
})
