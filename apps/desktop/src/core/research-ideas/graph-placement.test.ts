import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureStore } from '../fixture-store.js'
import { placeResearchIdeaOnGraph } from './graph-placement.js'

const TODAY = '2026-09-18'

describe('idea graph placement', () => {
  it('creates, changes, and removes one explicit node association', async () => {
    const store = createFixtureStore(() => TODAY)
    const idea = store.listIdeas().find((candidate) => candidate.project === 'draft')!
    const before = (await store.getProject('draft')).graph.nodes.length

    const created = await placeResearchIdeaOnGraph(store, idea.id, {
      kind: 'create', label: '验证动态预算', after: null,
    })
    expect(created.project!.graph.nodes).toHaveLength(before + 1)
    expect(created.idea.node).toBe(created.nodeId)
    expect(created.project!.graph.nodes.find((node) => node.id === created.nodeId)?.label)
      .toBe('验证动态预算')

    const existing = created.project!.graph.nodes.find((node) => node.id !== created.nodeId)!
    const linked = await placeResearchIdeaOnGraph(store, idea.id, {
      kind: 'link', nodeId: existing.id,
    })
    expect(linked.idea.node).toBe(existing.id)

    const unlinked = await placeResearchIdeaOnGraph(store, idea.id, { kind: 'unlink' })
    expect(unlinked.idea.node).toBeUndefined()
    expect(unlinked.nodeId).toBeNull()
  })

  it('requires a project link and rejects nodes outside that project', async () => {
    const store = createFixtureStore(() => TODAY)
    const independent = store.createIdea('amortize', '独立想法', '还没有项目')
    await expect(placeResearchIdeaOnGraph(store, independent.id, {
      kind: 'create', label: independent.title, after: null,
    })).rejects.toThrow(/先把想法关联到项目/)

    const linked = store.listIdeas().find((candidate) => candidate.project === 'draft')!
    await expect(placeResearchIdeaOnGraph(store, linked.id, {
      kind: 'link', nodeId: 'missing-node',
    })).rejects.toThrow(/节点不存在/)
  })

  it('links and unlinks ideas against a workspace graph without mutating that graph', async () => {
    const fixture = createFixtureStore(() => TODAY)
    const idea = fixture.listIdeas().find((candidate) => candidate.project === 'draft')!
    const project = await fixture.getProject('draft')
    const workspaceNode = {
      id: 'speculative-decoding.E', label: 'Batch-aware 校准曲线', state: 'act' as const,
      x: 20, y: 20, width: 180, writebacks: [],
    }
    const store = {
      ...fixture,
      getProject: async (projectId: string) => projectId === project.id
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
        : await fixture.getProject(projectId),
    }

    const linked = await placeResearchIdeaOnGraph(store, idea.id, {
      kind: 'link', nodeId: workspaceNode.id,
    })
    expect(linked.idea.node).toBe(workspaceNode.id)
    expect(linked.project!.workspace?.graph?.nodes).toEqual([workspaceNode])

    const unlinked = await placeResearchIdeaOnGraph(store, idea.id, { kind: 'unlink' })
    expect(unlinked.idea.node).toBeUndefined()
    expect(unlinked.nodeId).toBeNull()

    await expect(placeResearchIdeaOnGraph(store, idea.id, {
      kind: 'create', label: '新的工作区节点', after: workspaceNode.id,
    })).rejects.toThrow(/Lab 更新协议/)
  })

  /**
   * A fixture store whose project `draft` is bound to a fresh local workspace in which an agent recorded
   * one idea, attached to `node`, and `id`, that idea as the store took it in.
   */
  const arrived = (node: string) => {
    const store = createFixtureStore(() => TODAY)
    const root = mkdtempSync(join(tmpdir(), 'meridian-candidate-'))
    roots.push(root)
    mkdirSync(join(root, '.meridian/ideas'), { recursive: true })
    writeFileSync(join(root, '.meridian/ideas/ideas.json'), JSON.stringify({
      schema_version: 'meridian.workspace-agent-ideas.v1',
      ideas: [{ id: 'agent-idea', date: TODAY, title: 'agent 记下的想法', body: '还没放进项目', node }],
    }))
    void store.bindProjectWorkspace('draft', { kind: 'local', root })
    const { id } = store.listIdeas().find((idea) => idea.source.agent === true)!
    return { id, store }
  }
  const roots: string[] = []
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
  const draftNode = () => createFixtureStore(() => TODAY).heldProject('draft').graph.nodes[0]!.id

  it('确认 agent 挂的候选节点：想法放进来源项目的那个节点，候选不再留着', async () => {
    const { id, store } = arrived(draftNode())
    expect(store.listIdeas().find((idea) => idea.id === id)).toMatchObject({ sourceProject: 'draft', candidateNode: draftNode() })
    const confirmed = await placeResearchIdeaOnGraph(store, id, { kind: 'confirm' })
    expect([confirmed.idea.project, confirmed.idea.node, confirmed.nodeId]).toEqual(['draft', draftNode(), draftNode()])
    expect(store.listIdeas().find((idea) => idea.id === id)).not.toHaveProperty('candidateNode')
  })

  it('忽略候选节点只去掉候选，想法仍不在任何项目里', async () => {
    const { id, store } = arrived('draft.whatever')
    const dismissed = await placeResearchIdeaOnGraph(store, id, { kind: 'dismiss' })
    expect([dismissed.project, dismissed.nodeId]).toEqual([null, null])
    const held = store.listIdeas().find((idea) => idea.id === id)
    expect(held).not.toHaveProperty('candidateNode')
    expect(held).not.toHaveProperty('project')
  })

  it('没有候选、候选节点不在来源项目的图里、或想法已在别的项目里时，确认不动它', async () => {
    const none = createFixtureStore(() => TODAY)
    const own = none.createIdea(undefined, '自己的想法', '没有候选')
    await expect(placeResearchIdeaOnGraph(none, own.id, { kind: 'confirm' })).rejects.toThrow(/没有候选节点/)
    const missing = arrived('draft.gone')
    await expect(placeResearchIdeaOnGraph(missing.store, missing.id, { kind: 'confirm' })).rejects.toThrow(/节点不存在/)
    const elsewhere = arrived(draftNode())
    const other = elsewhere.store.listProjects().find((project) => project.id !== 'draft')!.id
    elsewhere.store.updateIdea(elsewhere.id, { project: other })
    await expect(placeResearchIdeaOnGraph(elsewhere.store, elsewhere.id, { kind: 'confirm' })).rejects.toThrow(/已经放进别的项目/)
    expect(elsewhere.store.listIdeas().find((idea) => idea.id === elsewhere.id)).toMatchObject({ project: other, candidateNode: draftNode() })
  })
})
