import type { ProjectOverview, ResearchGraph } from '../../shared/contract.js'
import { researchPathState } from '../../shared/research-path.js'

/** Canvas padding at the upper-left corner. */
const MARGIN = 12
/** Horizontal gap from the previous node's right edge to a new node. */
const GAP_X = 50
/** Vertical step within a column: a 36px node plus an 18px gap. */
const STEP_Y = 54
/** Node width estimate per character, excluding the dot and horizontal padding. */
const CHAR_WIDTH = 14
const PADDING = 44
const MIN_WIDTH = 100
const MAX_WIDTH = 240

/**
 * Returns where a new node labelled `label` goes: right of the node `after` names, GAP_X past its
 * right edge, or at the left margin when `after` is null; one STEP_Y below the lowest node whose
 * horizontal span overlaps its own, or at the top margin when none does; as wide as its label
 * needs, clamped to MIN_WIDTH..MAX_WIDTH. Throws if `after` names no node in `graph`.
 */
export function placeNode(
  graph: ResearchGraph, label: string, after: string | null,
): { x: number; y: number; width: number } {
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, [...label].length * CHAR_WIDTH + PADDING))
  let x = MARGIN
  if (after !== null) {
    const from = graph.nodes.find((node) => node.id === after)
    if (!from) throw new Error(`节点不存在:${after}`)
    x = from.x + from.width + GAP_X
  }
  const column = graph.nodes.filter((node) => node.x < x + width && x < node.x + node.width)
  return {
    x,
    y: column.length === 0 ? MARGIN : Math.max(...column.map((node) => node.y)) + STEP_Y,
    width,
  }
}

/**
 * Builds the compact, read-only graph projection used by the research overview. The active path is
 * healthy only when every id exists and every consecutive pair is an edge. Branch counts are
 * mutually exclusive so their sum is the graph's node count.
 */
export function overviewResearch(graph: ResearchGraph): ProjectOverview['research'] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const requested = graph.activePath ?? []
  const activePath = requested.flatMap((id) => {
    const node = byId.get(id)
    return node === undefined
      ? []
      : [{
        id: node.id, label: node.label, state: node.state,
        ...(node.mode ? { mode: node.mode } : {}),
        ...(node.nextAction ? { nextAction: node.nextAction } : {}),
      }]
  })
  const pathState = researchPathState(graph)
  const branches = { active: 0, supported: 0, failed: 0, shelved: 0 }
  for (const node of graph.nodes) {
    if (node.mode === 'dead') branches.failed += 1
    else if (node.mode === 'supported' || node.state === 'done') branches.supported += 1
    else if (node.state === 'act') branches.active += 1
    else branches.shelved += 1
  }
  return { pathState, activePath, branches }
}
