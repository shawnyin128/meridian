import type { ResearchGraph } from './contract.js'

export type ResearchPathState = 'empty' | 'missing' | 'broken' | 'active'

/** One path-health definition for Core projections and renderer decisions. */
export function researchPathState(
  graph: Pick<ResearchGraph, 'nodes' | 'edges' | 'activePath'>,
): ResearchPathState {
  if (graph.nodes.length === 0) return 'empty'
  const requested = graph.activePath ?? []
  if (requested.length === 0) return 'missing'
  const nodes = new Set(graph.nodes.map((node) => node.id))
  if (requested.some((id) => !nodes.has(id))) return 'broken'
  const edges = new Set(graph.edges.map(([from, to]) => `${from}\u0000${to}`))
  return requested.slice(1).every((to, index) => edges.has(`${requested[index]}\u0000${to}`))
    ? 'active'
    : 'broken'
}
