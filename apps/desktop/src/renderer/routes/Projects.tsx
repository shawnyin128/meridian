import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { ProjectStatus, ProjectSummary } from '../../shared/contract.js'
import {
  FOCUS_KEY, idleDays, idleNote, nextMilestone, projectSortOrder, STALE_DAYS,
} from '../../shared/project-signals.js'
import type { ProjectSortKey } from '../../shared/project-signals.js'
import { ACTIVE_PROJECT, PROJECT_STATUSES } from '../../shared/vocabulary.js'
import { errorLabel } from '../lib/failure-label.js'
import type { CrumbSeg, ScreenKey } from '../shell/AppShell.js'
import { feed, project as projectApi } from '../ipc.js'
import {
  useCrumbTail, useJump, useScreenEntry, useToday, useVaultRevision,
} from '../shell/AppShell.js'
import { AddAction } from '../components/AddAction.js'
import { BackButton } from '../components/BackButton.js'
import { SortMenu } from '../components/SortMenu.js'
import {
  MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator,
} from '../components/ActionMenu.js'
import { DotsMenu } from '../components/FieldPickers.js'
import { EmptyState } from '../components/EmptyState.js'
import { InlineDraftInput } from '../components/InlineDraftInput.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { ShortTextEditor } from '../components/ShortTextEditor.js'
import { ProjectBlockerView, ProjectNextActionView } from '../components/project/ProjectControl.js'
import { ProjectIdentity } from '../components/project/ProjectIdentity.js'
import { EventText } from '../components/project/ProjectSignals.js'
import { CardOpen, ResearchObjectCard } from '../components/ResearchObjectCard.js'
import { RowActions, StructuredList, StructuredRow } from '../components/StructuredList.js'
import { Tag } from '../components/Tag.js'
import { dnum } from '../../shared/dates.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import type { Catalog } from '../messages/catalog.js'
import { ProjectDetail } from './ProjectDetail.js'
import type { RecordTab } from './ProjectDetail.js'
import type { PlanTab } from '../components/project/ProjectPlan.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import type { NoticeAction } from '../components/Notice.js'
import { useDragReorder, type Reorderable } from '../hooks/useDragReorder.js'
import { DragHandle } from '../components/DragHandle.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { FadeText } from '../components/FadeText.js'
import { namedRuns } from '../components/TitleNote.js'
import './shell.css'
import './Projects.css'

/** The list is this screen's top level, so the breadcrumbs add nothing below it. */
const NO_TAIL: CrumbSeg[] = []

/**
 * A project's health signals, the demo's projSig: the nearest unfinished milestone from today, the
 * days since the last progress (null when the project has none), whether it has stalled, and the
 * number of milestones done.
 */
function signals(project: ProjectSummary, todayIso: string) {
  const next = nextMilestone(project.milestones, todayIso)
  const idle = idleDays(project.lastProgress, todayIso)
  return {
    next,
    idle,
    stale: project.status === ACTIVE_PROJECT && idle !== null && idle > STALE_DAYS,
    milestonesDone: project.milestones.filter((m) => m.done).length,
  }
}

/**
 * The … menu at the right end of a project row, the demo's projMenu: rename, change status, delete.
 * Rename replaces the content of the same popover, matching the demo, which closed the menu and
 * opened a rename popover in the same spot; while renaming, only the rename editor closes it.
 */
function ProjectMenu({ project, onRename, onMove, canMove, onStatus, onDelete }: {
  project: ProjectSummary
  onRename: (name: string) => boolean | Promise<boolean>
  onMove: (by: -1 | 1) => void
  canMove: (by: -1 | 1) => boolean
  onStatus: (status: ProjectStatus) => void
  onDelete: () => void
}) {
  const m = useMessages()
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const close = () => { setOpen(false); setRenaming(false) }

  return (
    <DotsMenu
      open={open}
      onOpenChange={(next) => {
        if (!next && renaming) return
        setOpen(next)
        if (!next) setRenaming(false)
      }}
      contentClassName={renaming ? 'ctxmenu drop' : 'ctxmenu'} stopRowActivation
    >
          {renaming
            ? (
              <ShortTextEditor
                title={m.research.list.renameTitle} initialValue={project.name}
                placeholder={m.project.identity.nameFieldLabel}
                onSubmit={onRename} onClose={close}
              />
            )
            : (
              <>
                {/* Selecting "Rename" does not close the menu: it replaces the contents of the same menu */}
                <MenuItem onSelect={(e) => { e.preventDefault(); setRenaming(true) }}>
                  {m.research.list.rename}
                </MenuItem>
                <MenuItem disabled={!canMove(-1)} onSelect={() => onMove(-1)}>{m.common.moveUp}</MenuItem>
                <MenuItem disabled={!canMove(1)} onSelect={() => onMove(1)}>{m.common.moveDown}</MenuItem>
                <MenuSeparator />
                <MenuRadioGroup value={project.status}>
                  {PROJECT_STATUSES.map((s) => (
                    <MenuRadioItem key={s} value={s} onSelect={() => onStatus(s)}>{s}</MenuRadioItem>
                  ))}
                </MenuRadioGroup>
                <MenuSeparator />
                <MenuItem className="mi danger" onSelect={onDelete}>{m.common.delete}</MenuItem>
              </>
            )}
    </DotsMenu>
  )
}

/**
 * The new-project row at the top of the list, the demo's projCreateRow: type the name in place and
 * press Enter, click outside the row or move focus out of it to create; Escape cancels, and leaving
 * an empty row closes it. A click on the page header's "New project" does not count as outside.
 * `onCreate` returns whether the row is done.
 */
function ProjectCreateRow({ row, triggers, onCreate, onCancel }: {
  row: RefObject<HTMLDivElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  onCreate: (name: string) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const m = useMessages()
  return (
    <div className="research-object-card projpanel" ref={row}>
      <div className="pp-h">
        <InlineDraftInput
          className="inedit" scopeRef={row} triggers={triggers} placeholder={m.project.identity.nameFieldLabel}
          onSubmit={onCreate} onCancel={onCancel}
        />
      </div>
    </div>
  )
}

export function projectPaperCountLabel(count: number, m: Catalog): string {
  return m.research.panel.paperCount(count)
}

/** Ongoing projects expose the decisions a researcher needs before secondary counts and history. */
function ProjectPanel({ project, onOpen, menu, reorder, dropClassName }: {
  project: ProjectSummary; onOpen: () => void; menu: ReactNode
  reorder: Reorderable; dropClassName: string
}) {
  const today = useToday()
  const fmt = useFormat()
  const m = useMessages()
  const { next, idle, stale, milestonesDone } = signals(project, today)
  const left = next ? dnum(next.date) - dnum(today) : null
  const newest = project.recentEvents.at(-1)
  // The newest research record goes with the day of last progress only when it was written that day.
  const record = newest?.date === project.lastProgress ? newest : undefined

  return (
    <ResearchObjectCard
      className={`projpanel${dropClassName ? ` ${dropClassName}` : ''}`}
      data-proj={project.id} onActivate={onOpen} {...reorder.item}
    >
      <div className="pp-h">
        <CardOpen><ProjectIdentity project={project} showTopic /></CardOpen>
        {stale ? <Tag tone="warn">{m.research.panel.staleAlert(idle!)}</Tag> : null}
        <span className="dd">
          {next && left !== null
            ? (
              <>
                <span>{m.research.panel.milestoneOn(fmt.date(next.date))}</span>
                {left === 0 ? m.research.panel.dueToday : m.research.panel.dueInDays(left)}
              </>
            )
            : m.research.panel.noUpcomingMilestone}
        </span>
        <RowActions><DragHandle {...reorder.handle} />{menu}</RowActions>
      </div>
      <div className="project-card-decisions">
        <div className="project-card-decision">
          <span className="project-card-label">{m.project.identity.focusLabel.currentGoal}</span>
          <FadeText className="project-card-value" label={project.focus || m.research.panel.focusUndefined}>
            {project.focus || m.research.panel.focusUndefined}
          </FadeText>
        </div>
        <div className="project-card-decision">
          <span className="project-card-label">{m.project.control.nextAction}</span>
          <ProjectNextActionView action={project.control.next} variant="inline" />
        </div>
        <div className="project-card-decision">
          <span className="project-card-label">{m.project.control.blocker}</span>
          <ProjectBlockerView blocker={project.control.blocker} variant="detail" />
        </div>
      </div>
      <div className="project-card-facts">
        <span className="project-card-fact">
          <span className="project-card-label">{m.project.plan.milestoneMode}</span>
          <span className="msbar">
            {project.milestones.map((ms, i) => <i className={ms.done ? 'done' : undefined} key={i} />)}
          </span>
          <span>{milestonesDone}/{project.milestones.length}</span>
        </span>
        <span className="project-card-fact">
          <span className="project-card-label">{m.project.sections.papers}</span>
          <span>{projectPaperCountLabel(project.paperCount, m)}</span>
        </span>
        <span className="project-card-fact project-card-recent">
          <span className="project-card-label">{m.research.panel.recentProgressLabel}</span>
          {project.lastProgress === undefined
            ? <FadeText className="project-card-empty">{m.research.panel.noRecords}</FadeText>
            : (
              <>
                <FadeText>{fmt.date(project.lastProgress)}</FadeText>
                {record === undefined ? null : <EventText text={record.text} origin={record.origin} />}
              </>
            )}
        </span>
      </div>
    </ResearchObjectCard>
  )
}

/**
 * Shelved and completed projects: one composite row with the cards' identity (name, status, topic),
 * focus and time since the last progress. The identity is the row's button; a click anywhere else on
 * the row opens it too.
 */
function ProjectRow({ project, onOpen, menu, reorder, dropClassName }: {
  project: ProjectSummary; onOpen: () => void; menu: ReactNode
  reorder: Reorderable; dropClassName: string
}) {
  const { idle } = signals(project, useToday())
  const m = useMessages()
  return (
    <StructuredRow
      composite className={`prow${dropClassName ? ` ${dropClassName}` : ''}`}
      data-proj={project.id} onActivate={onOpen} {...reorder.item}
    >
      <button type="button" className="prow-open">
        <ProjectIdentity project={project} variant="row" showPriority={false} showTopic />
      </button>
      <FadeText className="m">
        {m.project.identity.focusWithLabel(m.project.identity.focusLabel[FOCUS_KEY[project.status]], project.focus)} ·{' '}
        {idleNote(idle, m.project.signals.idle)}
      </FadeText>
      <RowActions><DragHandle {...reorder.handle} />{menu}</RowActions>
    </StructuredRow>
  )
}

/**
 * The project list, grouped by status: each ongoing project gets a large panel and every other
 * project a row, each with a management menu at its right end; the first group's heading holds
 * "New project". Data comes from project.list; creating, renaming, changing status and deleting
 * write back through project.create / project.update / project.delete. Clicking a panel or row opens
 * that project's details. `newRow` opens the new-project row, and `onNewRow` reports it has opened.
 * `onReturn`, when given, is the header's back control to the screen a jump came from.
 */
function ProjectList({ onOpen, newRow, onNewRow, onReturn }: {
  onOpen: (id: string) => void
  newRow: boolean
  onNewRow: () => void
  onReturn?: (() => void) | undefined
}) {
  const m = useMessages()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = useToday()
  const { revision } = useVaultRevision()
  const reportError = useCallback((e: unknown) => setError(errorLabel(m, e)), [m])
  const write = useVaultWrite()
  const undo = useUndo()
  const stopCreating = useCallback(() => setCreating(false), [])
  const createRow = useRef<HTMLDivElement>(null)
  const projNew = useRef<HTMLButtonElement>(null)
  const newTriggers = useMemo(() => [projNew], [])
  const statusOf = useMemo(
    () => new Map((projects ?? []).map((p) => [p.id, p.status])), [projects],
  )
  const ids = useMemo(() => (projects ?? []).map((p) => p.id), [projects])
  const reorder = useDragReorder(
    ids, (id) => statusOf.get(id) ?? '', (order) => { void write(projectApi.reorder(order)) },
  )
  const sortBy = (key: ProjectSortKey) => {
    if (projects === null) return
    void write(projectApi.reorder(projectSortOrder(projects, key, today)))
  }

  useCrumbTail(NO_TAIL)

  useEffect(() => {
    void projectApi.list().then(setProjects).catch(reportError)
  }, [reportError, revision])

  useEffect(() => {
    if (!newRow) return
    setCreating(true)
    onNewRow()
  }, [newRow, onNewRow])

  /**
   * Finishes a write: closes the new-project row, then lets `write` finish. Creating from the row does
   * not come here: whether the row stays depends on that write's result.
   */
  const applyWrite = <T,>(op: Promise<T>, note: string, action?: (result: T) => NoticeAction) => {
    setCreating(false)
    void write(op, { note, action })
  }

  /**
   * Creates a project: once it is written the row closes and a Feed entry is added; if the project is
   * rejected, the row and the typed name stay.
   */
  const createProject = (name: string): boolean | Promise<boolean> =>
    (name === '' ? false : write(projectApi.create(name).then((id) => feed.append({
      source: 'me',
      body: { kind: 'runs', runs: namedRuns(m.research.list.createdFeedNote, name, { kind: 'project', id }) },
    })), { note: m.research.list.createdNote }))

  if (!projects) {
    return (
      <PageShell>
        <PageHeader><PageTitle>{m.project.loadingTitle}</PageTitle></PageHeader>
        <PageError error={error} />
        <PageBody>{error === null ? <LoadingPlaceholder shape="cards" /> : null}</PageBody>
      </PageShell>
    )
  }

  const groups = PROJECT_STATUSES
    .map((status) => ({ status, items: projects.filter((p) => p.status === status) }))
    // Always keep the ongoing group: a project created from the header, and its input row, land in it,
    // so neither shows under another status when the vault holds only finished projects.
    .filter((g) => g.items.length > 0 || g.status === ACTIVE_PROJECT)

  const menuOf = (p: ProjectSummary) => (
    <ProjectMenu
      project={p}
      onRename={(name) => write(projectApi.update(p.id, { name }), { note: m.research.list.renamed })}
      onMove={(by) => reorder.move(p.id, by)} canMove={(by) => reorder.canMove(p.id, by)}
      onStatus={(status) => applyWrite(
        projectApi.update(p.id, { status }), m.research.list.statusChangedTo(status),
      )}
      onDelete={() => applyWrite(projectApi.delete(p.id), m.common.trashed, undo.change)}
    />
  )

  return (
    <PageShell>
      <PageHeader
        actions={(
          <>
            {projects.length === 0 ? null : (
              <SortMenu
                label={m.research.list.sort}
                options={[
                  { label: m.research.list.sortPriority, onSelect: () => sortBy('priority') },
                  { label: m.research.list.sortMilestone, onSelect: () => sortBy('milestone') },
                ]}
              />
            )}
            <AddAction
              variant="page" id="projNew" ref={projNew}
              onClick={() => {
                // An open row is only refocused, keeping the half-typed name, so this click does not
                // count as outside the row.
                if (creating) createRow.current?.querySelector('input')?.focus()
                else setCreating(true)
              }}
            >{m.research.list.create}</AddAction>
          </>
        )}
      >
        {onReturn === undefined ? null : <BackButton onClick={onReturn} />}
        <PageTitle>{m.research.list.title(projects.filter((p) => p.status === ACTIVE_PROJECT).length)}</PageTitle>
      </PageHeader>
      <PageError error={error} />

      <PageBody>
        {groups.map((g, i) => (
          <Fragment key={g.status}>
            <SectionHeading>{m.research.list.groupHeading(g.status, g.items.length)}</SectionHeading>
            {i === 0 && creating
              ? (
                <ProjectCreateRow
                  row={createRow} triggers={newTriggers}
                  onCancel={stopCreating} onCreate={createProject}
                />
              )
              : g.items.length === 0 ? <EmptyState variant="section">{m.research.list.empty}</EmptyState> : null}
            {g.status === ACTIVE_PROJECT
              ? g.items.map((p) => (
                <ProjectPanel
                  project={p} onOpen={() => onOpen(p.id)} menu={menuOf(p)} key={p.id}
                  reorder={{ item: reorder.itemProps(p.id), handle: reorder.handleProps(p.id) }}
                  dropClassName={reorder.dropClass(p.id)}
                />
              ))
              : (
                <StructuredList variant="embedded" maxVisibleRows="all">
                  {g.items.map((p) => (
                    <ProjectRow
                      project={p} onOpen={() => onOpen(p.id)} menu={menuOf(p)} key={p.id}
                      reorder={{ item: reorder.itemProps(p.id), handle: reorder.handleProps(p.id) }}
                      dropClassName={reorder.dropClass(p.id)}
                    />
                  ))}
                </StructuredList>
              )}
          </Fragment>
        ))}
      </PageBody>
    </PageShell>
  )
}

/**
 * Research › Projects: the list, then a project's details, the demo's resState.proj: empty shows the
 * list, a value shows that project's details, and the breadcrumbs' "Projects" segment returns to the
 * list. Every sidebar entry returns to the list, like the demo's openResProjects; coming back from a
 * Wiki page is not an entry, so the same project is still open. A jump from the overview lands on
 * that project and remembers the origin: the Back button in the content's navigation row returns to
 * the overview, while the breadcrumbs still return to the list, like the demo's resFrom. Opened from
 * the list, there is no origin and Back returns to the project list. Both tab groups of the details
 * are kept here, so leaving the project and coming back lands on the last tab, like the demo's
 * module-level projPlanTab / projTab; both are kept per project, and a project not opened yet starts
 * on its tasks and its timeline. A jump with the `newProject` anchor lands on the list with its
 * new-project row open.
 */
export function Projects() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [newRow, setNewRow] = useState(false)
  const newRowShown = useCallback(() => setNewRow(false), [])
  const [arrivalTask, setArrivalTask] = useState<string | null>(null)
  const [arrivalMilestone, setArrivalMilestone] = useState<string | null>(null)
  const [arrivalConclusion, setArrivalConclusion] = useState<string | null>(null)
  const [origin, setOrigin] = useState<ScreenKey | null>(null)
  const [planTabs, setPlanTabs] = useState<Record<string, PlanTab>>({})
  const [recordTabs, setRecordTabs] = useState<Record<string, RecordTab>>({})
  const close = useCallback(() => { setOpenId(null); setOrigin(null) }, [])
  const setPlanTab = useCallback((tab: PlanTab) => {
    if (openId !== null) setPlanTabs((tabs) => ({ ...tabs, [openId]: tab }))
  }, [openId])
  const setRecordTab = useCallback((tab: RecordTab) => {
    if (openId !== null) setRecordTabs((tabs) => ({ ...tabs, [openId]: tab }))
  }, [openId])
  const entry = useScreenEntry()
  const { jump, returnTo } = useJump()
  const consumed = useRef(0)

  // Back follows history: after a jump from another screen it returns there; opened from the list, it
  // goes up one level, to the list.
  const back = useCallback(() => {
    if (origin === null) { close(); return }
    setOrigin(null)
    returnTo(origin)
  }, [origin, close, returnTo])

  useEffect(() => { setOpenId(null); setOrigin(null) }, [entry])

  useEffect(() => {
    if (jump === null || jump.seq === consumed.current) return
    consumed.current = jump.seq
    if (jump.anchor?.newProject === true) {
      close()
      setNewRow(true)
      if (jump.from !== jump.screen) setOrigin(jump.from)
      return
    }
    setOpenId(jump.target)
    setOrigin(jump.from)
    setArrivalTask(jump.anchor?.task ?? null)
    setArrivalMilestone(jump.anchor?.milestone ?? null)
    setArrivalConclusion(jump.anchor?.conclusion ?? null)
    if (jump.anchor?.conclusion !== undefined) setRecordTabs((tabs) => ({ ...tabs, [jump.target]: 'concl' }))
  }, [jump, close])

  return openId === null
    ? <ProjectList onOpen={setOpenId} newRow={newRow} onNewRow={newRowShown} onReturn={origin === null ? undefined : back} />
    : (
      <ProjectDetail
        projectId={openId} onBack={close} onReturn={back}
        tab={planTabs[openId] ?? 'task'} onTab={setPlanTab}
        record={recordTabs[openId] ?? 'tl'} onRecord={setRecordTab}
        arrivalTask={arrivalTask} arrivalMilestone={arrivalMilestone} arrivalConclusion={arrivalConclusion}
        onArrived={() => { setArrivalTask(null); setArrivalMilestone(null); setArrivalConclusion(null) }}
      />
    )
}
