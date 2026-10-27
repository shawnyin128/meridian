import { describe, expect, it } from 'vitest'
import { directionLabel } from './directions.js'
import type { RecommendationSeed } from './types.js'

const seed = (paperId: string, title: string): RecommendationSeed => ({ paperId, title, abstract: '', source: 'project' })

describe('discovery direction labels', () => {
  const papers = new Map([
    ['ARXIV:1', { topics: ['KV cache', '量化'] }],
    ['ARXIV:2', { topics: ['量化'] }],
    ['ARXIV:3', { topics: [], shortTitle: 'H2O' }],
  ])
  const paperOf = (paperId: string) => papers.get(paperId)

  it('取方向里最多种子共有的 Wiki 主题名', () => {
    expect(directionLabel([seed('ARXIV:1', 'KIVI: A Tuning-Free Asymmetric 2bit Quantization'), seed('ARXIV:2', 'QuIP')], paperOf, new Set()))
      .toBe('量化')
  })

  it('同一项目的别的方向已经用了这个主题名，就取种子论文的短标题', () => {
    expect(directionLabel([seed('ARXIV:1', 'KIVI: A Tuning-Free Asymmetric 2bit Quantization'), seed('ARXIV:2', 'QuIP')], paperOf, new Set(['量化', 'KV cache'])))
      .toBe('KIVI')
  })

  it('没有主题时取种子论文设好的短标题，没设时取标题冒号前的那一段，再没有就用整个标题', () => {
    expect(directionLabel([seed('ARXIV:3', 'H$_2$O: Heavy-Hitter Oracle')], paperOf, new Set())).toBe('H2O')
    expect(directionLabel([seed('S2:9', 'SnapKV: LLM Knows What You are Looking for')], paperOf, new Set())).toBe('SnapKV')
    expect(directionLabel([seed('S2:8', 'Efficient Memory Management for Large Language Model Serving')], paperOf, new Set()))
      .toBe('Efficient Memory Management for Large Language Model Serving')
  })
})
