import type {
  ResearchIdeaGraphPlacement, ResearchIdeaPlaceOnGraphResult,
} from '../../shared/contract.js'
import type { VaultStore } from '../vault.js'

/**
 * Applies one user-confirmed idea placement. Idea-to-node associations remain App-owned even
 * when the node comes from a workspace projection; creating workspace nodes remains Lab-owned.
 */
export function placeResearchIdeaOnGraph(
  store: VaultStore,
  ideaId: string,
  placement: ResearchIdeaGraphPlacement,
): ResearchIdeaPlaceOnGraphResult {
  const held = store.listIdeas().find((idea) => idea.id === ideaId)
  if (held === undefined) throw new Error(`想法不存在:${ideaId}`)
  if (held.project === undefined) throw new Error('请先把想法关联到项目')

  let project = store.getProject(held.project)

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
      throw new Error(`节点不存在:${placement.nodeId}`)
    }
    return {
      idea: store.updateIdea(held.id, { node: placement.nodeId }),
      project,
      nodeId: placement.nodeId,
    }
  }

  if (project.workspace !== undefined) {
    throw new Error('工作区科研图的新节点必须通过 Lab 更新协议创建')
  }

  const before = new Set(project.graph.nodes.map((node) => node.id))
  project = store.createNode(held.project, placement.label.trim(), placement.after)
  const node = project.graph.nodes.find((candidate) => !before.has(candidate.id))
  if (node === undefined) throw new Error('创建科研图节点后没有找到新节点')
  return {
    idea: store.updateIdea(held.id, { node: node.id }),
    project,
    nodeId: node.id,
  }
}
