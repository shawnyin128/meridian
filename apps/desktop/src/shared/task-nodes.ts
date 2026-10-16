import type { ResearchGraph } from './contract.js'

/**
 * Returns `graph` with each task of `taskNodes` listed under the node it was given by hand instead of
 * wherever the graph lists it, after the node's own tasks. An entry naming a node `graph` does not
 * hold is left out, so its task stays where the graph lists it.
 */
export function withTaskNodes(
  graph: ResearchGraph, taskNodes: Readonly<Record<string, string>> | undefined,
): ResearchGraph {
  const held = new Set(graph.nodes.map((node) => node.id))
  const set = Object.entries(taskNodes ?? {}).filter(([, node]) => held.has(node))
  if (set.length === 0) return graph
  const moved = new Set(set.map(([task]) => task))
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const tasks = [
        ...(node.tasks ?? []).filter((task) => !moved.has(task)),
        ...set.flatMap(([task, to]) => (to === node.id ? [task] : [])),
      ]
      return node.tasks === undefined && tasks.length === 0 ? node : { ...node, tasks }
    }),
  }
}
