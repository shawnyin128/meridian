import { createHash } from 'node:crypto'
import type { GraphNode, ProjectConclusion, ResearchGraph } from '../../shared/contract.js'
import type { ProjectRecord } from './page.js'

/** A Wiki claim whose experiment evidence cites one of a project's nodes or legacy conclusions. */
export type ProjectClaim = {
  page: string
  title: string
  claim: string
  version: number
  conflicted: boolean
  node?: string | undefined
  conclusion?: string | undefined
}

type NodeConclusion = NonNullable<GraphNode['conclusion']>

/** First 16 hex characters of the SHA-256 over a node conclusion's text and evidence ids. */
export function conclusionFingerprint(conclusion: NodeConclusion): string {
  const held = JSON.stringify([conclusion.text, conclusion.evidence.map((e) => e.id)])
  return createHash('sha256').update(held).digest('hex').slice(0, 16)
}

/** Returns the nodes of `graph` that hold a conclusion: closed (supported or dead) nodes with one recorded. */
export function concludedNodes(graph: ResearchGraph): (GraphNode & { conclusion: NodeConclusion })[] {
  return graph.nodes.filter((node): node is GraphNode & { conclusion: NodeConclusion } => (
    node.conclusion !== undefined && (node.mode === 'supported' || node.mode === 'dead')
  ))
}

/**
 * Returns the conclusions of `project`, newest first and undated last: one per concluded node of
 * `graph` and one per legacy `conclusionList` entry. A node conclusion is verified when the user
 * verified its current fingerprint, and pending otherwise; a legacy entry reads as verified. Either is
 * conflicting while one of `claims` citing it has an open conflict. Task ids the plan no longer holds
 * are left out.
 */
export function projectConclusions(
  project: Pick<ProjectRecord, 'tasks' | 'conclusionList' | 'verifiedConclusions'>,
  graph: ResearchGraph,
  claims: readonly ProjectClaim[],
): ProjectConclusion[] {
  const verified = new Map((project.verifiedConclusions ?? []).map((v) => [v.node, v.fingerprint]))
  const titles = new Map(project.tasks.map((task) => [task.id, task.title]))
  const wiki = (cited: readonly ProjectClaim[]) => cited.map(({ page, title, claim, version }) => ({
    page, title, claim, version,
  }))
  const fromNodes = concludedNodes(graph).map((node): ProjectConclusion => {
    const cited = claims.filter((c) => c.node === node.id)
    return {
      id: node.id,
      node: node.id,
      text: node.conclusion.text,
      ...(node.conclusion.date === undefined ? {} : { date: node.conclusion.date }),
      state: cited.some((c) => c.conflicted)
        ? 'conflicting'
        : verified.get(node.id) === conclusionFingerprint(node.conclusion) ? 'verified' : 'pending',
      tasks: (node.tasks ?? []).flatMap((id) => {
        const title = titles.get(id)
        return title === undefined ? [] : [{ id, title }]
      }),
      experiments: node.conclusion.evidence,
      wiki: wiki(cited),
    }
  })
  const legacy = project.conclusionList.map((conclusion): ProjectConclusion => {
    const cited = claims.filter((c) => c.conclusion === conclusion.id)
    return {
      id: conclusion.id,
      source: conclusion.source,
      text: conclusion.text,
      date: conclusion.date,
      state: cited.some((c) => c.conflicted) ? 'conflicting' : 'verified',
      tasks: [],
      experiments: [],
      wiki: wiki(cited),
    }
  })
  return [...fromNodes, ...legacy].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
