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

/** The node or legacy conclusion of a project that an open Wiki conflict is raised against. */
export type ProjectDispute = { node?: string | undefined; conclusion?: string | undefined }

/** Why a verify is refused when the conclusion changed after the user last saw it. */
export const CONCLUSION_CHANGED = '这条结论在你打开之后又被改过:已刷新成现在的内容,看过之后再验证'

/** A research-graph node holding a recorded conclusion. */
export type ConcludedNode = GraphNode & { conclusion: NonNullable<GraphNode['conclusion']> }

/**
 * First 16 hex characters of the SHA-256 over a concluded node's conclusion text, evidence ids, closed
 * state, and the revision the Lab graph gives it (its closings and cited experiment records).
 */
export function conclusionFingerprint(node: ConcludedNode): string {
  const { text, evidence, revision } = node.conclusion
  const held = JSON.stringify([text, evidence.map((e) => e.id), node.mode ?? '', revision ?? ''])
  return createHash('sha256').update(held).digest('hex').slice(0, 16)
}

/** Returns the nodes of `graph` that hold a conclusion: closed (supported or dead) nodes with one recorded. */
export function concludedNodes(graph: ResearchGraph): ConcludedNode[] {
  return graph.nodes.filter((node): node is ConcludedNode => (
    node.conclusion !== undefined && (node.mode === 'supported' || node.mode === 'dead')
  ))
}

/** Returns the concluded nodes of `graph` whose current conclusion `project`'s user verified, by node id. */
export function verifiedNodes(
  project: Pick<ProjectRecord, 'verifiedConclusions'>, graph: ResearchGraph,
): Map<string, string> {
  const verified = new Map((project.verifiedConclusions ?? []).map((v) => [v.node, v]))
  return new Map(concludedNodes(graph).flatMap((node) => {
    const held = verified.get(node.id)
    return held !== undefined && held.fingerprint === conclusionFingerprint(node) ? [[node.id, held.date]] : []
  }))
}

/**
 * Returns the conclusions of `project`, newest first and undated last: one per concluded node of
 * `graph` and one per legacy `conclusionList` entry. A node conclusion is verified when the user
 * verified its current fingerprint, and pending otherwise; a legacy entry keeps its stored state.
 * Either is conflicting while one of `claims` citing it has an open conflict or one of `disputes` is
 * raised against it. Task ids the plan no longer holds are left out.
 */
export function projectConclusions(
  project: Pick<ProjectRecord, 'tasks' | 'conclusionList' | 'verifiedConclusions'>,
  graph: ResearchGraph,
  claims: readonly ProjectClaim[],
  disputes: readonly ProjectDispute[],
): ProjectConclusion[] {
  const verified = verifiedNodes(project, graph)
  const titles = new Map(project.tasks.map((task) => [task.id, task.title]))
  const wiki = (cited: readonly ProjectClaim[]) => cited.map(({ page, title, claim, version }) => ({
    page, title, claim, version,
  }))
  const fromNodes = concludedNodes(graph).map((node): ProjectConclusion => {
    const cited = claims.filter((c) => c.node === node.id)
    const verifiedOn = verified.get(node.id)
    return {
      id: node.id,
      node: node.id,
      text: node.conclusion.text,
      ...(node.conclusion.date === undefined ? {} : { date: node.conclusion.date }),
      state: cited.some((c) => c.conflicted) || disputes.some((d) => d.node === node.id)
        ? 'conflicting'
        : verifiedOn === undefined ? 'pending' : 'verified',
      fingerprint: conclusionFingerprint(node),
      ...(verifiedOn === undefined ? {} : { verifiedOn }),
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
      state: cited.some((c) => c.conflicted) || disputes.some((d) => d.conclusion === conclusion.id)
        ? 'conflicting'
        : conclusion.state,
      tasks: [],
      experiments: [],
      wiki: wiki(cited),
    }
  })
  return [...fromNodes, ...legacy].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
