import type { EventKind, ProjectOverview, ProjectStatus, RecordEvent, Task } from './contract.js'
import { dnum } from './dates.js'
import { ACTIVE_PROJECT } from './vocabulary.js'

/** English-safe catalog key for the focus field label, so the catalog itself needs no Chinese-keyed lookup. */
export type FocusLabelKey = 'currentGoal' | 'restartCondition' | 'outcome'
export const FOCUS_KEY: Record<ProjectStatus, FocusLabelKey> =
  { 进行中: 'currentGoal', 搁置: 'restartCondition', 已完成: 'outcome' }

export const NEAR_DAYS = 3
export const STALE_DAYS = 7

/** A record written before `kind` existed shows as a general note. */
export const recordKind = (record: Pick<RecordEvent, 'kind'>): EventKind => record.kind ?? 'note'

/** A record written before `origin` existed came from the user, not an agent. */
export const recordOrigin = (record: Pick<RecordEvent, 'origin'>): 'agent' | 'user' => record.origin ?? 'user'

const recordTimestamp = (record: Pick<RecordEvent, 'date' | 'at'>): number => Date.parse(record.at ?? record.date)

/**
 * Sorts research records newest first: by `at` when present, else by `date`; a tie (same
 * timestamp, typically same date with neither record carrying `at`) keeps reverse write order, so
 * a record later in its source array sorts as the newer one. The one shared ordering every
 * research-record list (the project's timeline view and a node's record panel) is built from.
 */
export function sortRecordsNewestFirst<T extends RecordEvent>(records: readonly T[]): T[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => recordTimestamp(b.record) - recordTimestamp(a.record) || b.index - a.index)
    .map(({ record }) => record)
}

/**
 * The catalog text this module needs to render decision items, idle notes and the pulse signal.
 * The module owns no copy of its own; every caller supplies its active locale's `project.signals`.
 */
export type ProjectSignalMessages = {
  kind: {
    conflict: string
    block: string
    researchPath: string
    milestoneOverdue: string
    milestoneNear: string
    tasksOverdue: string
    stale: string
  }
  action: {
    decideConflict: string
    clearBlocker: string
    fixPath: string
    rescheduleOrFinish: string
    confirmDelivery: string
    chooseDirection: string
  }
  reason: {
    conflictCount: (count: number) => string
    overdueTasks: (count: number) => string
    idleDays: (days: number) => string
    pathBroken: string
    pathMissing: string
  }
  idle: {
    none: string
    today: string
    daysAgo: (days: number) => string
  }
  pulse: {
    notCounted: string
    blocked: string
    conflict: string
    pathBroken: string
    pathMissing: string
    waiting: string
    onTrack: string
  }
}

export function nextMilestone<T extends { date: string; done: boolean }>(
  milestones: readonly T[], today: string,
): T | undefined {
  return milestones
    .filter((milestone) => !milestone.done && dnum(milestone.date) >= dnum(today))
    .sort((a, b) => dnum(a.date) - dnum(b.date))[0]
}

/** One-shot sort a project list can be rearranged by, from a menu next to the manual drag order. */
export type ProjectSortKey = 'priority' | 'milestone'

type SortableProject = { id: string; priority: string; milestones: ReadonlyArray<{ date: string; done: boolean }> }

/**
 * Computes the full project-id order for one sort action: ascending priority (`p0` first), or
 * ascending days until each project's nearest upcoming milestone, with projects that have none
 * sorted last. Ties keep the input's relative order.
 */
export function projectSortOrder(projects: readonly SortableProject[], key: ProjectSortKey, todayIso: string): string[] {
  const keyed = projects.map((project) => ({
    id: project.id, priority: project.priority, next: nextMilestone(project.milestones, todayIso)?.date,
  }))
  if (key === 'priority') return keyed.sort((a, b) => a.priority.localeCompare(b.priority)).map((project) => project.id)
  return keyed.sort((a, b) => {
    if (a.next === undefined && b.next === undefined) return 0
    if (a.next === undefined) return 1
    if (b.next === undefined) return -1
    return dnum(a.next) - dnum(b.next)
  }).map((project) => project.id)
}

export function idleDays(events: ReadonlyArray<{ date: string }>, today: string): number | null {
  const last = events.at(-1)
  return last === undefined ? null : dnum(today) - dnum(last.date)
}

export function idleNote(idle: number | null, m: ProjectSignalMessages['idle']): string {
  if (idle === null) return m.none
  return idle === 0 ? m.today : m.daysAgo(idle)
}

export type ProjectDecisionItem = {
  id: string
  rank: number
  kind: string
  tone: 'bad' | 'warn' | 'mut'
  reason: string
  action: string
  date?: string
  page?: string
}

export type ProjectSignalSource = {
  status: ProjectStatus
  conclusions: { conflicting: number }
  milestones: ReadonlyArray<{ id?: string; date: string; title: string; done: boolean }>
  events: ReadonlyArray<{ date: string }>
  tasks?: ReadonlyArray<Pick<Task, 'state' | 'end'>> | undefined
  block?: string | undefined
  conflictPage?: string | undefined
  research?: { pathState: ProjectOverview['research']['pathState'] } | undefined
}

/** One ranked decision policy for every project surface and non-visual consumer. */
export function projectDecisionItems(
  project: ProjectSignalSource, todayIso: string, m: ProjectSignalMessages,
): ProjectDecisionItem[] {
  if (project.status !== ACTIVE_PROJECT) return []
  const today = dnum(todayIso)
  const items: ProjectDecisionItem[] = []
  const { conflicting } = project.conclusions
  if (conflicting) {
    items.push({
      id: 'conflict', rank: 0, kind: m.kind.conflict, tone: 'bad',
      reason: m.reason.conflictCount(conflicting), action: m.action.decideConflict,
      ...(project.conflictPage === undefined ? {} : { page: project.conflictPage }),
    })
  }
  if (project.block) {
    items.push({
      id: 'block', rank: 1, kind: m.kind.block, tone: 'bad',
      reason: project.block, action: m.action.clearBlocker,
    })
  }
  if (project.research?.pathState === 'broken' || project.research?.pathState === 'missing') {
    const broken = project.research.pathState === 'broken'
    items.push({
      id: broken ? 'path-broken' : 'path-missing', rank: 2,
      kind: m.kind.researchPath, tone: broken ? 'bad' : 'warn',
      reason: broken ? m.reason.pathBroken : m.reason.pathMissing,
      action: m.action.fixPath,
    })
  }
  const milestone = [...project.milestones]
    .filter((item) => !item.done)
    .sort((a, b) => dnum(a.date) - dnum(b.date))[0]
  if (milestone) {
    const left = dnum(milestone.date) - today
    if (left < 0) {
      items.push({
        id: `milestone-${milestone.id ?? milestone.date}`, rank: 3,
        kind: m.kind.milestoneOverdue, tone: 'bad', reason: milestone.title,
        action: m.action.rescheduleOrFinish, date: milestone.date,
      })
    } else if (left <= NEAR_DAYS) {
      items.push({
        id: `milestone-${milestone.id ?? milestone.date}`, rank: 5,
        kind: m.kind.milestoneNear, tone: 'warn', reason: milestone.title,
        action: m.action.confirmDelivery, date: milestone.date,
      })
    }
  }
  const overdueTasksByDate = new Map<string, number>()
  for (const task of project.tasks ?? []) {
    if (task.state === 'done' || dnum(task.end) >= today) continue
    overdueTasksByDate.set(task.end, (overdueTasksByDate.get(task.end) ?? 0) + 1)
  }
  for (const [date, count] of [...overdueTasksByDate].sort(
    ([left], [right]) => dnum(left) - dnum(right),
  )) {
    items.push({
      id: `overdue-tasks-${date}`, rank: 4, kind: m.kind.tasksOverdue, tone: 'bad', date,
      reason: m.reason.overdueTasks(count), action: m.action.rescheduleOrFinish,
    })
  }
  const idle = idleDays(project.events, todayIso)
  if (idle !== null && idle > STALE_DAYS) {
    items.push({
      id: 'stale', rank: 6, kind: m.kind.stale, tone: 'mut',
      reason: m.reason.idleDays(idle), action: m.action.chooseDirection,
    })
  }
  return items.sort((a, b) => a.rank - b.rank || dnum(a.date ?? todayIso) - dnum(b.date ?? todayIso))
}

export type ProjectPulseSignal = {
  tone: 'blocked' | 'risk' | 'warn' | 'quiet' | 'healthy'
  label: string
  detail: string
}

/** The compact progress signal is a projection of the ranked decisions, not a second policy. */
export function projectPulseSignal(
  project: ProjectSignalSource, todayIso: string, m: ProjectSignalMessages,
): ProjectPulseSignal {
  if (project.status !== ACTIVE_PROJECT) {
    return { tone: 'quiet', label: project.status, detail: m.pulse.notCounted }
  }
  const first = projectDecisionItems(project, todayIso, m)[0]
  if (first?.id === 'block') return { tone: 'blocked', label: m.pulse.blocked, detail: first.reason }
  if (first?.id === 'conflict') return { tone: 'risk', label: m.pulse.conflict, detail: first.reason }
  if (first?.id === 'path-broken') return { tone: 'risk', label: m.pulse.pathBroken, detail: first.reason }
  if (first?.id === 'path-missing') return { tone: 'warn', label: m.pulse.pathMissing, detail: first.reason }
  if (first) return {
    tone: first.tone === 'bad' ? 'risk' : first.tone === 'warn' ? 'warn' : 'quiet',
    label: first.kind,
    detail: first.reason,
  }
  const idle = idleDays(project.events, todayIso)
  if (idle === null) return { tone: 'quiet', label: m.pulse.waiting, detail: idleNote(idle, m.idle) }
  return { tone: 'healthy', label: m.pulse.onTrack, detail: idleNote(idle, m.idle) }
}
