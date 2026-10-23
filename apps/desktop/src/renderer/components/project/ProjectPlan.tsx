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
import { SegmentedControl } from '../SegmentedControl.js'
import { RowActions, StructuredList, StructuredRow } from '../StructuredList.js'
import { Toolbar, ToolbarButton } from '../Toolbar.js'
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

export type PlanCreating =
  | { kind: 'task'; date: string; window: TaskWindow | null }
  | { kind: 'ms'; date: string }

export type TaskDraft = Pick<Task, 'title' | 'start' | 'end' | 'priority' | 'state'> & {
  window: TaskWindow | null
}

export type MilestoneDraft = Pick<Milestone, 'date' | 'title' | 'done'>

function TaskCreateRow({ initial, triggers, onSave, onCancel }: {
  initial: Omit<TaskDraft, 'window'> & { window?: TaskWindow | null | undefined }
  triggers: Array<RefObject<HTMLElement | null>>
  onSave: (draft: TaskDraft) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [taskWindow, setTaskWindow] = useState<TaskWindow | null>(initial.window ?? null)
  const [priority, setPriority] = useState(initial.priority)
  const [state, setState] = useState(initial.state)
  const [title, setTitle] = useState(initial.title)
  const row = useRef<HTMLDivElement>(null)
  const m = useMessages()

  const pickStart = (iso: string) => {
    setStart(iso)
    if (dnum(end) < dnum(iso)) setEnd(iso)
    if (taskWindow && iso === end && taskWindow.end <= taskWindow.start) {
      const index = TASK_SLOT_STARTS.indexOf(taskWindow.start)
      setTaskWindow({ ...taskWindow, end: TASK_SLOT_ENDS[index]! })
    }
  }
  const pickEnd = (iso: string) => {
    const next = dnum(iso) < dnum(start) ? start : iso
    setEnd(next)
    if (taskWindow && next === start && taskWindow.end <= taskWindow.start) {
      const index = TASK_SLOT_ENDS.indexOf(taskWindow.end)
      setTaskWindow({ ...taskWindow, start: TASK_SLOT_STARTS[index]! })
    }
  }
  const pickWindowStart = (next: TaskWindow['start']) => setTaskWindow((current) => {
    if (!current) return current
    return start === end && current.end <= next
      ? { start: next, end: TASK_SLOT_ENDS[TASK_SLOT_STARTS.indexOf(next)]! }
      : { ...current, start: next }
  })
  const pickWindowEnd = (next: TaskWindow['end']) => setTaskWindow((current) => {
    if (!current) return current
    return start === end && next <= current.start
      ? { start: TASK_SLOT_STARTS[TASK_SLOT_ENDS.indexOf(next)]!, end: next }
      : { ...current, end: next }
  })
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
        onClick={() => setTaskWindow((current) => current ? null : { start: '10:00', end: '12:00' })}
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
        onClick={() => setPriority(NEXT_PRIORITY[priority])}
      >
        {priority.toUpperCase()}
      </TagButton>
      <button
        className="din state-edit" type="button"
        onClick={() => setState(NEXT_TASK_STATE[state])}
      >{stateWord(m)[state]}</button>
      <InlineDraftInput
        className="min" scopeRef={row} triggers={triggers} placeholder={m.project.plan.taskNamePlaceholder}
        onSubmit={save} onCancel={onCancel}
        value={title} onChange={(event) => setTitle(event.target.value)}
      />
    </StructuredRow>
  )
}

function MilestoneCreateRow({ initial, triggers, onSave, onCancel }: {
  initial: MilestoneDraft
  triggers: Array<RefObject<HTMLElement | null>>
  onSave: (draft: MilestoneDraft) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const [date, setDate] = useState(initial.date)
  const [done, setDone] = useState(initial.done)
  const [title, setTitle] = useState(initial.title)
  const row = useRef<HTMLDivElement>(null)
  const m = useMessages()

  const save = (nextTitle: string): boolean | Promise<boolean> => {
    return onSave({ date, title: nextTitle, done })
  }

  return (
    <StructuredRow className="ddlrow milestone-create-row" rowRef={row}>
      <DateButton iso={date} className="din" onPick={setDate} />
      <button
        className="din state-edit" type="button"
        onClick={() => setDone((current) => !current)}
      >{done ? m.project.plan.milestoneState.done : m.project.plan.milestoneState.open}</button>
      <InlineDraftInput
        className="min" scopeRef={row} triggers={triggers} placeholder={m.project.plan.milestoneNamePlaceholder}
        onSubmit={save} onCancel={onCancel}
        value={title} onChange={(event) => setTitle(event.target.value)}
      />
    </StructuredRow>
  )
}

function PlanNameCell({ value, label, onSave, rest }: {
  value: string
  label: string
  onSave: (value: string) => boolean | Promise<boolean>
  rest?: InlineFieldProps['rest']
}) {
  return (
    <InlineField
      label={label} value={value} display={<FadeText>{value}</FadeText>} wrapperClassName="plan-name-cell"
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
function TaskNameCell({ task, onSave }: { task: Task; onSave: (patch: TaskPatch) => Promise<boolean> }) {
  const m = useMessages()
  return (
    <PlanNameCell
      value={task.title} label={m.project.plan.taskNamePlaceholder} onSave={(title) => onSave({ title })}
      rest={(edit) => (
        <>
          <ToolbarButton className="plan-cell plan-name plan-open"><FadeText>{task.title}</FadeText></ToolbarButton>
          <IconButton
            label={m.project.plan.renameTaskFor(task.title)} size="nested"
            className="plan-rename" onClick={(event) => { event.stopPropagation(); edit() }}
          ><IconPencil /></IconButton>
        </>
      )}
    />
  )
}

/**
 * Task detail panel: the same shared panel and open/close interaction as a research node, showing
 * the task's fields (and that an agent added it, when one did), its Markdown note, editable in
 * place, and the research node it belongs to, which opens through `onOpenNode`. The node is picked
 * among `nodes` through `onSetNode`, which a `handSet` node can also be taken away with.
 */
export function ProjectTaskPanel({
  task, node, nodes, handSet, onClose, onSaveNote, onOpenNode, onSetNode,
}: {
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
  const [editing, setEditing] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const save = () => {
    const next = box.current?.innerText.trim() ?? ''
    setEditing(false)
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
          <EditActions
            editing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSave={save}
          />
        )}
      >{m.project.plan.noteHeading}
      </SectionHeading>
      <MarkdownBox
        className="task-note" text={task.note ?? ''} editing={editing} box={box}
        onCancel={() => setEditing(false)} onSave={save}
        empty={<EmptyState variant="section">{m.project.plan.noteEmpty}</EmptyState>}
      />
    </>
  )
}

function TaskRow({ task, flash, selected, reorder, dropClass = '', onSave, onDelete, onOpen }: {
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
  dropClass?: string
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
        className={`ddlrow task-row${task.state === 'done' ? ' done' : ''}${flash ? ' flash' : ''}${
          dropClass ? ` ${dropClass}` : ''}`}
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
              <TaskNameCell task={task} onSave={onSave} />
              <AgentLabel />
            </span>
          )
          : <TaskNameCell task={task} onSave={onSave} />}
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

function MilestoneRow({ milestone, flash, onHover, onSave, onDelete }: {
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
  project, tab, today, creating, flashId, selectedTaskId,
  listRef, addRef, timelineAddRef,
  onTab, onDiscardOpenEdits, onStartTask, onStartMilestone, onCancelCreate,
  onCreateTask, onCreateMilestone, onUpdateTask, onDeleteTask, onReorderTasks, onOpenTask,
  onUpdateMilestone, onDeleteMilestone, onHoverMilestone,
}: {
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
      <SectionHeading
        actions={(
          <>
            <SegmentedControl
              size="sm" label={m.project.plan.viewLabel}
              value={tab}
              options={[
                { value: 'task', label: m.project.plan.taskMode },
                { value: 'ms', label: m.project.plan.milestoneMode },
              ]}
              onChange={(value) => { onTab(value); onDiscardOpenEdits() }}
            />
            <AddAction
              variant="section" ref={addRef}
              label={tab === 'ms' ? m.project.plan.addMilestone : m.project.plan.addTask}
              onClick={() => (tab === 'ms' ? onStartMilestone(today) : onStartTask())}
            >{tab === 'ms' ? m.project.plan.milestoneMode : m.project.plan.taskMode}</AddAction>
          </>
        )}
      >{m.project.sections.plan}
      </SectionHeading>

      <div ref={listRef}>
        {tab === 'task'
          ? (
            <StructuredList id="taskList" variant="embedded">
              {creating?.kind === 'task'
                ? (
                  <TaskCreateRow
                    initial={{
                      title: '',
                      start: creating.date,
                      end: creating.window ? creating.date : isoOf(dnum(creating.date) + 6),
                      priority: 'p1',
                      state: 'act',
                      window: creating.window,
                    }}
                    triggers={[addRef, timelineAddRef]}
                    onCancel={onCancelCreate} onSave={onCreateTask}
                  />
                )
                : null}
              {activeTasks.map((task) => (
                <TaskRow
                  key={task.id} task={task} flash={flashId === task.id} selected={selectedTaskId === task.id}
                  reorder={{ item: taskOrder.itemProps(task.id), handle: taskOrder.handleProps(task.id) }}
                  dropClass={taskOrder.dropClass(task.id)}
                  onSave={(patch) => onUpdateTask(task.id, patch)}
                  onDelete={() => onDeleteTask(task.id)}
                  onOpen={() => onOpenTask(task.id)}
                />
              ))}
              {project.tasks.length === 0 && creating?.kind !== 'task'
                ? <EmptyState variant="section">{m.project.plan.noTasks}</EmptyState>
                : null}
              {archivedTasks.length === 0
                ? null
                : (
                  <CollapsibleGroup
                    variant="quiet" title={m.common.archived} count={archivedTasks.length}
                    open={taskArchiveShown} onToggle={() => setTaskArchiveOpen((open) => !open)}
                  >
                    {archivedTasks.map((task) => (
                      <TaskRow
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
          )
          : (
            <StructuredList id="msList" variant="embedded">
              {activeMilestones.map((milestone) => (
                <MilestoneRow
                  key={milestone.id} milestone={milestone} flash={flashId === milestone.id}
                  onHover={onHoverMilestone}
                  onSave={(patch) => onUpdateMilestone(milestone.id, patch)}
                  onDelete={() => onDeleteMilestone(milestone.id)}
                />
              ))}
              {creating?.kind === 'ms'
                ? (
                  <MilestoneCreateRow
                    initial={{ date: creating.date, title: '', done: false }}
                    triggers={[addRef, timelineAddRef]}
                    onCancel={onCancelCreate} onSave={onCreateMilestone}
                  />
                )
                : null}
              {project.milestones.length === 0 && creating?.kind !== 'ms'
                ? <EmptyState variant="section">{m.project.plan.noMilestones}</EmptyState>
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
                        key={milestone.id} milestone={milestone} flash={flashId === milestone.id}
                        onHover={onHoverMilestone}
                        onSave={(patch) => onUpdateMilestone(milestone.id, patch)}
                        onDelete={() => onDeleteMilestone(milestone.id)}
                      />
                    ))}
                  </CollapsibleGroup>
                )}
            </StructuredList>
          )}
      </div>
    </section>
  )
}
