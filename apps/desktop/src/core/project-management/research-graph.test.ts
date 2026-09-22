import { describe, expect, it } from 'vitest'
import type { ResearchGraph } from '../../shared/contract.js'
import { overviewResearch, placeNode } from './research-graph.js'

const node = (
  id: string, x: number, y: number, width: number,
): ResearchGraph['nodes'][number] => ({
  id, label: id, state: 'idle', x, y, width, writebacks: [],
})

describe('placeNode', () => {
  it('没有前一个节点时放在左上角;那一列已经有节点就往下挪一行', () => {
    expect(placeNode({ nodes: [], edges: [] }, '起点', null)).toEqual({ x: 12, y: 12, width: 100 })
    expect(placeNode({ nodes: [node('a', 12, 12, 100)], edges: [] }, '另一条线', null))
      .toEqual({ x: 12, y: 66, width: 100 })
  })

  it('接在一个节点后面时放在它右边,宽度按字数算并且有上下限', () => {
    const graph = { nodes: [node('a', 12, 12, 100)], edges: [] }
    expect(placeNode(graph, '宽树实验', 'a')).toEqual({ x: 162, y: 12, width: 100 })
    expect(placeNode(graph, '一个很长很长很长很长很长的节点名字啊', 'a').width).toBe(240)
    expect(() => placeNode(graph, 'x', 'nope')).toThrow(/nope/)
  })
})

describe('overviewResearch', () => {
  it('只投影活跃节点本身并把分支互斥归类', () => {
    const graph: ResearchGraph = {
      nodes: [
        { ...node('root', 0, 0, 100), state: 'done', mode: 'supported' },
        {
          ...node('active', 100, 0, 100), state: 'act', mode: 'repairable',
          nextAction: 'Run the probe',
        },
        { ...node('failed', 100, 60, 100), mode: 'dead' },
        node('shelved', 100, 120, 100),
      ],
      edges: [['root', 'active'], ['root', 'failed'], ['root', 'shelved']],
      activeNodes: ['active'],
    }
    expect(overviewResearch(graph)).toEqual({
      pathState: 'active',
      activeNodes: [
        {
          id: 'active', label: 'active', state: 'act', mode: 'repairable',
          nextAction: 'Run the probe',
        },
      ],
      branches: { active: 1, supported: 1, failed: 1, shelved: 1 },
    })
  })

  it('两个兄弟节点同时活跃,都投影出来', () => {
    const graph: ResearchGraph = {
      nodes: [
        node('root', 0, 0, 100),
        { ...node('a', 100, 0, 100), state: 'act' },
        { ...node('b', 100, 60, 100), state: 'act' },
      ],
      edges: [['root', 'a'], ['root', 'b']],
      activeNodes: ['a', 'b'],
    }
    expect(overviewResearch(graph).activeNodes.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('区分空图、未指定活跃节点与断裂(活跃 id 不在图里)', () => {
    expect(overviewResearch({ nodes: [], edges: [] }).pathState).toBe('empty')
    expect(overviewResearch({ nodes: [node('root', 0, 0, 100)], edges: [] }).pathState)
      .toBe('missing')
    expect(overviewResearch({
      nodes: [node('root', 0, 0, 100), node('leaf', 100, 0, 100)],
      edges: [], activeNodes: ['nope'],
    }).pathState).toBe('broken')
  })
})
