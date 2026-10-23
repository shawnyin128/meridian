import type { ResearchIdeaPromoteResult } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { VaultStore } from '../vault.js'

/**
 * Turns idea `ideaId` into a new project named after it, with the idea as the project memo's starting
 * point, and links the idea to it, as one write: a failure leaves no project behind. Returns the linked
 * idea and the project. Throws when there is no such idea or it is already linked to a project.
 */
export function promoteResearchIdea(store: VaultStore, ideaId: string): ResearchIdeaPromoteResult {
  const held = store.listIdeas().find((idea) => idea.id === ideaId)
  if (held === undefined) throw new CallError('not-found', `想法不存在：${ideaId}`)
  if (held.project !== undefined) throw new CallError('refused', '这个想法已经关联项目')
  return store.atomically(() => {
    const before = new Set(store.listProjects().map((project) => project.id))
    store.createProject(held.title)
    const made = store.listProjects().find((project) => !before.has(project.id))
    if (made === undefined) throw new Error('由想法创建项目后没有找到新项目')
    const project = store.updateProject(made.id, {
      memo: `## 起点想法\n\n${held.body}\n\n来源对话：${held.source.chatTitle}`,
    })
    return { idea: store.updateIdea(ideaId, { project: project.id }), project }
  })
}
