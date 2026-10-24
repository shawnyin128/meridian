import { useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type {
  GraphNode,
  Milestone,
  ProjectDetail as Project,
  Task,
  TaskPatch,
  TaskWindow,
} from '../../../shared/contract.js'
import { TASK_SLOT_ENDS, TASK_SLOT_STARTS } from '../../../shared/contract.js'
import { dnum, isoOf } from '../../../shared/dates.js'
import { AddAction } from '../AddAction.js'
import { CollapsibleGroup } from '../CollapsibleGroup.js'
import { DateChip } from '../DateTimeDisplay.js'
import { EmptyState } from '../EmptyState.js'
import { ChoicePicker, DateButton, PriorityPicker } from '../FieldPickers.js'
import { InlineDraftInput } from '../InlineDraftInput.js'
import { InlineField, type InlineFieldProps } from '../InlineField.js'
import { EditActions } from '../EditActions.js'
import { MarkdownBox } from '../Markdown.js'
import { PanelClose } from '../PanelClose.js'
import { TaskScheduleField } from '../TaskScheduleField.js'
import { IconButton } from '../IconButton.js'
import { IconPencil, IconTrash } from '../icons.js'
import { SectionHeading } from '../PageShell.js'
import { RowActions, StructuredList, StructuredRow } from '../StructuredList.js'
import { TabbedSection } from '../TabbedSection.js'
import { Toolbar, ToolbarButton } from '../Toolbar.js'
import { editText, useDrafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useDragReorder, type Reorderable } from '../../hooks/useDragReorder.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { AgentLabel } from '../SourceLabel.js'
import { TagButton, tagClass } from '../Tag.js'
import { NodeAssignment } from './NodeAssignment.js'
import { PRIORITY_TONE, ProjectPriorityTag } from './ProjectIdentity.js'
import { FadeText } from '../FadeText.js'
import './ProjectPlan.css'

const stateWord = (m: Catalog): Record<Task['state'], string> => m.project.plan.state
const TASK_STATES: Task['state'][] = ['act', 'plan', 'done']
const MILESTONE_STATES = ['open', 'done'] as const
const NEXT_PRIORITY: Record<Task['priority'], Task['priority']> = {
  p0: 'p1', p1: 'p2', p2: 'p0',
}
const NEXT_TASK_STATE: Record<Task['state'], Task['state']> = {
  act: 'plan', plan: 'done', done: 'act',
}

export type PlanTab = 'task' | 'ms'

export type TaskDraft = Pick<Task, 'title' | 'start' | 'end' | 'priority' | 'state'> & {
  window: TaskWindow | null
}

export type MilestoneDraft = Pick<Milestone, 'date' | 'title' | 'done'>

/** The new row drafted in the plan, with every field it holds. */
export type PlanCreating = { kind: 'task'; draft: TaskDraft } | { kind: 'ms'; draft: MilestoneDraft }

/**
 * The new row a plan opens on `date`: a task over the week from it, or over that day alone when it
 * has a time `window`, or a milestone on it.
 */
export function newPlanRow(kind: PlanTab, date: string, window: TaskWindow | null = null): PlanCreating {
  return kind === 'ms'
    ? { kind, draft: { date, title: '', done: false } }
    : { kind, draft: { title: '', start: date, end: window ? date : isoOf(dnum(date) + 6), priority: 'p1', state: 'act', window } }
}

/** The new-task row, a view of `draft`, which every change replaces through `onDraft`. */
function TaskCreateRow({ draft, onDraft, triggers, onSave, onCancel }: {
  draft: TaskDraft
  onDraft: (draft: TaskDraft) => void
  triggers: Array<RefObject<HTMLElement | null>>
  onSave: (draft: TaskDraft) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const { start, end, priority, state, title, window: taskWindow } = draft
  const patch = (fields: Partial<TaskDraft>) => onDraft({ ...draft, ...fields })
  const row = useRef<HTMLDivElement>(null)
  const m = useMessages()

  const pickStart = (iso: string) => {
    const window = taskWindow && iso === end && taskWindow.end <= taskWindow.start
      ? { ...taskWindow, end: TASK_SLOT_ENDS[TASK_SLOT_STARTS.indexOf(taskWindow.start)]! } : taskWindow
    patch({ start: iso, end: dnum(end) < dnum(iso) ? iso : end, window })
  }
  const pickEnd = (iso: string) => {
    const next = dnum(iso) < dnum(start) ? start : iso
    const window = taskWindow && next === start && taskWindow.end <= taskWindow.start
      ? { ...taskWindow, start: TASK_SLOT_STARTS[TASK_SLOT_ENDS.indexOf(taskWindow.end)]! } : taskWindow
    patch({ end: next, window })
  }
  const pickWindowStart = (next: TaskWindow['start']) => {
    if (!taskWindow) return
    patch({ window: start === end && taskWindow.end <= next
      ? { start: next, end: TASK_SLOT_ENDS[TASK_SLOT_STARTS.indexOf(next)]! }
      : { ...taskWindow, start: next } })
  }
  const pickWindowEnd = (next: TaskWindow['end']) => {
    if (!taskWindow) return
    patch({ window: start === end && next <= taskWindow.start
      ? { start: TASK_SLOT_STARTS[TASK_SLOT_ENDS.indexOf(next)]!, end: next }
      : { ...taskWindow, end: next } })
  }
  const save = (nextTitle: string): boolean | Promise<boolean> => {
    return onSave({
      title: nextTitle,
      start,
      end: dnum(end) < dnum(start) ? start : end,
      priority,
      state,
      window: taskWindow,
    })
  }
  return (
    <StructuredRow className="ddlrow task-create-row" rowRef={row}>
      <DateButton iso={start} className="din" onPick={pickStart} />
      <span className="dsep">–</span>
      <DateButton iso={end} className="din" onPick={pickEnd} />
      <button
        className="din twmode" type="button"
        onClick={() => patch({ window: taskWindow ? null : { start: '10:00', end: '12:00' } })}
      >{taskWindow ? m.project.plan.windowMode.timed : m.project.plan.windowMode.allDay}</button>
      {taskWindow
        ? (
          <span className="twinputs">
            <ChoicePicker
              value={taskWindow.start} options={TASK_SLOT_STARTS}
              className="din time" onPick={pickWindowStart}
            />
            <span className="dsep">–</span>
            <ChoicePicker
              value={taskWindow.end} options={TASK_SLOT_ENDS}
              className="din time" onPick={pickWindowEnd}
            />
          </span>
        )
        : null}
      <TagButton
        tone={PRIORITY_TONE[priority]}
        onClick={() => patch({ priority: NEXT_PRIORITY[priority] })}
      >
        {priority.toUpperCase()}
      </TagButton>
      <button
        className="din state-edit" type="button"
        onClick={() => patch({ state: NEXT_TASK_STATE[state] })}
      >{stateWord(m)[state]}</button>
      <InlineDraftInput
        className="min" scopeRef={row} triggers={triggers} placeholder={m.project.plan.taskNamePlaceholder}
        onSubmit={save} onCancel={onCancel}
        value={title} onChange={(event) => patch({ title: event.target.value })}
      />
    </StructuredRow>
  )
}

/** The new-milestone row, a view of `draft`, which every change replaces through `onDraft`. */
function MilestoneCreateRow({ draft, onDraft, triggers, onSave, onCancel }: {
  draft: MilestoneDraft
  onDraft: (draft: MilestoneDraft) => void
  triggers: Array<RefObject<HTMLElement | null>>
  onSave: (draft: MilestoneDraft) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const { date, done, title } = draft
  const row = useRef<HTMLDivElement>(null)
  const m = useMessages()

  const save = (nextTitle: string): boolean | Promise<boolean> => {
    return onSave({ date, title: nextTitle, done })
  }

  return (
    <StructuredRow className="ddlrow milestone-create-row" rowRef={row}>
      <DateButton iso={date} className="din" onPick={(next) => onDraft({ ...draft, date: next })} />
      <button
        className="din state-edit" type="button"
        onClick={() => onDraft({ ...draft, done: !done })}
      >{done ? m.project.plan.milestoneState.done : m.project.plan.milestoneState.open}</button>
      <InlineDraftInput
        className="min" scopeRef={row} triggers={triggers} placeholder={m.project.plan.milestoneNamePlaceholder}
        onSubmit={save} onCancel={onCancel}
        value={title} onChange={(event) => onDraft({ ...draft, title: event.target.value })}
      />
    </StructuredRow>
  )
}

function PlanNameCell({ value, label, keep, onSave, rest }: {
  value: string
  label: string
  keep: NonNullable<InlineFieldProps['keep']>
  onSave: (value: string) => boolean | Promise<boolean>
  rest?: InlineFieldProps['rest']
}) {
  return (
    <InlineField
      label={label} value={value} display={<FadeText>{value}</FadeText>} wrapperClassName="plan-name-cell" keep={keep}
      buttonClassName="plan-cell plan-name" inputClassName="plan-name-input"
      normalize={(next) => next.trim()} validate={(next) => next !== ''} onSave={onSave}
      {...(rest === undefined ? {} : { rest })}
    />
  )
}

/**
 * A task's name cell: the name is the row's keyboard control for opening the task, so its click
 * reaches the row, and the pencil beside it renames the task in place.
 */
function TaskNameCell({ projectId, task, onSave }: { projectId: string; task: Task; onSave: (patch: TaskPatch) => Promise<boolean> }) {
  const m = useMessages()
  return (
    <PlanNameCell
      value={task.title} label={m.project.plan.taskNamePlaceholder} onSave={(title) => onSave({ title })}
      keep={{ scope: ['project', projectId, 'task', task.id], target: 'name' }}
      rest={(edit) => (
        <>
          <ToolbarButton className="plan-cell plan-name plan-open"><FadeText>{task.title}</FadeText></ToolbarButton>
          <RowActions>
            <IconButton
              label={m.project.plan.renameTaskFor(task.title)} size="nested"
              className="plan-rename" onClick={(event) => { event.stopPropagation(); edit() }}
            ><IconPencil /></IconButton>
          </RowActions>
        </>
      )}
    />
  )
}

/**
 * Task detail panel: the same shared panel and open/close interaction as a research node, showing
 * the task's fields (and that an agent added it, when one did), its Markdown note, editable in
 * place, its draft kept with the task of project `projectId`, and the research node it belongs to,
 * which opens through `onOpenNode`. The node is picked among `nodes` through `onSetNode`, which a
 * `handSet` node can also be taken away with.
 */
export function ProjectTaskPanel({
  projectId, task, node, nodes, handSet, onClose, onSaveNote, onOpenNode, onSetNode,
}: {
  projectId: string
  task: Task
  node: { id: string; label: string; mode: NonNullable<GraphNode['mode']> } | undefined
  nodes: readonly { id: string; label: string }[]
  handSet: boolean
  onClose: () => void
  onSaveNote: (note: string) => Promise<boolean>
  onOpenNode: (nodeId: string) => void
  onSetNode: (nodeId: string | null) => void
}) {
  const m = useMessages()
  const fmt = useFormat()
  const note = editText(useDrafts<EditDraft>(['project', projectId, 'task', task.id]), 'note', task.note ?? '')
  const box = useRef<HTMLDivElement>(null)
  const save = () => {
    if (note.stale) return
    const next = box.current?.innerText.trim() ?? ''
    note.drop()
    void onSaveNote(next)
  }
  return (
    <>
      <SectionHeading
        variant="rail" className="node-document-head"
        actions={<PanelClose onClose={onClose} />}
      ><FadeText className="node-document-title" label={task.title}>{task.title}</FadeText>
      </SectionHeading>
      <div className="project-task-detail-meta">
        <DateChip>{fmt.dateRange(task.start, task.end)}</DateChip>
        <ProjectPriorityTag priority={task.priority} />
        <span className="project-task-detail-state">{stateWord(m)[task.state]}</span>
        {task.origin === 'agent' ? <AgentLabel /> : null}
      </div>
      <NodeAssignment node={node} nodes={nodes} canUnlink={handSet} onOpen={onOpenNode} onSet={onSetNode} />
      <SectionHeading
        variant="rail"
        actions={(
          <EditActions editing={note.editing} canSave={!note.stale} onEdit={note.start} onCancel={note.drop} onSave={save} />
        )}
      >{m.project.plan.noteHeading}
      </SectionHeading>
      <MarkdownBox
        className="task-note" text={note.text} editing={note.editing} box={box}
        onCancel={note.drop} onSave={save} onType={note.change}
        empty={<EmptyState variant="section">{m.project.plan.noteEmpty}</EmptyState>}
      />
    </>
  )
}

function TaskRow({ projectId, task, flash, selected, reorder, onSave, onDelete, onOpen }: {
  projectId: string
  task: Task
  flash: boolean
  /** Whether this task's detail panel is the one currently open. */
  selected: boolean
  /**
   * The whole row is its drag handle: a task's name is a control, not prose, and a grip would take a
   * column from the narrow plan list. Omitted for an archived row: it does not move, since its
   * position among other done tasks does not matter.
   */
  reorder?: Reorderable
  onSave: (patch: TaskPatch) => Promise<boolean>
  onDelete: () => void
  /** Opens the task's detail panel; the row's own field editors swallow their clicks so they do not also open it. */
  onOpen: () => void
}) {
  const m = useMessages()
  return (
    // The row is the toolbar of its own controls, from its date to its delete.
    <Toolbar label={task.title}>
      <StructuredRow
        composite selected={selected} data-row={task.id} {...reorder?.item} {...reorder?.handle} onActivate={onOpen}
        className={`ddlrow task-row${task.state === 'done' ? ' done' : ''}${flash ? ' flash' : ''}`}
      >
        <TaskScheduleField mode="date" task={task} onSave={onSave} className="task-date-part" stopRowActivation />
        <TaskScheduleField mode="time" task={task} onSave={onSave} className="task-clock-part" stopRowActivation />
        <PriorityPicker
          value={task.priority} className={tagClass(PRIORITY_TONE[task.priority], 'label', 'plan-priority')}
          stopRowActivation
          onPick={(priority) => { void onSave({ priority }) }}
        >{task.priority.toUpperCase()}</PriorityPicker>
        <ChoicePicker
          value={task.state} options={TASK_STATES} label={(state) => stateWord(m)[state]}
          className="dleft plan-cell state-cell" stopRowActivation
          onPick={(state) => { void onSave({ state }) }}
        />
        {task.origin === 'agent'
          ? (
            <span className="task-name-with-origin">
              <TaskNameCell projectId={projectId} task={task} onSave={onSave} />
              <AgentLabel />
            </span>
          )
          : <TaskNameCell projectId={projectId} task={task} onSave={onSave} />}
        <RowActions>
          <IconButton
            label={m.project.plan.deleteTaskFor(task.title)} size="nested" tone="danger"
            className="row-delete" onClick={(event) => { event.stopPropagation(); onDelete() }}
          ><IconTrash /></IconButton>
        </RowActions>
      </StructuredRow>
    </Toolbar>
  )
}

function MilestoneRow({ projectId, milestone, flash, onHover, onSave, onDelete }: {
  projectId: string
  milestone: Milestone
  flash: boolean
  onHover: (milestoneId: string | null) => void
  onSave: (patch: Partial<Pick<Milestone, 'date' | 'title' | 'done'>>) => Promise<boolean>
  onDelete: () => void
}) {
  const m = useMessages()
  const milestoneState: typeof MILESTONE_STATES[number] = milestone.done ? 'done' : 'open'
  return (
    <StructuredRow
      data-row={milestone.id}
      className={`ddlrow milestone-row${milestone.done ? ' done' : ''}${flash ? ' flash' : ''}`}
      onMouseEnter={() => onHover(milestone.id)} onMouseLeave={() => onHover(null)}
    >
      <DateButton
        iso={milestone.date} className="plan-cell plan-date-button"
        onPick={(date) => { void onSave({ date }) }}
      >
        <DateChip date={milestone.date} className="plan-date" />
      </DateButton>
      <ChoicePicker
        value={milestoneState} options={MILESTONE_STATES}
        label={(state) => (state === 'done' ? m.project.plan.milestoneState.done : m.project.plan.milestoneState.open)}
        className="dleft plan-cell state-cell"
        onPick={(state) => { void onSave({ done: state === 'done' }) }}
      />
      <PlanNameCell
        value={milestone.title} label={m.project.plan.milestoneNamePlaceholder}
        keep={{ scope: ['project', projectId, 'milestone', milestone.id], target: 'name' }}
        onSave={(title) => onSave({ title })}
      />
      <RowActions>
        <IconButton
          label={m.project.plan.deleteMilestoneFor(milestone.title)} size="nested"
          tone="danger" className="row-delete" onClick={onDelete}
        ><IconTrash /></IconButton>
      </RowActions>
    </StructuredRow>
  )
}

/**
 * Complete research-plan editor. The host supplies persistence and timeline coordination while
 * this component owns task/milestone presentation, creation, and per-field editing behavior.
 */
export function ProjectPlan({
  projectId, project, tab, today, creating, flashId, selectedTaskId,
  listRef, addRef, timelineAddRef,
  onTab, onDiscardOpenEdits, onStartTask, onStartMilestone, onCreating, onCancelCreate,
  onCreateTask, onCreateMilestone, onUpdateTask, onDeleteTask, onReorderTasks, onOpenTask,
  onUpdateMilestone, onDeleteMilestone, onHoverMilestone,
}: {
  /** The project the plan is of, whose name edits are kept with its tasks and milestones. */
  projectId: string
  project: Pick<Project, 'tasks' | 'milestones'>
  tab: PlanTab
  today: string
  creating: PlanCreating | null
  flashId: string | null
  /** The task whose detail panel is currently open, so its row can show as selected. */
  selectedTaskId: string | null
  listRef: RefObject<HTMLDivElement | null>
  addRef: RefObject<HTMLButtonElement | null>
  timelineAddRef: RefObject<HTMLButtonElement | null>
  onTab: (tab: PlanTab) => void
  onDiscardOpenEdits: () => void
  onStartTask: () => void
  onStartMilestone: (date: string) => void
  /** Replaces the new row's fields as they are edited. */
  onCreating: (creating: PlanCreating) => void
  onCancelCreate: () => void
  onCreateTask: (draft: TaskDraft) => Promise<boolean>
  onCreateMilestone: (draft: MilestoneDraft) => Promise<boolean>
  onUpdateTask: (taskId: string, patch: TaskPatch) => Promise<boolean>
  onDeleteTask: (taskId: string) => void
  /** Persists a reordering of the task list, by drag or keyboard: `order` is a permutation of the project's task ids. */
  onReorderTasks: (order: string[]) => void
  /** Opens the task's detail panel; fired by clicking its row here or its bar/label in the Gantt. */
  onOpenTask: (taskId: string) => void
  onUpdateMilestone: (
    milestoneId: string,
    patch: Partial<Pick<Milestone, 'date' | 'title' | 'done'>>,
  ) => Promise<boolean>
  onDeleteMilestone: (milestoneId: string) => void
  onHoverMilestone: (milestoneId: string | null) => void
}) {
  const m = useMessages()
  const [taskArchiveOpen, setTaskArchiveOpen] = useState(false)
  const [msArchiveOpen, setMsArchiveOpen] = useState(false)
  const taskIds = useMemo(() => project.tasks.map((task) => task.id), [project.tasks])
  const taskDoneById = useMemo(
    () => new Map(project.tasks.map((task) => [task.id, task.state === 'done'])), [project.tasks],
  )
  const taskOrder = useDragReorder(
    taskIds, (id) => (taskDoneById.get(id) ? 'done' : 'active'), onReorderTasks,
  )
  const activeTasks = project.tasks.filter((task) => task.state !== 'done')
  const archivedTasks = project.tasks.filter((task) => task.state === 'done')
  const activeMilestones = [...project.milestones].filter((milestone) => !milestone.done)
    .sort((a, b) => dnum(a.date) - dnum(b.date))
  const archivedMilestones = [...project.milestones].filter((milestone) => milestone.done)
    .sort((a, b) => dnum(a.date) - dnum(b.date))
  const taskArchiveShown = taskArchiveOpen || archivedTasks.some((task) => task.id === flashId)
  const msArchiveShown = msArchiveOpen || archivedMilestones.some((milestone) => milestone.id === flashId)
  return (
    <section className="project-plan">
      <TabbedSection
        heading={m.project.sections.plan} label={m.project.plan.viewLabel} value={tab} panelRef={listRef}
        onChange={(value) => { onTab(value); onDiscardOpenEdits() }}
        actions={(
          <AddAction
            variant="section" ref={addRef}
            label={tab === 'ms' ? m.project.plan.addMilestone : m.project.plan.addTask}
            onClick={() => (tab === 'ms' ? onStartMilestone(today) : onStartTask())}
          >{tab === 'ms' ? m.project.plan.milestoneMode : m.project.plan.taskMode}</AddAction>
        )}
        tabs={[
          {
            value: 'task', label: m.project.plan.taskMode, empty: m.project.plan.noTasks,
            content: project.tasks.length === 0 && creating?.kind !== 'task' ? null : (
              <StructuredList id="taskList" variant="embedded">
                {creating?.kind === 'task'
                  ? (
                    <TaskCreateRow
                      draft={creating.draft} onDraft={(draft) => onCreating({ kind: 'task', draft })}
                      triggers={[addRef, timelineAddRef]}
                      onCancel={onCancelCreate} onSave={onCreateTask}
                    />
                  )
                  : null}
                {activeTasks.map((task) => (
                  <TaskRow
                    projectId={projectId}
                    key={task.id} task={task} flash={flashId === task.id} selected={selectedTaskId === task.id}
                    reorder={{ item: taskOrder.itemProps(task.id), handle: taskOrder.handleProps(task.id) }}
                    onSave={(patch) => onUpdateTask(task.id, patch)}
                    onDelete={() => onDeleteTask(task.id)}
                    onOpen={() => onOpenTask(task.id)}
                  />
                ))}
                {archivedTasks.length === 0
                  ? null
                  : (
                    <CollapsibleGroup
                      variant="quiet" title={m.common.archived} count={archivedTasks.length}
                      open={taskArchiveShown} onToggle={() => setTaskArchiveOpen((open) => !open)}
                    >
                      {archivedTasks.map((task) => (
                        <TaskRow
                          projectId={projectId}
                          key={task.id} task={task} flash={flashId === task.id}
                          selected={selectedTaskId === task.id}
                          onSave={(patch) => onUpdateTask(task.id, patch)}
                          onDelete={() => onDeleteTask(task.id)}
                          onOpen={() => onOpenTask(task.id)}
                        />
                      ))}
                    </CollapsibleGroup>
                  )}
              </StructuredList>
            ),
          },
          {
            value: 'ms', label: m.project.plan.milestoneMode, empty: m.project.plan.noMilestones,
            content: project.milestones.length === 0 && creating?.kind !== 'ms' ? null : (
              <StructuredList id="msList" variant="embedded">
                {activeMilestones.map((milestone) => (
                  <MilestoneRow
                    projectId={projectId}
                    key={milestone.id} milestone={milestone} flash={flashId === milestone.id}
                    onHover={onHoverMilestone}
                    onSave={(patch) => onUpdateMilestone(milestone.id, patch)}
                    onDelete={() => onDeleteMilestone(milestone.id)}
                  />
                ))}
                {creating?.kind === 'ms'
                  ? (
                    <MilestoneCreateRow
                      draft={creating.draft} onDraft={(draft) => onCreating({ kind: 'ms', draft })}
                      triggers={[addRef, timelineAddRef]}
                      onCancel={onCancelCreate} onSave={onCreateMilestone}
                    />
                  )
                  : null}
                {archivedMilestones.length === 0
                  ? null
                  : (
                    <CollapsibleGroup
                      variant="quiet" title={m.common.archived} count={archivedMilestones.length}
                      open={msArchiveShown} onToggle={() => setMsArchiveOpen((open) => !open)}
                    >
                      {archivedMilestones.map((milestone) => (
                        <MilestoneRow
                          projectId={projectId}
                          key={milestone.id} milestone={milestone} flash={flashId === milestone.id}
                          onHover={onHoverMilestone}
                          onSave={(patch) => onUpdateMilestone(milestone.id, patch)}
                          onDelete={() => onDeleteMilestone(milestone.id)}
                        />
                      ))}
                    </CollapsibleGroup>
                  )}
              </StructuredList>
            ),
          },
        ]}
      />
    </section>
  )
}
