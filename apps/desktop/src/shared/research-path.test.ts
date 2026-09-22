import { describe, expect, it } from 'vitest'
import type { ResearchGraph } from './contract.js'
import { researchPathState } from './research-path.js'

const graph = (over: Partial<ResearchGraph>): ResearchGraph => ({ nodes: [], edges: [], ...over })
const node = (id: string) => ({
  id, label: id, state: 'idle' as const, x: 0, y: 0, width: 100, writebacks: [],
})

describe('researchPathState', () => {
  it('区分空图、未选路径、断裂路径和有效路径', () => {
    expect(researchPathState(graph({}))).toBe('empty')
    expect(researchPathState(graph({ nodes: [node('a')] }))).toBe('missing')
    expect(researchPathState(graph({ nodes: [node('a')], activePath: ['missing'] }))).toBe('broken')
    expect(researchPathState(graph({
      nodes: [node('a'), node('b')], edges: [], activePath: ['a', 'b'],
    }))).toBe('broken')
    expect(researchPathState(graph({
      nodes: [node('a'), node('b')], edges: [['a', 'b']], activePath: ['a', 'b'],
    }))).toBe('active')
  })
})
