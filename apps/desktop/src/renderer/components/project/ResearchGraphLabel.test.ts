import { describe, expect, it } from 'vitest'
import { graphLabelWidth, graphNodeLabel, graphNodeWidth } from './ResearchGraph.js'

describe('research graph node labels', () => {
  it('widens a node so a mixed Chinese and Latin label fits between the dot and the right edge', () => {
    const label = 'QA：以引擎真值出题，论证数据集的必要性'
    const width = graphNodeWidth(label, 180)
    expect(graphNodeLabel(label)).toBe(label)
    expect(width).toBeGreaterThanOrEqual(32 + graphLabelWidth(label) + 16)
    expect(width).toBeLessThanOrEqual(360)
  })

  it('keeps the minimum width for a short label', () => {
    expect(graphNodeWidth('三个模块的消融', 100)).toBe(172)
  })

  it('cuts a label that cannot fit the widest node and caps the width', () => {
    const label = '长程稳健性'.repeat(12)
    const drawn = graphNodeLabel(label)
    expect(drawn.endsWith('…')).toBe(true)
    expect(drawn.length).toBeLessThan(label.length)
    expect(32 + graphLabelWidth(drawn) + 16).toBeLessThanOrEqual(360)
    expect(graphNodeWidth(label, 180)).toBeGreaterThan(340)
    expect(graphNodeWidth(label, 180)).toBeLessThanOrEqual(360)
  })
})
