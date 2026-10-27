import type { ResearchIdea, ResearchIdeaPatch } from '../../shared/contract.js'

export { designPreview, designSections, saveDesignAsIdea } from './design.js'
export { placeResearchIdeaOnGraph } from './graph-placement.js'
export { promoteResearchIdea } from './promote.js'

export type IdeaSource = ResearchIdea['source']
export type ResearchIdeaMutation = ResearchIdeaPatch & { node?: string | null; candidateNode?: null }

/**
 * Builds personal research state; it never promotes the text into the canonical Wiki. `sourceProject`
 * is the project the idea was sparked in, when there is one.
 */
export function createResearchIdea(
  id: string, title: string, body: string, source: IdeaSource, day: string, sourceProject?: string,
): ResearchIdea {
  return {
    id, title: title.trim(), body: body.trim(), source: { ...source },
    ...(sourceProject === undefined ? {} : { sourceProject }), archived: false,
    created: day, updated: day,
  }
}

/**
 * The idea as Core lists it. An agent idea App 0.0.16.x took in was linked, on arrival, to the project
 * whose workspace it came from, and stored no `sourceProject`: it reads as sparked in that project.
 * Nothing is written back.
 */
export function readResearchIdea(idea: ResearchIdea): ResearchIdea {
  return idea.sourceProject === undefined && idea.source.agent === true && idea.project !== undefined
    ? { ...idea, sourceProject: idea.project }
    : idea
}

/**
 * Preserves provenance and creation time while the user refines an idea. Relations are kept each once,
 * and relations with no project and no page leave the field out.
 */
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
  if (patch.candidateNode === null) delete next.candidateNode
  if (patch.relations !== undefined) {
    const relations = { projects: [...new Set(patch.relations.projects)], pages: [...new Set(patch.relations.pages)] }
    if (relations.projects.length === 0 && relations.pages.length === 0) delete next.relations
    else next.relations = relations
  }
  return {
    ...next,
  }
}
