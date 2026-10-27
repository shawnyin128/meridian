import { describe, expect, it } from 'vitest'
import type { HttpGet, HttpOptions } from './http.js'
import { createDblp, parseDblpVenue } from './dblp.js'

const body = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

const LEVIATHAN = { title: 'Fast Inference from Transformers via Speculative Decoding', authors: ['Yaniv Leviathan', 'Matan Kalman', 'Yossi Matias'] }

const AUTHORS = {
  author: [
    { '@pid': '255/5249', text: 'Yaniv Leviathan' }, { '@pid': '330/1955', text: 'Matan Kalman' }, { '@pid': 'm/YossiMatias', text: 'Yossi Matias' },
  ],
}
/** The ICML entry of Leviathan et al. as the publ search API lists it. */
const ICML = {
  '@score': '10', '@id': '4470330',
  info: {
    authors: AUTHORS, title: 'Fast Inference from Transformers via Speculative Decoding.', venue: 'ICML', pages: '19274-19286',
    year: '2023', type: 'Conference and Workshop Papers', access: 'open', key: 'conf/icml/LeviathanKM23',
    ee: 'https://proceedings.mlr.press/v202/leviathan23a.html', url: 'https://dblp.org/rec/conf/icml/LeviathanKM23',
  },
  url: 'URL#4470330',
}
/** Its arXiv copy, which DBLP lists under CoRR. */
const CORR = {
  '@score': '10', '@id': '3800261',
  info: {
    authors: AUTHORS, title: 'Fast Inference from Transformers via Speculative Decoding.', venue: 'CoRR', volume: 'abs/2211.17192',
    year: '2022', type: 'Informal and Other Publications', access: 'open', key: 'journals/corr/abs-2211-17192',
    doi: '10.48550/ARXIV.2211.17192', ee: 'https://doi.org/10.48550/arXiv.2211.17192', url: 'https://dblp.org/rec/journals/corr/abs-2211-17192',
  },
  url: 'URL#3800261',
}
/** A workshop version a year before the conference paper, with one author, which DBLP gives as an object. */
const WORKSHOP = {
  '@score': '9', '@id': '4012345',
  info: {
    authors: { author: { '@pid': '255/5249', text: 'Yaniv Leviathan' } }, title: 'Fast Inference from Transformers via Speculative Decoding.',
    venue: ['ES-FoMo@ICML', 'ICML Workshops'], year: '2022', type: 'Conference and Workshop Papers', key: 'conf/icml/Leviathan22w',
    url: 'https://dblp.org/rec/conf/icml/Leviathan22w',
  },
  url: 'URL#4012345',
}
const NEAR_MISS = {
  '@score': '8', '@id': '4470999',
  info: {
    authors: AUTHORS, title: 'Fast Inference from Transformers via Speculative Sampling.', venue: 'ICML', year: '2023',
    type: 'Conference and Workshop Papers', key: 'conf/icml/LeviathanKM23b', url: 'https://dblp.org/rec/conf/icml/LeviathanKM23b',
  },
  url: 'URL#4470999',
}
const OTHER_AUTHORS = {
  ...ICML, info: { ...ICML.info, authors: { author: [{ '@pid': '1/1', text: 'Wei Chen 0001' }, { '@pid': '2/2', text: 'Ana Ruiz' }] } },
}

/** A publ search API answer listing `hits`. */
const answer = (hits: unknown[]) => body({
  result: {
    query: 'fast* inference* from* transformers* via* speculative* decoding*', status: { '@code': '200', text: 'OK' },
    time: { '@unit': 'msecs', text: '3.07' },
    hits: { '@total': String(hits.length), '@computed': String(hits.length), '@sent': String(hits.length), '@first': '0', ...(hits.length === 0 ? {} : { hit: hits }) },
  },
})

describe('DBLP 按标题查会场', () => {
  it('标题规范化后完全一致、有一位作者姓氏对得上的会议条目才算；CoRR 的那条不算', () => {
    expect(parseDblpVenue(answer([CORR, ICML]), LEVIATHAN)).toEqual({ venue: 'ICML', year: 2023, source: 'dblp' })
    expect(parseDblpVenue(answer([ICML]), { ...LEVIATHAN, title: 'Fast inference from transformers via speculative decoding.' }))
      .toEqual({ venue: 'ICML', year: 2023, source: 'dblp' })
  })

  it('标题差一个词、只有 CoRR 条目、作者姓氏都对不上或没有结果时都不算', () => {
    expect(parseDblpVenue(answer([NEAR_MISS]), LEVIATHAN)).toBeUndefined()
    expect(parseDblpVenue(answer([CORR]), LEVIATHAN)).toBeUndefined()
    expect(parseDblpVenue(answer([OTHER_AUTHORS]), LEVIATHAN)).toBeUndefined()
    expect(parseDblpVenue(answer([]), LEVIATHAN)).toBeUndefined()
  })

  it('几条会场条目都对得上时取最早的那次发表', () => {
    expect(parseDblpVenue(answer([ICML, CORR, WORKSHOP]), LEVIATHAN)).toEqual({ venue: 'ES-FoMo@ICML', year: 2022, source: 'dblp' })
  })

  it('按标题的词发一次 GET，限时；超时和 429 都抛出，不重试', async () => {
    const sent: { url: string; options: HttpOptions }[] = []
    const ok: HttpGet = async (url, options) => { sent.push({ url, options }); return { status: 200, body: answer([ICML]) } }
    expect(await createDblp({ get: ok, sleep: async () => {} }).venueOf({ ...LEVIATHAN, title: 'Fast Inference from Transformers: via Speculative-Decoding' }))
      .toEqual({ venue: 'ICML', year: 2023, source: 'dblp' })
    const url = new URL(sent[0]!.url)
    expect([url.origin + url.pathname, url.searchParams.get('q'), url.searchParams.get('format')])
      .toEqual(['https://dblp.org/search/publ/api', 'fast inference from transformers via speculative decoding', 'json'])
    expect(sent[0]!.options.timeoutMs).toBeGreaterThan(0)

    let asked = 0
    const limited: HttpGet = async () => { asked += 1; return { status: 429, body: new Uint8Array(), retryAfterMs: 0 } }
    await expect(createDblp({ get: limited, sleep: async () => {} }).venueOf(LEVIATHAN)).rejects.toMatchObject({ status: 429 })
    expect(asked).toBe(1)
    const timeout: HttpGet = async () => { throw new DOMException('The operation timed out.', 'TimeoutError') }
    await expect(createDblp({ get: timeout, sleep: async () => {} }).venueOf(LEVIATHAN)).rejects.toMatchObject({ name: 'TimeoutError' })
  })
})
