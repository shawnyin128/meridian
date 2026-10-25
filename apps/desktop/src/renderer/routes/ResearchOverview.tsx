import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Milestone, ProjectOverview, Task } from '../../shared/contract.js'
import { projectControlState } from '../../shared/project-control.js'
import {
  FOCUS_KEY, projectDecisionItems, projectPulseSignal, sortRecordsNewestFirst, type ProjectPulseSignal,
} from '../../shared/project-signals.js'
import { project as projectApi } from '../ipc.js'
import { ACTIVE_PROJECT, FINISHED_PROJECT, SHELVED_PROJECT } from '../../shared/vocabulary.js'
import { useJump, useToday, useVaultRevision, type JumpAnchor } from '../shell/AppShell.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { AgentLabel } from '../components/SourceLabel.js'
import { FadeText } from '../components/FadeText.js'
import { StructuredList, StructuredRow } from '../components/StructuredList.js'
import { Tag, type TagTone } from '../components/Tag.js'
import { dnum } from '../../shared/dates.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import {
  EventText, ProjectSignalDate, ProjectSignalKind, RECORD_TONE,
} from '../components/project/ProjectSignals.js'
import { ProjectNextActionView } from '../components/project/ProjectControl.js'
import { useAreaFilter } from '../components/project/ProjectAreaFilter.js'
import { ProjectIdentity, ProjectLabel } from '../components/project/ProjectIdentity.js'
import { DAY_SLOT_HOURS, useTimelinePeriod } from '../components/timeline/TimelineScale.js'
import { TimelineBoard } from '../components/timeline/TimelineBoard.js'
import { useMilestoneEditor } from '../components/timeline/MilestoneEditor.js'
import { Tooltip } from '../components/Tooltip.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, PageToolbar, SectionHeading,
} from '../components/PageShell.js'
import { Button } from '../components/Button.js'
import './shell.css'
import './ResearchOverview.css'

/** How many entries Recent research log lists, as in the demo's recentHTML. */
const RECENT_EVENTS = 6
/** Research records dated within this many days count toward "Research log entries, last 7 days". */
const WEEK_DAYS = 7

const PULSE_TONE: Record<ProjectPulseSignal['tone'], TagTone> = {
  healthy: 'good', warn: 'warn', risk: 'bad', blocked: 'warn', quiet: 'neutral',
}

/**
 * The milestone popover opened on the Gantt chart: a new milestone on a given day, or an edit of
 * an existing one. `left`/`top` are coordinates within the canvas.
 */
/** Stats: the size and health of all projects at a glance, as in the demo's statHTML. */
function Stats({ rows }: { rows: ProjectOverview[] }) {
  const today = dnum(useToday())
  const m = useMessages()
  const count = (status: string) => rows.filter((p) => p.status === status).length
  const sum = (of: (p: ProjectOverview) => number) => rows.reduce((n, p) => n + of(p), 0)
  const recent = (date: string) => {
    const distance = today - dnum(date)
    return distance >= 0 && distance < WEEK_DAYS
  }
  const stats: { value: number; label: string; bad?: boolean }[] = [
    { value: count(ACTIVE_PROJECT), label: m.research.overview.stats.active },
    { value: count(SHELVED_PROJECT), label: m.research.overview.stats.shelved },
    {
      value: sum((p) => p.milestones.filter((x) => !x.done).length),
      label: m.research.overview.stats.openMilestones,
    },
    {
      value: sum((p) => p.events.filter((event) => recent(event.date)).length),
      label: m.research.overview.stats.recentProgress,
    },
  ]
  return (
    <div className="ovstats">
      {stats.map((s) => (
        <div className={s.bad ? 'ovstat bad' : 'ovstat'} key={s.label}>
          <b>{s.value}</b><span>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Every list on the overview shares one column order: project, date, kind, main text, secondary
 * status. Dates come from OverviewDate, so a milestone reads the same in Needs attention and in
 * Upcoming milestones.
 */
function OverviewList({ children }: { children: ReactNode }) {
  return <StructuredList className="ovlist project-signal-columns" variant="embedded">{children}</StructuredList>
}

function OverviewDate({ date }: { date: string | undefined }) {
  return <ProjectSignalDate date={date} />
}

function OverviewRow({ when, kind, main, meta, project, projectId, variant, onOpen }: {
  when?: ReactNode
  kind: ReactNode
  main: ReactNode
  meta?: ReactNode
  project: string
  projectId: string
  variant: 'attention' | 'progress' | 'dated'
  onOpen: () => void
}) {
  return (
    <StructuredRow className={`ovlist-row ${variant}`} data-proj={projectId} onActivate={onOpen}>
      <ProjectLabel name={project} className="ovlist-project" />
      <span className="ovlist-when">{when}</span>
      <span className="ovlist-kind">{kind}</span>
      <FadeText className="ovlist-main" expand>{main}</FadeText>
      {meta ? <span className="ovlist-meta">{meta}</span> : null}
    </StructuredRow>
  )
}

/**
 * Needs attention: all projects' signals, merged and sorted.
 * A row opens its project, at the task or milestone the signal is about.
 */
function DecisionQueue({ rows, onOpen }: {
  rows: ProjectOverview[]; onOpen: (projectId: string, anchor: JumpAnchor | undefined) => void
}) {
  const today = useToday()
  const m = useMessages()
  const items = rows.flatMap((project) => projectDecisionItems({
    ...project,
    // Project conclusions are no longer a product feature: their stored data is kept for
    // compatibility but never becomes an overview decision.
    conclusions: { conflicting: 0 },
  }, today, m.project.signals)
    .map((item) => ({ ...item, projectId: project.id, name: project.name })))
    .sort((a, b) => a.rank - b.rank || dnum(a.date ?? today) - dnum(b.date ?? today))
  if (items.length === 0) return null
  return (
    <>
      <SectionHeading count={items.length}>{m.research.overview.decisions}</SectionHeading>
      <OverviewList>
        {items.map((x) => (
          <OverviewRow
            key={`${x.projectId}${x.id}`}
            variant="attention"
            when={<OverviewDate date={x.date} />}
            kind={<ProjectSignalKind tone={x.tone}>{x.kind}</ProjectSignalKind>}
            main={x.reason}
            project={x.name}
            projectId={x.projectId}
            onOpen={() => onOpen(x.projectId, x.task !== undefined ? { task: x.task }
              : x.milestone !== undefined ? { milestone: x.milestone } : undefined)}
          />
        ))}
      </OverviewList>
    </>
  )
}

/**
 * Project progress: one row per project answers what it is doing now, what just happened, what
 * comes next and where it needs you. Every cell is derived deterministically from existing tasks,
 * milestones and research records; nothing calls an LLM or writes back to the research graph.
 */
function ProjectProgress({ rows, onOpen }: {
  rows: ProjectOverview[]; onOpen: (projectId: string) => void
}) {
  const today = useToday()
  const fmt = useFormat()
  const m = useMessages()
  const current = rows.filter((project) => project.status !== FINISHED_PROJECT)
  if (current.length === 0) return null
  return (
    <>
      <SectionHeading>{m.research.overview.progressHeading}</SectionHeading>
      <StructuredList className="ovpulse" variant="embedded">
        {current.map((project) => {
          const control = projectControlState({
            tasks: project.tasks,
            ...(project.block === undefined ? {} : { block: project.block }),
            activeNodes: project.research.activeNodes,
          })
          const active = control.next.source === 'task' && control.next.task.state === 'act'
            ? control.next.task
            : undefined
          const activeCount = project.tasks.filter((task) => task.state === 'act').length
          const latest = sortRecordsNewestFirst(project.events)[0]
          const signal = projectPulseSignal({
            ...project, conclusions: { conflicting: 0 },
          }, today, m.project.signals)
          const [firstActive, ...moreActive] = project.research.activeNodes
          const activeLabel = firstActive === undefined
            ? undefined
            : moreActive.length === 0
              ? firstActive.label
              : `${firstActive.label} ${m.research.overview.activeNodesMore(moreActive.length)}`
          const activeTitle = project.research.activeNodes.map((n) => n.label).join(', ')
          const shown = activeLabel ?? project.focus
          const named = activeLabel === undefined ? project.focus : activeTitle
          const note = firstActive
            ? m.research.overview.activePathNote(active ? control.next.text : undefined)
            : active
              ? m.research.overview.focusWithActiveTasks(m.project.identity.focusLabel[FOCUS_KEY[project.status]], activeCount)
              : m.project.identity.focusLabel[FOCUS_KEY[project.status]]
          const when = latest ? fmt.date(latest.date) : m.common.empty
          return (
            <StructuredRow
              className="ovlist-row progress ovpulse-row" data-proj={project.id}
              key={project.id} onActivate={() => onOpen(project.id)}
            >
              <ProjectIdentity project={project} variant="progress" />
              <span className="ovpulse-cell">
                <Tooltip label={named} whenClipped={named === shown}><FadeText className="ovpulse-title">{shown}</FadeText></Tooltip>
                <FadeText className="ovpulse-sub" label={note}>{note}</FadeText>
              </span>
              <span className="ovpulse-cell">
                {latest
                  ? <EventText className="ovpulse-latest" text={latest.text} origin={latest.origin} />
                  : (
                    <FadeText className="ovpulse-title" label={m.common.empty}>{m.common.empty}</FadeText>
                  )}
                <FadeText className="ovpulse-sub" label={when}>{when}</FadeText>
              </span>
              <span className="ovpulse-cell">
                <ProjectNextActionView action={control.next} variant="summary" />
              </span>
              <span className="ovpulse-cell signal">
                <Tag tone={PULSE_TONE[signal.tone]}>{signal.label}</Tag>
                {signal.detail === undefined ? null : <FadeText className="ovpulse-sub" label={signal.detail}>{signal.detail}</FadeText>}
              </span>
            </StructuredRow>
          )
        })}
      </StructuredList>
    </>
  )
}

/** Recent research log: all projects' research records, newest first: "what happened while I was away". */
function Recent({ rows, onOpen }: { rows: ProjectOverview[]; onOpen: (projectId: string) => void }) {
  const m = useMessages()
  const events = sortRecordsNewestFirst(rows.flatMap((p) => p.events.map((e) => ({ ...e, projectId: p.id, name: p.name }))))
    .slice(0, RECENT_EVENTS)
  if (events.length === 0) return null
  return (
    <>
      <SectionHeading>{m.research.overview.recentHeading}</SectionHeading>
      <OverviewList>
        {events.map((e) => {
          return (
            <OverviewRow
              key={`${e.projectId}${e.date}${e.text}`}
              variant="dated"
              when={<OverviewDate date={e.date} />}
              kind={(
                <ProjectSignalKind tone={RECORD_TONE[e.kind ?? 'note']}>
                  {m.project.records.kind[e.kind ?? 'note']}
                </ProjectSignalKind>
              )}
              main={e.text}
              meta={e.origin === 'agent' ? <AgentLabel /> : undefined}
              project={e.name}
              projectId={e.projectId}
              onOpen={() => onOpen(e.projectId)}
            />
          )
        })}
      </OverviewList>
    </>
  )
}

/** Upcoming milestones: every project's open milestones dated today or later, soonest first. */
function Upcoming({ rows, onOpen }: { rows: ProjectOverview[]; onOpen: (projectId: string) => void }) {
  const todayIso = useToday()
  const today = dnum(todayIso)
  const m = useMessages()
  const items = rows
    .flatMap((p) => p.milestones.filter((x) => !x.done).map((x) => ({ ...x, projectId: p.id, name: p.name })))
    .filter((x) => dnum(x.date) >= today)
    .sort((a, b) => dnum(a.date) - dnum(b.date))
  if (items.length === 0) return null
  return (
    <>
      <SectionHeading>{m.research.overview.upcomingHeading}</SectionHeading>
      <OverviewList>
        {items.map((x) => (
            <OverviewRow
              key={`${x.projectId}${x.id}`}
              variant="dated"
              when={<OverviewDate date={x.date} />}
              kind={<ProjectSignalKind tone="warn">{m.project.plan.milestoneMode}</ProjectSignalKind>}
              main={x.title}
              project={x.name}
              projectId={x.projectId}
              onOpen={() => onOpen(x.projectId)}
            />
        ))}
      </OverviewList>
    </>
  )
}

/**
 * Timeline of all projects: each project draws its milestone lane first, then one row per task.
 * A bar is the task's real date or time window; the project's start and due date are not drawn as
 * a fake task. Dragging a bar moves the task and dragging a diamond moves the milestone; a click
 * without a drag opens the task in its project, and a click on a diamond or the milestone lane opens
 * the shared milestone editor. Switching between day, week and month keeps every task row; a task
 * outside the current window shrinks to a stub at the edge instead of its row disappearing.
 * `onUpdateMilestone` and `onNewMilestone` return whether that write succeeded.
 */
function OverviewGantt({
  rows, onOpenProject, onOpenTask, onMoveTask, onMoveTaskWindow, onMoveMilestone, onUpdateMilestone,
  onDeleteMilestone, onNewMilestone,
}: {
  rows: ProjectOverview[]
  onOpenProject: (projectId: string) => void
  onOpenTask: (projectId: string, taskId: string) => void
  onMoveTask: (
    projectId: string, taskId: string, start: string, end: string, days: number
  ) => void
  onMoveTaskWindow: (
    projectId: string, taskId: string, patch: Pick<Task, 'start' | 'end' | 'window'>,
    slots: number
  ) => void
  onMoveMilestone: (projectId: string, milestoneId: string, date: string) => void
  onUpdateMilestone: (projectId: string, milestoneId: string, patch: Pick<Milestone, 'title' | 'date'>) => Promise<boolean>
  onDeleteMilestone: (projectId: string, milestoneId: string) => void
  onNewMilestone: (projectId: string, date: string, title: string) => Promise<boolean>
}) {
  const m = useMessages()
  const [showInactive, setShowInactive] = useState(false)
  // The overview answers what is still left to do, so finished tasks and milestones stay on the project page;
  // the history view shows everything, finished work included.
  const visibleProjects = useMemo(
    () => showInactive ? rows : rows
      .filter((project) => project.status === ACTIVE_PROJECT)
      .map((project) => ({
        ...project,
        tasks: project.tasks.filter((task) => task.state !== 'done'),
        milestones: project.milestones.filter((milestone) => !milestone.done),
      })),
    [rows, showInactive],
  )
  const editor = useMilestoneEditor({
    projects: rows, onCreate: onNewMilestone, onUpdate: onUpdateMilestone, onDelete: onDeleteMilestone,
  })
  const period = useTimelinePeriod(useToday())

  return (
    <TimelineBoard
      projects={visibleProjects} period={period}
      className="overview-gantt"
      showProjectNames
      foldable
      {...editor.board}
      headerAction={(
        <Button
          size="compact" variant="ghost" className="overview-history-toggle" pressed={showInactive}
          onClick={() => { editor.close(); setShowInactive((shown) => !shown) }}
        >{m.research.overview.historyProjects}</Button>
      )}
      onTaskLabelClick={onOpenTask}
      onProjectLabelClick={onOpenProject}
      onTaskClick={onOpenTask}
      onMoveTask={onMoveTask}
      onMoveTaskWindow={onMoveTaskWindow}
      onMoveMilestone={onMoveMilestone}
    />
  )
}

/**
 * Research › Overview: all projects over time. The top is the Gantt chart of every project; below
 * it come Stats, Needs attention, Project progress, and two columns, Recent research log and Upcoming
 * milestones. Data comes from project.overview. Rescheduling a task or milestone on the timeline
 * writes back through project.updateTask / updateMilestone, and creating or deleting a milestone
 * through the matching methods. Every project entry on the screen opens that project on the
 * Projects screen.
 */
export function ResearchOverview() {
  const fmt = useFormat()
  const m = useMessages()
  const [rows, setRows] = useState<ProjectOverview[] | null>(null)
  const { revision } = useVaultRevision()
  const { open: jumpTo } = useJump()
  const { error, load } = useScreenLoad()
  const write = useVaultWrite()
  const undo = useUndo()
  const { filter, shown } = useAreaFilter(rows ?? [])

  useEffect(() => load('rows', projectApi.overview(), setRows), [revision, load])

  const openProject = useCallback((id: string) => jumpTo('project', id), [jumpTo])
  const openTask = useCallback((id: string, task: string) => jumpTo('project', id, { task }), [jumpTo])
  const openDecision = useCallback((id: string, anchor: JumpAnchor | undefined) => (
    anchor === undefined ? jumpTo('project', id) : jumpTo('project', id, anchor)
  ), [jumpTo])

  const moveTask = useCallback((
    projectId: string, taskId: string, start: string, end: string, days: number,
  ) => {
    void write(
      projectApi.updateTask(projectId, taskId, { start, end }),
      { note: m.project.plan.taskMoved(days) },
    )
  }, [write, m])

  const moveTaskWindow = useCallback((
    projectId: string, taskId: string,
    patch: Pick<Task, 'start' | 'end' | 'window'>, slots: number,
  ) => {
    void write(
      projectApi.updateTask(projectId, taskId, patch),
      {
        note: m.research.overview.taskWindowMovedHours(slots, Math.abs(slots) * DAY_SLOT_HOURS),
      },
    )
  }, [write, m])

  const moveMilestone = useCallback((projectId: string, milestoneId: string, date: string) => {
    void write(
      projectApi.updateMilestone(projectId, milestoneId, { date }),
      { note: m.project.plan.rescheduledTo(fmt.date(date)) },
    )
  }, [write, fmt, m])

  const updateMilestone = useCallback((projectId: string, milestoneId: string, patch: Pick<Milestone, 'title' | 'date'>) => write(
    projectApi.updateMilestone(projectId, milestoneId, patch),
    { note: m.project.plan.milestoneUpdated },
  ), [write, m])

  const deleteMilestone = useCallback((projectId: string, milestoneId: string) => {
    void write(
      projectApi.deleteMilestone(projectId, milestoneId),
      { note: m.project.plan.milestoneDeleted, action: undo.change },
    )
  }, [write, undo, m])

  const newMilestone = useCallback((projectId: string, date: string, title: string) => write(
    projectApi.createMilestone(projectId, { date, title, done: false }),
    { note: m.project.plan.milestoneCreated },
  ), [write, m])

  return (
    <PageShell>
      <PageHeader>
        <PageTitle>{m.research.overview.title}</PageTitle>
      </PageHeader>
      <PageError error={error} />

      {rows === null
        ? <PageBody>{error === null ? <LoadingPlaceholder shape="cards" /> : null}</PageBody>
        : (
          <PageBody>
            {rows.length === 0 ? null : <PageToolbar>{filter}</PageToolbar>}
            <SectionHeading>{m.research.overview.timelineHeading}</SectionHeading>
            <OverviewGantt
              rows={shown} onOpenProject={openProject} onOpenTask={openTask} onMoveTask={moveTask}
              onMoveTaskWindow={moveTaskWindow}
              onMoveMilestone={moveMilestone} onUpdateMilestone={updateMilestone}
              onDeleteMilestone={deleteMilestone} onNewMilestone={newMilestone}
            />
            <SectionHeading>{m.research.overview.statsHeading}</SectionHeading>
            <Stats rows={shown} />
            <DecisionQueue rows={shown} onOpen={openDecision} />
            <ProjectProgress rows={shown} onOpen={openProject} />
            <div className="ovcols">
              <div><Recent rows={shown} onOpen={openProject} /></div>
              <div><Upcoming rows={shown} onOpen={openProject} /></div>
            </div>
          </PageBody>
        )}
    </PageShell>
  )
}
