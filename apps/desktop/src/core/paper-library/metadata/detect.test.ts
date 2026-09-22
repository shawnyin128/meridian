import { describe, expect, it } from 'vitest'
import { arxivIdOf, usableTitle } from './detect.js'
import type { PdfFacts } from './pdf-probe.js'

const facts = (over: Partial<PdfFacts> = {}): PdfFacts =>
  ({ title: null, subject: null, keywords: null, firstPage: '', pageCount: 1, ...over })

describe('paper metadata arxivIdOf', () => {
  it('首页印记优先于文件名,去掉版本号', () => {
    expect(arxivIdOf(facts({ firstPage: 'arXiv:2211.17192v2 [cs.LG] 18 May 2023' }), '1808-05779v3.pdf'))
      .toBe('2211.17192')
  })

  it('info 的标题、主题或关键词里写着 arXiv: 编号也认', () => {
    expect(arxivIdOf(facts({ subject: 'arXiv:2407.08608' }), 'x.pdf')).toBe('2407.08608')
  })

  it('文件名去掉库里的散列前缀之后,开头的编号也认,连字符当点', () => {
    expect(arxivIdOf(facts(), 'paper-pdf-0416b0ce56d6-2511-10645v1.pdf')).toBe('2511.10645')
    expect(arxivIdOf(facts(), '1808-05779v3')).toBe('1808.05779')
    expect(arxivIdOf(facts(), '2211.17192.pdf')).toBe('2211.17192')
  })

  it('月份不对、不在文件名开头、首页没有 arXiv: 前缀、序号六位,都不认', () => {
    expect(arxivIdOf(facts({ firstPage: 'see 1706.03762 for details' }), 'Leviathan et al. - 2023 - Fast.pdf')).toBeNull()
    expect(arxivIdOf(facts(), '2213.17192.pdf')).toBeNull()
    expect(arxivIdOf(facts(), 'paper-pdf-01426973545b-Ding-et-al-2024-LongRoPE.pdf')).toBeNull()
    expect(arxivIdOf(facts(), '2511-106451.pdf')).toBeNull()
  })
})

describe('usableTitle', () => {
  it('像样的标题去掉首尾空白留下,文件名式、太短、untitled 与 Word 默认标题不要', () => {
    expect(usableTitle('  Mixtral of Experts ')).toBe('Mixtral of Experts')
    expect(usableTitle('main.pdf')).toBeNull()
    expect(usableTitle('Paper')).toBeNull()
    expect(usableTitle('Untitled document')).toBeNull()
    expect(usableTitle('Microsoft Word - final_v3')).toBeNull()
    expect(usableTitle(null)).toBeNull()
  })
})
