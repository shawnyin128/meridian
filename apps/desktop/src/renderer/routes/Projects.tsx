import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { ProjectStatus, ProjectSummary } from '../../shared/contract.js'
import {
  AGENT_PREFIX, FOCUS_KEY, idleDays, idleNote, NEAR_DAYS, nextMilestone, projectSortOrder, STALE_DAYS,
} from '../../shared/project-signals.js'
import type { ProjectSortKey } from '../../shared/project-signals.js'
import { ACTIVE_PROJECT, PROJECT_STATUSES } from '../../shared/vocabulary.js'
import type { CrumbSeg, ScreenKey } from '../shell/AppShell.js'
import { feed, project as projectApi } from '../ipc.js'
import {
  useBanner, useCrumbTail, useJump, useScreenEntry, useToast, useToday, useVaultRevision,
} from '../shell/AppShell.js'
import { AddAction } from '../components/AddAction.js'
import { SortMenu } from '../components/SortMenu.js'
import {
  MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator,
} from '../components/ActionMenu.js'
import { DotsMenu } from '../components/FieldPickers.js'
import { InlineDraftInput } from '../components/InlineDraftInput.js'
import { ShortTextEditor } from '../components/ShortTextEditor.js'
import { IconCheck } from '../components/icons.js'
import { ProjectBlockerView, ProjectNextActionView } from '../components/project/ProjectControl.js'
import { ProjectIdentity } from '../components/project/ProjectIdentity.js'
import { ResearchObjectCard } from '../components/ResearchObjectCard.js'
import { dnum } from '../../shared/dates.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import type { Catalog } from '../messages/catalog.js'
import { ProjectDetail } from './ProjectDetail.js'
import type { RecordTab } from './ProjectDetail.js'
import type { PlanTab } from '../components/project/ProjectPlan.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useDragReorder, type DragCardProps } from '../hooks/useDragReorder.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import './shell.css'
import './Projects.css'

/** The list is the shallowest layer of this screen, and the breadcrumbs no longer hang down. */
const NO_TAIL: CrumbSeg[] = []

/**
 * The health signal of the project corresponds to the projSig of the demo: the most recent unfinished milestone from today, the number of days since the last advancement
 * The number of days (null if there is no scientific research record), whether it is stalled, and the number of completed milestones.
 */
function signals(project: ProjectSummary, todayIso: string) {
  const next = nextMilestone(project.milestones, todayIso)
  const idle = idleDays(project.recentEvents, todayIso)
  return {
    next,
    idle,
    stale: project.status === ACTIVE_PROJECT && idle !== null && idle > STALE_DAYS,
    milestonesDone: project.milestones.filter((m) => m.done).length,
  }
}

/**
 * The ... menu at the right end of the project row corresponds to the demo's projMenu: renaming, status transfer, and deletion.
 * Renaming replaces the content in the same pop-up layer, which is consistent with the demo's point of opening the renamed layer on the spot after closing the menu.
 */
function ProjectMenu({ project, onRename, onStatus, onDelete }: {
  project: ProjectSummary
  onRename: (name: string) => boolean | Promise<boolean>
  onStatus: (status: ProjectStatus) => void
  onDelete: () => void
}) {
  const m = useMessages()
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameBusy, setRenameBusy] = useState(false)
  const close = () => { setOpen(false); setRenaming(false); setRenameBusy(false) }

  return (
    <DotsMenu
      open={open}
      onOpenChange={(next) => {
        if (!next && renameBusy) return
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
                onSubmit={onRename} onClose={close} onBusyChange={setRenameBusy}
              />
            )
            : (
              <>
                {/* Selecting "Rename" does not close the menu: it replaces the contents of the same menu */}
                <MenuItem onSelect={(e) => { e.preventDefault(); setRenaming(true) }}>
                  {m.research.list.rename}
                </MenuItem>
                <MenuSeparator />
                <MenuRadioGroup value={project.status}>
                  {PROJECT_STATUSES.map((s) => (
                    <MenuRadioItem key={s} value={s} onSelect={() => onStatus(s)}>
                      <span className="ck">{s === project.status ? <IconCheck /> : null}</span>
                      {s}
                    </MenuRadioItem>
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
 * Create a new row in the top row of the list, corresponding to demo's projCreateRow: fill in the name in place, press Enter to create, Esc, click outside the row
 * Or cancel when the focus leaves this line. Clicking "New Project" on the header of the page does not count outside the line. `onCreate` returns whether this line is
 * When used, `onCancel` must maintain the same reference between re-renders.
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
function ProjectPanel({ project, onOpen, menu, dragProps, dropClassName }: {
  project: ProjectSummary; onOpen: () => void; menu: ReactNode
  dragProps: DragCardProps; dropClassName: string
}) {
  const today = useToday()
  const fmt = useFormat()
  const m = useMessages()
  const { next, idle, stale, milestonesDone } = signals(project, today)
  const left = next ? dnum(next.date) - dnum(today) : null
  const latest = project.recentEvents.at(-1)

  return (
    <ResearchObjectCard
      className={`projpanel${dropClassName ? ` ${dropClassName}` : ''}`}
      data-proj={project.id} onActivate={onOpen} {...dragProps}
    >
      <div className="pp-h">
        <ProjectIdentity project={project} showTopic />
        <span className="dd">
          {next && left !== null
            ? (
              <>
                <span className={left <= NEAR_DAYS ? 'dchip near' : 'dchip'}>
                  {m.research.panel.milestoneOn(fmt.date(next.date))}
                </span>
                {left === 0 ? m.research.panel.dueToday : m.research.panel.dueInDays(left)}
              </>
            )
            : m.research.panel.noUpcomingMilestone}
        </span>
        {menu}
      </div>
      <div className="project-card-decisions">
        <div className="project-card-decision">
          <span className="project-card-label">{m.project.identity.focusLabel.currentGoal}</span>
          <span className="project-card-value" title={project.focus}>
            {project.focus || m.research.panel.focusUndefined}
          </span>
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
          {latest === undefined
            ? <span className="project-card-empty">{m.research.panel.noRecords}</span>
            : (
              <span title={latest.text}>
                {fmt.date(latest.date)} {latest.text.replace(AGENT_PREFIX, 'agent · ')}
              </span>
            )}
        </span>
      </div>
      {stale ? <div className="project-card-alert">{m.research.panel.staleAlert(idle!)}</div> : null}
    </ResearchObjectCard>
  )
}

/** Shelved and completed projects: a row with status, name, focus and last push. */
function ProjectRow({ project, onOpen, menu, dragProps, dropClassName }: {
  project: ProjectSummary; onOpen: () => void; menu: ReactNode
  dragProps: DragCardProps; dropClassName: string
}) {
  const { idle } = signals(project, useToday())
  const m = useMessages()
  return (
    <div
      className={`prow${dropClassName ? ` ${dropClassName}` : ''}`}
      data-proj={project.id} onClick={onOpen} {...dragProps}
    >
      <ProjectIdentity project={project} variant="row" showPriority={false} />
      <span className="m">
        {m.project.identity.focusLabel[FOCUS_KEY[project.status]]}:{project.focus} ·{' '}
        {idleNote(idle, m.project.signals.idle)}
      </span>
      <span className="tp">{project.topic}</span>
      {menu}
    </div>
  )
}

/**
 * Project list: Grouped by status, one project in progress is on a large panel, and the other projects are on a row, each on the right end
 * There are management menus, and the title of the first group is New Entry. Data is retrieved through project.list, created, renamed,
 * Status transfer and deletion are written back through project.create / project.update / project.delete respectively.
 * Click a panel or row to enter the details of that item.
 */
function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const m = useMessages()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const banner = useBanner()
  const toast = useToast()
  const today = useToday()
  const { revision } = useVaultRevision()
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const write = useVaultWrite()
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

  /**
   * End the next write operation: turn off the new line, and then finish it with write. Do not go here when creating a new line - it should be as written
   * Success or failure determines whether to stay or not.
   */
  const applyWrite = (op: Promise<unknown>, note: string, notify: (text: string) => void = banner) => {
    setCreating(false)
    void write(op, { note, notify })
  }

  /** Create a new project: Remove the new line and write down an update after it is written. When the project is rejected, this line and the typed name will be retained. */
  const createProject = (name: string): boolean | Promise<boolean> =>
    (name === '' ? false : write(projectApi.create(name).then(() => feed.append({
      source: 'me',
      body: { kind: 'runs', runs: [{ kind: 'text', text: m.research.list.createdFeedNote(name) }] },
    })), { note: m.research.list.createdNote }))

  if (!projects) {
    return (
      <PageShell>
        <PageHeader><PageTitle>{m.project.loadingTitle}</PageTitle></PageHeader>
        <PageError error={error} />
      </PageShell>
    )
  }

  const groups = PROJECT_STATUSES
    .map((status) => ({ status, items: projects.filter((p) => p.status === status) }))
    // Always keep in progress: the new project created at the header and its input line will fall in this section, and will not be misaligned because there are only completed projects left in the library.
    .filter((g) => g.items.length > 0 || g.status === ACTIVE_PROJECT)

  const menuOf = (p: ProjectSummary) => (
    <ProjectMenu
      project={p}
      onRename={(name) => write(projectApi.update(p.id, { name }), { note: m.research.list.renamed })}
      onStatus={(status) => applyWrite(
        projectApi.update(p.id, { status }), m.research.list.statusChangedTo(status), toast,
      )}
      onDelete={() => applyWrite(projectApi.delete(p.id), m.common.trashed)}
    />
  )

  return (
    <PageShell>
      <PageHeader>
        <PageTitle>{m.research.list.title(projects.length)}</PageTitle>
      </PageHeader>
      <PageError error={error} />

      <PageBody>
        {groups.map((g, i) => (
          <Fragment key={g.status}>
            <SectionHeading actions={i === 0
              ? (
                <div className="section-actions">
                  <SortMenu label={m.research.list.sort} options={[
                    { label: m.research.list.sortPriority, onSelect: () => sortBy('priority') },
                    { label: m.research.list.sortMilestone, onSelect: () => sortBy('milestone') },
                  ]}
                  />
                  <AddAction
                    variant="page" id="projNew" ref={projNew}
                    onClick={() => {
                      // If the row is already open, only the focus is returned to it, and the half-filled name is retained; so clicking on it does not count as clicking outside the row.
                      if (creating) createRow.current?.querySelector('input')?.focus()
                      else setCreating(true)
                    }}
                  >{m.research.list.create}</AddAction>
                </div>
              )
              : undefined}
            >{m.research.list.groupHeading(g.status, g.items.length)}</SectionHeading>
            {i === 0 && creating
              ? (
                <ProjectCreateRow
                  row={createRow} triggers={newTriggers}
                  onCancel={stopCreating} onCreate={createProject}
                />
              )
              : null}
            {g.items.map((p) => (p.status === ACTIVE_PROJECT
              ? (
                <ProjectPanel
                  project={p} onOpen={() => onOpen(p.id)} menu={menuOf(p)} key={p.id}
                  dragProps={reorder.cardProps(p.id)} dropClassName={reorder.dropClass(p.id)}
                />
              )
              : (
                <ProjectRow
                  project={p} onOpen={() => onOpen(p.id)} menu={menuOf(p)} key={p.id}
                  dragProps={reorder.cardProps(p.id)} dropClassName={reorder.dropClass(p.id)}
                />
              )))}
          </Fragment>
        ))}
      </PageBody>
    </PageShell>
  )
}

/**
 * Research › Project: list first and then details, corresponding to demo’s resState.proj - when it is empty, it is a list.
 * When there is a value, it is the details of that project, and the "project" section of the breadcrumb is returned to the list.
 * The sidebar will return to the list every time the screen is cut, the same as demo's openResProjects; returning from the wiki page does not count as screen switching.
 * When I came back, I was still stuck on the original project. When the overview jumps in, it will fall directly on that item. Remember the origin, and click the return button in the content navigation row.
 * Return to the overview and the breadcrumbs are still returned to the list, the same as demo's resFrom; there is no way in from the list point.
 * Return button returns to the project list. The two groups of sections in the details are hung here in turn. When you leave the project and come in again, you will stop at the last section.
 * Same as demo's module-level projPlanTab / projTab.
 */
export function Projects() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [arrivalTask, setArrivalTask] = useState<string | null>(null)
  const [origin, setOrigin] = useState<ScreenKey | null>(null)
  const [planTab, setPlanTab] = useState<PlanTab>('task')
  const [recordTab, setRecordTab] = useState<RecordTab>('tl')
  const close = useCallback(() => { setOpenId(null); setOrigin(null) }, [])
  const entry = useScreenEntry()
  const { jump, returnTo } = useJump()
  const consumed = useRef(0)

  // Return is a historical return: if you are jumped in from another screen, you will go back to that screen. If you enter from the list point, there is no way to go back to the previous layer in the structure.
  const back = useCallback(() => {
    if (origin === null) { close(); return }
    setOrigin(null)
    returnTo(origin)
  }, [origin, close, returnTo])

  useEffect(() => { setOpenId(null); setOrigin(null) }, [entry])

  useEffect(() => {
    if (jump === null || jump.seq === consumed.current) return
    consumed.current = jump.seq
    setOpenId(jump.target)
    setOrigin(jump.from)
    setArrivalTask(jump.anchor?.task ?? null)
  }, [jump])

  return openId === null
    ? <ProjectList onOpen={setOpenId} />
    : (
      <ProjectDetail
        projectId={openId} onBack={close} onReturn={back}
        tab={planTab} onTab={setPlanTab} record={recordTab} onRecord={setRecordTab}
        arrivalTask={arrivalTask} onArrived={() => setArrivalTask(null)}
      />
    )
}
