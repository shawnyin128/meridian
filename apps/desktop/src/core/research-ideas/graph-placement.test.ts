import { describe, expect, it } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import { placeResearchIdeaOnGraph } from './graph-placement.js'

const TODAY = '2026-09-18'

describe('idea graph placement', () => {
  it('creates, changes, and removes one explicit node association', () => {
    const store = createFixtureStore(() => TODAY)
    const idea = store.listIdeas().find((candidate) => candidate.project === 'draft')!
    const before = store.getProject('draft').graph.nodes.length

    const created = placeResearchIdeaOnGraph(store, idea.id, {
      kind: 'create', label: '验证动态预算', after: null,
    })
    expect(created.project.graph.nodes).toHaveLength(before + 1)
    expect(created.idea.node).toBe(created.nodeId)
    expect(created.project.graph.nodes.find((node) => node.id === created.nodeId)?.label)
      .toBe('验证动态预算')

    const existing = created.project.graph.nodes.find((node) => node.id !== created.nodeId)!
    const linked = placeResearchIdeaOnGraph(store, idea.id, {
      kind: 'link', nodeId: existing.id,
    })
    expect(linked.idea.node).toBe(existing.id)

    const unlinked = placeResearchIdeaOnGraph(store, idea.id, { kind: 'unlink' })
    expect(unlinked.idea.node).toBeUndefined()
    expect(unlinked.nodeId).toBeNull()
  })

  it('requires a project link and rejects nodes outside that project', () => {
    const store = createFixtureStore(() => TODAY)
    const independent = store.createIdea('amortize', '独立想法', '还没有项目')
    expect(() => placeResearchIdeaOnGraph(store, independent.id, {
      kind: 'create', label: independent.title, after: null,
    })).toThrow(/先把想法关联到项目/)

    const linked = store.listIdeas().find((candidate) => candidate.project === 'draft')!
    expect(() => placeResearchIdeaOnGraph(store, linked.id, {
      kind: 'link', nodeId: 'missing-node',
    })).toThrow(/节点不存在/)
  })

  it('links and unlinks ideas against a workspace graph without mutating that graph', () => {
    const fixture = createFixtureStore(() => TODAY)
    const idea = fixture.listIdeas().find((candidate) => candidate.project === 'draft')!
    const project = fixture.getProject('draft')
    const workspaceNode = {
      id: 'speculative-decoding.E', label: 'Batch-aware 校准曲线', state: 'act' as const,
      x: 20, y: 20, width: 180, writebacks: [],
    }
    const store = {
      ...fixture,
      getProject: (projectId: string) => projectId === project.id
        ? {
          ...project,
          workspace: {
            kind: 'local' as const,
            root: '/tmp/research',
            state: 'ready' as const,
            planPath: '/tmp/research/.meridian/control/plan.json',
            graph: { nodes: [workspaceNode], edges: [] },
            events: [],
          },
        }
        : fixture.getProject(projectId),
    }

    const linked = placeResearchIdeaOnGraph(store, idea.id, {
      kind: 'link', nodeId: workspaceNode.id,
    })
    expect(linked.idea.node).toBe(workspaceNode.id)
    expect(linked.project.workspace?.graph?.nodes).toEqual([workspaceNode])

    const unlinked = placeResearchIdeaOnGraph(store, idea.id, { kind: 'unlink' })
    expect(unlinked.idea.node).toBeUndefined()
    expect(unlinked.nodeId).toBeNull()

    expect(() => placeResearchIdeaOnGraph(store, idea.id, {
      kind: 'create', label: '新的工作区节点', after: workspaceNode.id,
    })).toThrow(/Lab 更新协议/)
  })
})
