import type { PaperRow } from '../../../shared/contract.js'

export type ResearchMapReasonKind = 'topic' | 'method' | 'project' | 'title'

export type ResearchMapReason = {
  kind: ResearchMapReasonKind
  label: string
}

export type ResearchMapMember = {
  paper: PaperRow
  reasons: ResearchMapReason[]
}

export type ResearchMapGroup = {
  id: string
  label: string
  kind: 'signal' | 'project' | 'phrase'
  members: ResearchMapMember[]
}

export type ResearchMap = {
  groups: ResearchMapGroup[]
  covered: number
  overlapping: number
}

type Candidate = {
  id: string
  label: string
  kind: ResearchMapGroup['kind']
  priority: number
  members: Map<string, ResearchMapReason[]>
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'based', 'by', 'can', 'deep', 'efficient', 'for', 'from',
  'generative', 'in', 'is', 'large', 'language', 'learning', 'llm', 'llms', 'model', 'models', 'of',
  'on', 'or', 'paper', 'pretrained', 'pre', 'post', 'revisiting', 'study', 'the', 'to', 'toward',
  'towards', 'using', 'via', 'with',
])

const normalize = (value: string): string => value
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ')

const titleTokens = (title: string): string[] => normalize(title).split(' ').filter(Boolean)

const isUsefulToken = (token: string): boolean => token.length >= 4 && !STOP_WORDS.has(token)

function titleLabel(key: string): string {
  return key.charAt(0).toLocaleUpperCase() + key.slice(1)
}

function memberOverlap(left: Candidate, right: Candidate): number {
  const leftIds = new Set(left.members.keys())
  const rightIds = new Set(right.members.keys())
  let shared = 0
  for (const id of leftIds) if (rightIds.has(id)) shared += 1
  return shared / Math.min(leftIds.size, rightIds.size)
}

/**
 * Builds a read-only projection from metadata already present in the library. A paper may belong to
 * several groups, and every membership keeps the exact signal that produced it. The projection never
 * changes canonical topics, Wiki pages, or project state.
 */
export function buildResearchMap(rows: PaperRow[], maxGroups = 8): ResearchMap {
  const candidates = new Map<string, Candidate>()
  const add = (
    id: string, label: string, kind: Candidate['kind'], priority: number,
    paper: PaperRow, reason: ResearchMapReason,
  ) => {
    const held: Candidate = candidates.get(id) ?? {
      id, label, kind, priority, members: new Map<string, ResearchMapReason[]>(),
    }
    if (priority > held.priority) {
      held.label = label
      held.kind = kind
      held.priority = priority
    }
    const reasons = held.members.get(paper.id) ?? []
    if (!reasons.some((item) => item.kind === reason.kind && item.label === reason.label)) reasons.push(reason)
    held.members.set(paper.id, reasons)
    candidates.set(id, held)
  }

  for (const paper of rows) {
    for (const topic of paper.topics) {
      const key = normalize(topic)
      if (key) add(`concept:${key}`, topic, 'signal', 70, paper, { kind: 'topic', label: topic })
    }
    for (const method of paper.methods) {
      const key = normalize(method)
      if (key) add(`concept:${key}`, method, 'signal', 64, paper, { kind: 'method', label: method })
    }
    for (const project of paper.projects) {
      const key = normalize(project.name)
      if (key) add(`project:${project.id}`, project.name, 'project', 80, paper, { kind: 'project', label: project.name })
    }

    const tokens = titleTokens(paper.title)
    const phrases = new Set<string>()
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!
      if (isUsefulToken(token)) phrases.add(token)
      const next = tokens[index + 1]
      if (next !== undefined && isUsefulToken(token) && isUsefulToken(next)) phrases.add(`${token} ${next}`)
    }
    for (const phrase of phrases) {
      const priority = phrase.includes(' ') ? 48 : 32
      add(`concept:${phrase}`, titleLabel(phrase), 'phrase', priority, paper, { kind: 'title', label: phrase })
    }
  }

  const upperBound = Math.max(2, Math.ceil(rows.length * 0.8))
  const ranked = [...candidates.values()]
    .filter((candidate) => candidate.members.size >= 2 && candidate.members.size <= upperBound)
    .sort((left, right) => {
      const leftScore = left.priority + Math.min(left.members.size, 12) + normalize(left.label).split(' ').length * 2
      const rightScore = right.priority + Math.min(right.members.size, 12) + normalize(right.label).split(' ').length * 2
      return rightScore - leftScore || right.members.size - left.members.size || left.label.localeCompare(right.label)
    })

  const selected: Candidate[] = []
  for (const candidate of ranked) {
    if (selected.length >= maxGroups) break
    if (selected.some((held) => memberOverlap(candidate, held) >= 0.86)) continue
    selected.push(candidate)
  }

  const byId = new Map(rows.map((paper) => [paper.id, paper]))
  const groups = selected.map<ResearchMapGroup>((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    kind: candidate.kind,
    members: [...candidate.members.entries()]
      .flatMap(([id, reasons]) => {
        const paper = byId.get(id)
        return paper === undefined ? [] : [{ paper, reasons }]
      })
      .sort((left, right) => (right.paper.year ?? 0) - (left.paper.year ?? 0) || left.paper.title.localeCompare(right.paper.title)),
  }))

  const memberships = new Map<string, number>()
  for (const group of groups) {
    for (const member of group.members) memberships.set(member.paper.id, (memberships.get(member.paper.id) ?? 0) + 1)
  }
  return {
    groups,
    covered: memberships.size,
    overlapping: [...memberships.values()].filter((count) => count > 1).length,
  }
}
