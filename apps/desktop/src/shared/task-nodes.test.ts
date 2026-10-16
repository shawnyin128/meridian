import { describe, expect, it } from 'vitest'
import type { ResearchGraph } from './contract.js'
import { withTaskNodes } from './task-nodes.js'

const node = (id: string, tasks?: string[]) => ({
  id, label: id, state: 'idle' as const, x: 0, y: 0, width: 100, writebacks: [],
  ...(tasks === undefined ? {} : { tasks }),
})
const graph: ResearchGraph = { nodes: [node('a', ['t1', 't2']), node('b'), node('c', ['t3'])], edges: [['a', 'b']] }

describe('withTaskNodes', () => {
  it('手动设的节点优先:任务从图里原来那个节点挪到手动设的节点下,别的任务不动', () => {
    expect(withTaskNodes(graph, { t1: 'b', t4: 'c' }).nodes.map((n) => [n.id, n.tasks])).toEqual([
      ['a', ['t2']], ['b', ['t1']], ['c', ['t3', 't4']],
    ])
  })

  it('手动设的节点不在图里时这一条不算,任务留在图里原来的节点下', () => {
    expect(withTaskNodes(graph, { t1: 'gone' })).toEqual(graph)
    expect(withTaskNodes(graph, undefined)).toEqual(graph)
  })
})
