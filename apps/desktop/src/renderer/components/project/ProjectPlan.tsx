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
import { InlineField } from '../InlineField.js'
import { MarkdownBox } from '../Markdown.js'
import { PanelClose } from '../PanelClose.js'
import { TaskScheduleField } from '../TaskScheduleField.js'
import { IconTrash } from '../icons.js'
import { SectionHeading } from '../PageShell.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { useDragReorder, type DragCardProps } from '../../hooks/useDragReorder.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { NodeTag } from './NodeTag.js'
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
      <DateButton iso={start} className="din" title={m.project.plan.pickStart} onPick={pickStart} />
      <span className="dsep">–</span>
      <DateButton iso={end} className="din" title={m.project.plan.pickEnd} onPick={pickEnd} />
      <button
        className="din twmode" type="button" title={m.project.plan.toggleWindowMode}
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
      <button
        className={`din prw prtag ${priority}`} title={m.project.plan.cyclePriority}
        onClick={() => setPriority(NEXT_PRIORITY[priority])}
      >
        {priority.toUpperCase()}
      </button>
      <button
        className="din state-edit" type="button" title={m.project.plan.cycleState}
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
      <DateButton iso={date} className="din" title={m.project.plan.pickDate} onPick={setDate} />
      <button
        className="din state-edit" type="button" title={m.project.plan.cycleState}
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

function PlanNameCell({ value, label, onSave, stopRowActivation = false }: {
  value: string
  label: string
  onSave: (value: string) => boolean | Promise<boolean>
  stopRowActivation?: boolean
}) {
  return (
    <InlineField
      label={label} value={value} wrapperClassName="plan-name-cell"
      buttonClassName="plan-cell plan-name" inputClassName="plan-name-input"
      normalize={(next) => next.trim()} validate={(next) => next !== ''} onSave={onSave}
      stopRowActivation={stopRowActivation}
    />
  )
}

/**
 * Task detail panel: the same shared panel and open/close interaction as a research node, showing
 * the task's fields (and that an agent added it, when one did), its Markdown note, editable in
 * place, and the research node it belongs to, which opens through `onOpenNode`.
 */
export function ProjectTaskPanel({ task, node, onClose, onSaveNote, onOpenNode }: {
  task: Task
  node: { id: string; label: string; mode: NonNullable<GraphNode['mode']> } | undefined
  onClose: () => void
  onSaveNote: (note: string) => Promise<boolean>
  onOpenNode: (nodeId: string) => void
}) {
  const m = useMessages()
  const fmt = useFormat()
  const [editing, setEditing] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const toggle = () => {
    if (!editing) { setEditing(true); return }
    const next = box.current?.innerText.trim() ?? ''
    setEditing(false)
    void onSaveNote(next)
  }
  return (
    <>
      <SectionHeading
        variant="rail" className="node-document-head"
        actions={<PanelClose onClose={onClose} />}
      ><span className="node-document-title">{task.title}</span>
      </SectionHeading>
      <div className="project-task-detail-meta">
        <DateChip>{fmt.dateRange(task.start, task.end)}</DateChip>
        <span className={`prtag ${task.priority}`}>{task.priority.toUpperCase()}</span>
        <span className="project-task-detail-state">{stateWord(m)[task.state]}</span>
        {task.origin === 'agent' ? <span className="agtag">{m.project.records.who.agent}</span> : null}
      </div>
      <SectionHeading variant="rail">{m.project.plan.nodeHeading}</SectionHeading>
      {node === undefined
        ? <EmptyState variant="section">{m.project.plan.noNode}</EmptyState>
        : (
          <div className="project-task-detail-node">
            <NodeTag
              label={node.label} mode={node.mode} hint={m.project.records.goToGraph(node.label)}
              onOpen={() => onOpenNode(node.id)}
            />
          </div>
        )}
      <SectionHeading variant="rail" className="flexh">{m.project.plan.noteHeading}
        <button className="btn plain" onClick={toggle}>{editing ? m.common.save : m.common.edit}</button>
      </SectionHeading>
      <MarkdownBox
        className="task-note" text={task.note ?? ''} editing={editing} box={box}
        onCancel={() => setEditing(false)}
        empty={<span className="lm">{m.project.plan.noteEmpty}</span>}
      />
    </>
  )
}

function TaskRow({ task, flash, selected, dragProps, dropClass = '', onSave, onDelete, onOpen }: {
  task: Task
  flash: boolean
  /** Whether this task's detail panel is the one currently open. */
  selected: boolean
  /** Omitted for an archived row: it is not draggable, since its position among other done tasks does not matter. */
  dragProps?: DragCardProps
  dropClass?: string
  onSave: (patch: TaskPatch) => Promise<boolean>
  onDelete: () => void
  /** Opens the task's detail panel; the row's own field editors swallow their clicks so they do not also open it. */
  onOpen: () => void
}) {
  const m = useMessages()
  return (
    <StructuredRow
      composite selected={selected} data-row={task.id} {...dragProps} onActivate={onOpen}
      title={m.project.plan.openTask}
      className={`ddlrow task-row${task.state === 'done' ? ' done' : ''}${flash ? ' flash' : ''}${
        dropClass ? ` ${dropClass}` : ''}`}
    >
      <TaskScheduleField mode="date" task={task} onSave={onSave} className="task-date-part" stopRowActivation />
      <TaskScheduleField mode="time" task={task} onSave={onSave} className="task-clock-part" stopRowActivation />
      <PriorityPicker
        value={task.priority} className={`prtag ${task.priority} plan-cell`}
        title={m.project.plan.editPriority} stopRowActivation
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
            <PlanNameCell
              value={task.title} label={m.project.plan.taskNamePlaceholder} onSave={(title) => onSave({ title })}
              stopRowActivation
            />
            <span className="agtag">{m.project.records.who.agent}</span>
          </span>
        )
        : (
          <PlanNameCell
            value={task.title} label={m.project.plan.taskNamePlaceholder} onSave={(title) => onSave({ title })}
            stopRowActivation
          />
        )}
      <button
        className="row-delete" type="button"
        title={m.project.plan.deleteTask} aria-label={m.project.plan.deleteTaskFor(task.title)}
        onClick={(event) => { event.stopPropagation(); onDelete() }}
      ><IconTrash /></button>
    </StructuredRow>
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
        iso={milestone.date} className="dchip plan-cell plan-date-button"
        title={m.project.plan.editDate} onPick={(date) => { void onSave({ date }) }}
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
      <button
        className="row-delete" type="button" title={m.project.plan.deleteMilestone}
        aria-label={m.project.plan.deleteMilestoneFor(milestone.title)} onClick={onDelete}
      ><IconTrash /></button>
    </StructuredRow>
  )
}

/**
 * Complete research-plan editor. The host supplies persistence and timeline coordination while
 * this component owns task/milestone presentation, creation, and per-field editing behavior.
 */
export function ProjectPlan({
  project, tab, today, creating, flashId, selectedTaskId,
  listRef, addRef, timelineAddRef, milestoneLaneRef,
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
  milestoneLaneRef: RefObject<HTMLDivElement | null>
  onTab: (tab: PlanTab) => void
  onDiscardOpenEdits: () => void
  onStartTask: () => void
  onStartMilestone: (date: string) => void
  onCancelCreate: () => void
  onCreateTask: (draft: TaskDraft) => Promise<boolean>
  onCreateMilestone: (draft: MilestoneDraft) => Promise<boolean>
  onUpdateTask: (taskId: string, patch: TaskPatch) => Promise<boolean>
  onDeleteTask: (taskId: string) => void
  /** Persists a full drag-reordering of the task list: `order` is a permutation of the project's task ids. */
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
      <SectionHeading variant="content" className="flexh">{m.project.sections.plan}
        <div className="section-actions">
          <SegmentedControl
            label={m.project.plan.viewLabel}
            value={tab}
            options={[
              { value: 'task', label: m.project.plan.taskMode },
              { value: 'ms', label: m.project.plan.milestoneMode },
            ]}
            onChange={(value) => { onTab(value); onDiscardOpenEdits() }}
          />
          <AddAction
            variant="section" ref={addRef}
            title={tab === 'ms' ? m.project.plan.addMilestone : m.project.plan.addTask}
            onClick={() => (tab === 'ms' ? onStartMilestone(today) : onStartTask())}
          >{tab === 'ms' ? m.project.plan.milestoneMode : m.project.plan.taskMode}</AddAction>
        </div>
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
                  dragProps={taskOrder.cardProps(task.id)} dropClass={taskOrder.dropClass(task.id)}
                  onSave={(patch) => onUpdateTask(task.id, patch)}
                  onDelete={() => onDeleteTask(task.id)}
                  onOpen={() => onOpenTask(task.id)}
                />
              ))}
              {project.tasks.length === 0 && creating?.kind !== 'task'
                ? <div className="lm">{m.project.plan.noTasks}</div>
                : null}
              {archivedTasks.length === 0
                ? null
                : (
                  <CollapsibleGroup
                    variant="quiet" title={m.common.archived}
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
                    triggers={[addRef, timelineAddRef, milestoneLaneRef]}
                    onCancel={onCancelCreate} onSave={onCreateMilestone}
                  />
                )
                : null}
              {archivedMilestones.length === 0
                ? null
                : (
                  <CollapsibleGroup
                    variant="quiet" title={m.common.archived}
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
