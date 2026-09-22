import { describe, expect, it } from 'vitest'
import type { ResearchGraph } from './contract.js'
import { activeRoutes, researchPathState } from './research-path.js'

const graph = (over: Partial<ResearchGraph>): ResearchGraph => ({ nodes: [], edges: [], ...over })
const node = (id: string) => ({
  id, label: id, state: 'idle' as const, x: 0, y: 0, width: 100, writebacks: [],
})

describe('researchPathState', () => {
  it('区分空图、未选节点、断裂(活跃 id 不在图里)和有效', () => {
    expect(researchPathState(graph({}))).toBe('empty')
    expect(researchPathState(graph({ nodes: [node('a')] }))).toBe('missing')
    expect(researchPathState(graph({ nodes: [node('a')], activeNodes: ['missing'] }))).toBe('broken')
    expect(researchPathState(graph({
      nodes: [node('a'), node('b')], activeNodes: ['a', 'b'],
    }))).toBe('active')
  })
})

describe('activeRoutes', () => {
  it('两个兄弟节点同时活跃:各自的祖先都在集合里,祖先本身不算活跃节点', () => {
    const two = graph({
      nodes: [node('root'), node('a'), node('b')],
      edges: [['root', 'a'], ['root', 'b']],
    })
    const routes = activeRoutes(two, ['a', 'b'])
    expect(routes.nodes).toEqual(new Set(['root', 'a', 'b']))
    expect(routes.edges).toEqual(new Set(['root\u0000a', 'root\u0000b']))
  })

  it('只有一个节点活跃时,另一条兄弟分支的边不算在活跃路径上', () => {
    const two = graph({
      nodes: [node('root'), node('a'), node('b')],
      edges: [['root', 'a'], ['root', 'b']],
    })
    const routes = activeRoutes(two, ['a'])
    expect(routes.nodes).toEqual(new Set(['root', 'a']))
    expect(routes.edges).toEqual(new Set(['root\u0000a']))
  })

  it('不在图里的活跃 id 不贡献任何节点或边', () => {
    const single = graph({ nodes: [node('a')], edges: [] })
    expect(activeRoutes(single, ['missing'])).toEqual({ nodes: new Set(), edges: new Set() })
  })
})
