import type {
  ResearchIdeaGraphPlacement, ResearchIdeaPlaceOnGraphResult,
} from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { VaultStore } from '../vault.js'

/**
 * Applies one user-confirmed idea placement. Idea-to-node associations remain App-owned even
 * when the node comes from a workspace projection; creating workspace nodes remains Lab-owned.
 * Creating a node and linking the idea to it is one write: a failure leaves no node behind.
 */
export function placeResearchIdeaOnGraph(
  store: VaultStore,
  ideaId: string,
  placement: ResearchIdeaGraphPlacement,
): ResearchIdeaPlaceOnGraphResult {
  const held = store.listIdeas().find((idea) => idea.id === ideaId)
  if (held === undefined) throw new CallError('not-found', `想法不存在：${ideaId}`)
  if (held.project === undefined) throw new CallError('refused', '请先把想法关联到项目')

  const project = store.getProject(held.project)

  if (placement.kind === 'unlink') {
    return {
      idea: store.updateIdea(held.id, { node: null }),
      project,
      nodeId: null,
    }
  }

  if (placement.kind === 'link') {
    const graph = project.workspace?.graph ?? project.graph
    if (!graph.nodes.some((node) => node.id === placement.nodeId)) {
      throw new CallError('not-found', `节点不存在：${placement.nodeId}`)
    }
    return {
      idea: store.updateIdea(held.id, { node: placement.nodeId }),
      project,
      nodeId: placement.nodeId,
    }
  }

  if (project.workspace !== undefined) {
    throw new CallError('refused', '工作区科研图的新节点必须通过 Lab 更新协议创建')
  }

  const before = new Set(project.graph.nodes.map((node) => node.id))
  return store.atomically(() => {
    const placed = store.createNode(project.id, placement.label.trim(), placement.after)
    const node = placed.graph.nodes.find((candidate) => !before.has(candidate.id))
    if (node === undefined) throw new Error('创建科研图节点后没有找到新节点')
    return {
      idea: store.updateIdea(held.id, { node: node.id }),
      project: placed,
      nodeId: node.id,
    }
  })
}
