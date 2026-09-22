import type { ResearchIdea, ResearchIdeaPatch } from '../../shared/contract.js'

export type IdeaSource = ResearchIdea['source']
export type ResearchIdeaMutation = ResearchIdeaPatch & { node?: string | null }

/** Builds personal research state; it never promotes the text into the canonical Wiki. */
export function createResearchIdea(
  id: string, title: string, body: string, source: IdeaSource, day: string,
): ResearchIdea {
  return {
    id, title: title.trim(), body: body.trim(), source: { ...source }, archived: false,
    created: day, updated: day,
  }
}

/** Preserves provenance and creation time while the user refines an idea. */
export function updateResearchIdea(
  idea: ResearchIdea,
  patch: ResearchIdeaMutation,
  day: string,
): ResearchIdea {
  const next = {
    ...idea,
    ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
    ...(patch.body === undefined ? {} : { body: patch.body.trim() }),
    ...(patch.archived === undefined ? {} : { archived: patch.archived }),
    updated: day,
  }
  if (patch.project === null) delete next.project
  else if (patch.project !== undefined) next.project = patch.project
  if (patch.node === null) delete next.node
  else if (patch.node !== undefined) next.node = patch.node
  return {
    ...next,
  }
}
