import type { ResearchGraph } from './contract.js'

export type ResearchPathState = 'empty' | 'missing' | 'broken' | 'active'

/** Ancestor-or-self node ids and the branch edges connecting them, for a set of active nodes. */
export interface ActiveRoutes {
  /** Every active node plus its ancestors via branch (parent) edges. */
  nodes: ReadonlySet<string>
  /** Branch edges whose source and target both lie in `nodes`, keyed as `${from}\u0000${to}`. */
  edges: ReadonlySet<string>
}

/**
 * Derives the ancestor-or-self route for each active node and unions them: nothing stores a path,
 * this recomputes it from `nodes`, `edges`, and the given active node ids every time. An id absent
 * from `graph.nodes` contributes nothing.
 */
export function activeRoutes(
  graph: Pick<ResearchGraph, 'nodes' | 'edges'>, activeNodes: readonly string[],
): ActiveRoutes {
  const validIds = new Set(graph.nodes.map((node) => node.id))
  const parents = new Map<string, string[]>()
  for (const [from, to] of graph.edges) {
    parents.set(to, [...(parents.get(to) ?? []), from])
  }
  const nodes = new Set<string>()
  const queue = activeNodes.filter((id) => validIds.has(id))
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]!
    if (nodes.has(id)) continue
    nodes.add(id)
    for (const parent of parents.get(id) ?? []) queue.push(parent)
  }
  const edges = new Set(
    graph.edges
      .filter(([from, to]) => nodes.has(from) && nodes.has(to))
      .map(([from, to]) => `${from}\u0000${to}`),
  )
  return { nodes, edges }
}

/** One path-health definition for Core projections and renderer decisions. */
export function researchPathState(
  graph: Pick<ResearchGraph, 'nodes' | 'activeNodes'>,
): ResearchPathState {
  if (graph.nodes.length === 0) return 'empty'
  const requested = graph.activeNodes ?? []
  if (requested.length === 0) return 'missing'
  const ids = new Set(graph.nodes.map((node) => node.id))
  return requested.every((id) => ids.has(id)) ? 'active' : 'broken'
}
