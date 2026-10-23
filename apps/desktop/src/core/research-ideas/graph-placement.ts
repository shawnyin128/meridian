import type {
  ResearchIdeaGraphPlacement, ResearchIdeaPlaceOnGraphResult,
} from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { VaultStore } from '../vault.js'

/**
 * Applies one user-confirmed idea placement. Idea-to-node associations remain App-owned even
 * when the node comes from a workspace projection; creating workspace nodes remains Lab-owned.
 * Dismissing a candidate node touches no project, so its result carries none. Confirming one throws
 * `refused` when the idea has no candidate or is carried out in another project, and `not-found` when
 * the candidate is no longer in its source project's graph.
 */
export function placeResearchIdeaOnGraph(
  store: VaultStore,
  ideaId: string,
  placement: ResearchIdeaGraphPlacement,
): ResearchIdeaPlaceOnGraphResult {
  const held = store.listIdeas().find((idea) => idea.id === ideaId)
  if (held === undefined) throw new CallError('not-found', `想法不存在：${ideaId}`)

  if (placement.kind === 'dismiss') {
    return { idea: store.updateIdea(held.id, { candidateNode: null }), project: null, nodeId: null }
  }
  if (placement.kind === 'confirm') {
    const { sourceProject, candidateNode } = held
    if (sourceProject === undefined || candidateNode === undefined) throw new CallError('refused', '这个想法没有候选节点')
    if (held.project !== undefined && held.project !== sourceProject) {
      throw new CallError('refused', '这个想法已经放进别的项目')
    }
    const source = store.getProject(sourceProject)
    if (!(source.workspace?.graph ?? source.graph).nodes.some((node) => node.id === candidateNode)) {
      throw new CallError('not-found', `节点不存在：${candidateNode}`)
    }
    return {
      idea: store.updateIdea(held.id, { project: sourceProject, node: candidateNode, candidateNode: null }),
      project: source,
      nodeId: candidateNode,
    }
  }

  if (held.project === undefined) throw new CallError('refused', '请先把想法关联到项目')

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
  project = store.createNode(held.project, placement.label.trim(), placement.after)
  const node = project.graph.nodes.find((candidate) => !before.has(candidate.id))
  if (node === undefined) throw new Error('创建科研图节点后没有找到新节点')
  return {
    idea: store.updateIdea(held.id, { node: node.id }),
    project,
    nodeId: node.id,
  }
}
