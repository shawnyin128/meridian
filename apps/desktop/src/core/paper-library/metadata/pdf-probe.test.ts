import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { minimalPdf } from '../../net/minimal-pdf.js'
import { extractPdfPages, probePdf } from './pdf-probe.js'

const FIXTURE_PDF = resolve(import.meta.dirname,
  '../../fixtures/vault/sources/papers/paper-pdf-e0b2ea3a1a54-Fast-Inference-from-Transformers-via-Speculative-Decoding.pdf')

describe('probePdf', () => {
  it('读出 info 里的标题与首页上的 arXiv 印记', async () => {
    const facts = await probePdf(minimalPdf({
      title: 'Fast Inference (Draft)',
      lines: ['arXiv:2211.17192v2  [cs.LG]  18 May 2023', 'Fast Inference from Transformers'],
    }))
    expect(facts.title).toBe('Fast Inference (Draft)')
    expect(facts.firstPage).toContain('arXiv:2211.17192v2')
    expect(facts.pageCount).toBe(1)
  })

  it('info 里没有标题时给 null,调用方的字节原样不动', async () => {
    const bytes = minimalPdf({ lines: ['Plain paper'] })
    const copy = bytes.slice()
    const facts = await probePdf(bytes)
    expect(facts.title).toBeNull()
    expect(facts.firstPage).toBe('Plain paper')
    expect(bytes).toEqual(copy)
  })

  it('fixture 库里的原文读得出首页文字与真实页数', async () => {
    const facts = await probePdf(new Uint8Array(readFileSync(FIXTURE_PDF)))
    expect(facts.firstPage).toContain('Speculative Decoding fixture page 1')
    expect(facts.pageCount).toBe(3)
  })

  it('坏掉的 PDF 抛出', async () => {
    await expect(probePdf(new TextEncoder().encode('%PDF-1.4\nbroken'))).rejects.toThrow()
  })

  it('extracts source text with stable one-based page numbers', async () => {
    const pages = await extractPdfPages(minimalPdf({ lines: ['Grounded source text'] }))
    expect(pages).toEqual([{ number: 1, text: 'Grounded source text' }])
  })
})
