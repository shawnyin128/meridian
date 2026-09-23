import { describe, expect, it } from 'vitest'
import type { GraphNode, ResearchGraph } from '../../shared/contract.js'
import {
  conclusionFingerprint, projectConclusions, type ConcludedNode, type ProjectClaim,
} from './conclusions.js'
import type { ProjectRecord } from './page.js'

const node = (id: string, mode: GraphNode['mode'], extra: Partial<GraphNode> = {}): GraphNode => ({
  id, label: id, state: 'idle', ...(mode === undefined ? {} : { mode }), x: 0, y: 0, width: 100, writebacks: [], ...extra,
})

const WIDE = {
  text: '宽树在 B≥8 时净赚', date: '2026-09-20', evidence: [{ id: 'exp-1', title: '宽度扫描' }], revision: 'r1',
}
const WIDE_NODE: ConcludedNode = { ...node('t.wide', 'supported', { tasks: ['task-1', 'task-gone'] }), conclusion: WIDE }

const GRAPH: ResearchGraph = {
  nodes: [
    WIDE_NODE,
    node('t.stop', 'dead', { conclusion: { text: '提前停止不划算', date: '2026-09-18', evidence: [] } }),
    node('t.open', 'unresolved', { conclusion: { text: '重开之前写的', evidence: [] } }),
    node('t.bare', 'supported'),
  ],
  edges: [],
}

const project = (extra: Partial<ProjectRecord> = {}): Pick<ProjectRecord, 'tasks' | 'conclusionList' | 'verifiedConclusions'> => ({
  tasks: [{ id: 'task-1', title: '跑宽度扫描', start: '2026-09-15', end: '2026-09-16', state: 'done', priority: 'p1' }],
  conclusionList: [
    { id: 'c1', text: '旧版手写的一条', state: 'pending', date: '2026-09-19', source: '手动添加' },
    { id: 'c2', text: '旧版已验证的一条', state: 'verified', date: '2026-09-10', source: '手动添加' },
    { id: 'c3', text: '旧版有冲突的一条', state: 'conflicting', date: '2026-09-09', source: '手动添加' },
  ],
  ...extra,
})

const verifiedWide = project({
  verifiedConclusions: [{ node: 't.wide', fingerprint: conclusionFingerprint(WIDE_NODE), date: '2026-09-21' }],
})
const withWide = (patch: Partial<GraphNode>): ResearchGraph =>
  ({ ...GRAPH, nodes: GRAPH.nodes.map((n) => (n.id === 't.wide' ? { ...n, ...patch } : n)) })

describe('project conclusions', () => {
  it('每个已关闭且写了结论的节点一条、旧版结论一条,按日期从新到旧;重开的节点和没写结论的节点不算', () => {
    const rows = projectConclusions(project(), GRAPH, [], [])
    expect(rows.map((r) => r.id)).toEqual(['t.wide', 'c1', 't.stop', 'c2', 'c3'])
    expect(rows[0]).toEqual({
      id: 't.wide', node: 't.wide', text: WIDE.text, date: '2026-09-20', state: 'pending',
      fingerprint: conclusionFingerprint(WIDE_NODE),
      tasks: [{ id: 'task-1', title: '跑宽度扫描' }], experiments: WIDE.evidence, wiki: [],
    })
    expect(rows[1]).toMatchObject({ source: '手动添加', tasks: [], experiments: [] })
  })

  it('旧版结论保留存下的状态:待验证还是待验证,有冲突还是有冲突,只有已验证显示已验证', () => {
    const states = Object.fromEntries(projectConclusions(project(), GRAPH, [], []).map((r) => [r.id, r.state]))
    expect([states['c1'], states['c2'], states['c3']]).toEqual(['pending', 'verified', 'conflicting'])
  })

  it('验证过的结论是已验证并带验证日期;文字、证据、关闭状态或 Lab 给的修订变了以后回到待验证', () => {
    expect(projectConclusions(verifiedWide, GRAPH, [], [])[0]).toMatchObject({ state: 'verified', verifiedOn: '2026-09-21' })
    const changed = [
      withWide({ conclusion: { ...WIDE, text: '宽树在 B≥16 时净赚' } }),
      withWide({ conclusion: { ...WIDE, evidence: [] } }),
      withWide({ mode: 'dead' }),
      withWide({ conclusion: { ...WIDE, revision: 'r2' } }),
    ]
    for (const graph of changed) {
      const [row] = projectConclusions(verifiedWide, graph, [], [])
      expect(row).toMatchObject({ state: 'pending' })
      expect(row).not.toHaveProperty('verifiedOn')
    }
  })

  it('写进 Wiki 的列出页与版本;那条结论有冲突时整条是有冲突', () => {
    const claims: ProjectClaim[] = [
      { page: 'topics/sd', title: 'Speculative decoding', claim: 'wide', version: 2, conflicted: false, node: 't.wide' },
      { page: 'topics/batch', title: 'Batch serving', claim: 'old', version: 1, conflicted: true, conclusion: 'c2' },
    ]
    const rows = projectConclusions(project(), GRAPH, claims, [])
    expect(rows[0]!.wiki).toEqual([{ page: 'topics/sd', title: 'Speculative decoding', claim: 'wide', version: 2 }])
    expect(rows[0]!.state).toBe('pending')
    expect(rows.find((r) => r.id === 'c2')!.state).toBe('conflicting')
  })

  it('别的结论对这个节点或旧版结论提了冲突,它也是有冲突', () => {
    const rows = projectConclusions(verifiedWide, GRAPH, [], [{ node: 't.wide' }, { conclusion: 'c2' }])
    expect(rows.find((r) => r.id === 't.wide')!.state).toBe('conflicting')
    expect(rows.find((r) => r.id === 'c2')!.state).toBe('conflicting')
    expect(rows.find((r) => r.id === 't.stop')!.state).toBe('pending')
  })
})
