import { describe, expect, it } from 'vitest'
import { selectShown, type ShownCandidate } from './selection.js'

const none = (): number => 0
const directions = [{ id: 'core', core: true }, { id: 'b', core: false }, { id: 'c', core: false }]
const papers = (direction: string, scores: number[]): ShownCandidate[] => (
  scores.map((score, at) => ({ paperId: `${direction}${at}`, score, direction }))
)

describe('shown selection', () => {
  it('低于 0.5 的论文不显示,哪怕还有空位', () => {
    const shown = selectShown([
      { paperId: 'high', score: 0.9, direction: 'core' },
      { paperId: 'edge', score: 0.5, direction: 'core' },
      { paperId: 'low', score: 0.49, direction: 'core' },
    ], [{ id: 'core', core: true }], 5, none)
    expect(shown).toEqual(['high', 'edge'])
  })

  it('核心方向占一半位置,其余方向平分剩下的', () => {
    const shown = selectShown([
      ...papers('b', [0.99, 0.98, 0.97, 0.96]),
      ...papers('c', [0.95, 0.94, 0.93]),
      ...papers('core', [0.6, 0.59, 0.58, 0.57, 0.56]),
    ], directions, 8, none)
    expect(shown).toEqual(['core0', 'core1', 'core2', 'core3', 'b0', 'b1', 'c0', 'c1'])
  })

  it('除不尽的位置给靠前的方向,方向填不满的位置让给剩下最好的论文', () => {
    expect(selectShown([
      ...papers('core', [0.9, 0.8, 0.7]), ...papers('b', [0.6, 0.6]), ...papers('c', [0.55, 0.54]),
    ], directions, 6, none)).toEqual(['core0', 'core1', 'core2', 'b0', 'b1', 'c0'])
    expect(selectShown([
      ...papers('core', [0.9]), ...papers('b', [0.8, 0.7, 0.65, 0.6]), { paperId: 'loose', score: 0.75 },
    ], directions, 5, none)).toEqual(['core0', 'b0', 'loose', 'b1', 'b2'])
  })

  it('同一份额里用 MMR 把近乎重复的论文往后排', () => {
    const twins = new Set(['core0', 'core1'])
    const similarity = (left: string, right: string): number => (twins.has(left) && twins.has(right) ? 0.95 : 0.1)
    expect(selectShown(papers('core', [0.9, 0.88, 0.8]), [{ id: 'core', core: true }], 2, similarity))
      .toEqual(['core0', 'core2'])
    expect(selectShown(papers('core', [0.9, 0.88, 0.8]), [{ id: 'core', core: true }], 2, none))
      .toEqual(['core0', 'core1'])
  })
})
