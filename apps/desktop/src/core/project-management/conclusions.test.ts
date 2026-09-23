import { describe, expect, it } from 'vitest'
import type { GraphNode, ResearchGraph } from '../../shared/contract.js'
import { conclusionFingerprint, projectConclusions, type ProjectClaim } from './conclusions.js'
import type { ProjectRecord } from './page.js'

const node = (id: string, mode: GraphNode['mode'], extra: Partial<GraphNode> = {}): GraphNode => ({
  id, label: id, state: 'idle', ...(mode === undefined ? {} : { mode }), x: 0, y: 0, width: 100, writebacks: [], ...extra,
})

const WIDE = { text: '宽树在 B≥8 时净赚', date: '2026-09-20', evidence: [{ id: 'exp-1', title: '宽度扫描' }] }

const GRAPH: ResearchGraph = {
  nodes: [
    node('t.wide', 'supported', { tasks: ['task-1', 'task-gone'], conclusion: WIDE }),
    node('t.stop', 'dead', { conclusion: { text: '提前停止不划算', date: '2026-09-18', evidence: [] } }),
    node('t.open', 'unresolved', { conclusion: { text: '重开之前写的', evidence: [] } }),
    node('t.bare', 'supported'),
  ],
  edges: [],
}

const project = (extra: Partial<ProjectRecord> = {}): Pick<ProjectRecord, 'tasks' | 'conclusionList' | 'verifiedConclusions'> => ({
  tasks: [{ id: 'task-1', title: '跑宽度扫描', start: '2026-09-15', end: '2026-09-16', state: 'done', priority: 'p1' }],
  conclusionList: [{ id: 'c1', text: '旧版手写的一条', state: 'pending', date: '2026-09-19', source: '手动添加' }],
  ...extra,
})

describe('project conclusions', () => {
  it('每个已关闭且写了结论的节点一条、旧版结论一条,按日期从新到旧;重开的节点和没写结论的节点不算', () => {
    const rows = projectConclusions(project(), GRAPH, [])
    expect(rows.map((r) => r.id)).toEqual(['t.wide', 'c1', 't.stop'])
    expect(rows[0]).toEqual({
      id: 't.wide', node: 't.wide', text: WIDE.text, date: '2026-09-20', state: 'pending',
      tasks: [{ id: 'task-1', title: '跑宽度扫描' }], experiments: WIDE.evidence, wiki: [],
    })
    expect(rows[1]).toMatchObject({ source: '手动添加', state: 'verified', tasks: [], experiments: [] })
  })

  it('验证过的结论是已验证;结论文字或证据改了以后回到待验证', () => {
    const verified = project({ verifiedConclusions: [{ node: 't.wide', fingerprint: conclusionFingerprint(WIDE), date: '2026-09-21' }] })
    expect(projectConclusions(verified, GRAPH, [])[0]!.state).toBe('verified')
    const edited = { ...GRAPH, nodes: GRAPH.nodes.map((n) => (n.id === 't.wide' ? { ...n, conclusion: { ...WIDE, text: '宽树在 B≥16 时净赚' } } : n)) }
    expect(projectConclusions(verified, edited, [])[0]!.state).toBe('pending')
    const regrounded = { ...GRAPH, nodes: GRAPH.nodes.map((n) => (n.id === 't.wide' ? { ...n, conclusion: { ...WIDE, evidence: [] } } : n)) }
    expect(projectConclusions(verified, regrounded, [])[0]!.state).toBe('pending')
  })

  it('写进 Wiki 的列出页与版本;那条结论有冲突时整条是有冲突', () => {
    const claims: ProjectClaim[] = [
      { page: 'topics/sd', title: 'Speculative decoding', claim: 'wide', version: 2, conflicted: false, node: 't.wide' },
      { page: 'topics/batch', title: 'Batch serving', claim: 'old', version: 1, conflicted: true, conclusion: 'c1' },
    ]
    const [wide, legacy] = projectConclusions(project(), GRAPH, claims)
    expect(wide!.wiki).toEqual([{ page: 'topics/sd', title: 'Speculative decoding', claim: 'wide', version: 2 }])
    expect(wide!.state).toBe('pending')
    expect(legacy!.state).toBe('conflicting')
  })
})
