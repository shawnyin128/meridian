import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import type {
  Milestone,
  ProjectDetail as Project,
  Task,
  TaskPatch,
  TaskWindow,
} from '../../../shared/contract.js'
import { TASK_SLOT_ENDS, TASK_SLOT_STARTS } from '../../../shared/contract.js'
import { dnum, isoOf } from '../../../shared/dates.js'
import { AddAction } from '../AddAction.js'
import { DateChip } from '../DateTimeDisplay.js'
import { ChoicePicker, DateButton, PriorityPicker } from '../FieldPickers.js'
import { InlineDraftInput } from '../InlineDraftInput.js'
import { InlineField } from '../InlineField.js'
import { TaskScheduleField } from '../TaskScheduleField.js'
import { IconTrash } from '../icons.js'
import { SectionHeading } from '../PageShell.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
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

function PlanNameCell({ value, label, onSave }: {
  value: string
  label: string
  onSave: (value: string) => boolean | Promise<boolean>
}) {
  return (
    <InlineField
      label={label} value={value} wrapperClassName="plan-name-cell"
      buttonClassName="plan-cell plan-name" inputClassName="plan-name-input"
      normalize={(next) => next.trim()} validate={(next) => next !== ''} onSave={onSave}
    />
  )
}

function TaskRow({ task, flash, onSave, onDelete }: {
  task: Task
  flash: boolean
  onSave: (patch: TaskPatch) => Promise<boolean>
  onDelete: () => void
}) {
  const m = useMessages()
  return (
    <StructuredRow
      data-row={task.id}
      className={`ddlrow task-row${task.state === 'done' ? ' done' : ''}${flash ? ' flash' : ''}`}
    >
      <TaskScheduleField mode="date" task={task} onSave={onSave} className="task-date-part" />
      <TaskScheduleField mode="time" task={task} onSave={onSave} className="task-clock-part" />
      <PriorityPicker
        value={task.priority} className={`prtag ${task.priority} plan-cell`}
        title={m.project.plan.editPriority}
        onPick={(priority) => { void onSave({ priority }) }}
      >{task.priority.toUpperCase()}</PriorityPicker>
      <ChoicePicker
        value={task.state} options={TASK_STATES} label={(state) => stateWord(m)[state]}
        className="dleft plan-cell state-cell" onPick={(state) => { void onSave({ state }) }}
      />
      <PlanNameCell
        value={task.title} label={m.project.plan.taskNamePlaceholder} onSave={(title) => onSave({ title })}
      />
      <button
        className="row-delete" type="button"
        title={m.project.plan.deleteTask} aria-label={m.project.plan.deleteTaskFor(task.title)}
        onClick={onDelete}
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
  project, tab, today, creating, flashId,
  listRef, addRef, timelineAddRef, milestoneLaneRef,
  onTab, onDiscardOpenEdits, onStartTask, onStartMilestone, onCancelCreate,
  onCreateTask, onCreateMilestone, onUpdateTask, onDeleteTask,
  onUpdateMilestone, onDeleteMilestone, onHoverMilestone,
}: {
  project: Pick<Project, 'tasks' | 'milestones'>
  tab: PlanTab
  today: string
  creating: PlanCreating | null
  flashId: string | null
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
  onUpdateMilestone: (
    milestoneId: string,
    patch: Partial<Pick<Milestone, 'date' | 'title' | 'done'>>,
  ) => Promise<boolean>
  onDeleteMilestone: (milestoneId: string) => void
  onHoverMilestone: (milestoneId: string | null) => void
}) {
  const m = useMessages()
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
              {project.tasks.map((task) => (
                <TaskRow
                  key={task.id} task={task} flash={flashId === task.id}
                  onSave={(patch) => onUpdateTask(task.id, patch)}
                  onDelete={() => onDeleteTask(task.id)}
                />
              ))}
              {project.tasks.length === 0 && creating?.kind !== 'task'
                ? <div className="lm">{m.project.plan.noTasks}</div>
                : null}
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
            </StructuredList>
          )
          : (
            <StructuredList id="msList" variant="embedded">
              {[...project.milestones].sort((a, b) => dnum(a.date) - dnum(b.date)).map((milestone) => (
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
            </StructuredList>
          )}
      </div>
    </section>
  )
}
