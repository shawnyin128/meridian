import { useMemo, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type {
  GraphNode,
  Milestone,
  ProjectDetail as Project,
  Task,
  TaskPatch,
  TaskWindow,
} from '../../../shared/contract.js'
import { dnum, isoOf } from '../../../shared/dates.js'
import { AddAction } from '../AddAction.js'
import { Group } from '../GroupedList.js'
import { DateChip } from '../DateTimeDisplay.js'
import { MenuItem } from '../ActionMenu.js'
import { ChoicePicker, DateButton, DotsMenu, PriorityPicker } from '../FieldPickers.js'
import { InlineDraftInput } from '../InlineDraftInput.js'
import { InlineField, type InlineFieldProps } from '../InlineField.js'
import { MarkdownSection } from '../Markdown.js'
import { PanelBody, PanelHead } from '../SidePanel.js'
import { TaskScheduleField } from '../TaskScheduleField.js'
import { DraftSlot } from '../DraftSlot.js'
import { Item } from '../Item.js'
import { List } from '../List.js'
import { TabbedSection } from '../TabbedSection.js'
import { Toolbar, ToolbarButton } from '../Toolbar.js'
import { editText, useDrafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useDragReorder, type ReorderItemProps } from '../../hooks/useDragReorder.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { AgentLabel } from '../SourceLabel.js'
import { tagClass } from '../Tag.js'
import { NodeAssignment } from './NodeAssignment.js'
import { PRIORITY_STATE, ProjectPriorityTag } from './ProjectIdentity.js'
import { FadeText } from '../FadeText.js'
import './ProjectPlan.css'

const stateWord = (m: Catalog): Record<Task['state'], string> => m.project.plan.state
const TASK_STATES: Task['state'][] = ['act', 'plan', 'done']
const MILESTONE_STATES = ['open', 'done'] as const

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

/**
 * The new-task row, a view of `draft`, which every change replaces through `onDraft`: its date, time,
 * priority and state are picked as a saved task's are, in the same columns. `row` is its draft slot.
 */
function TaskCreateRow({ row, draft, onDraft, triggers, onSave, onCancel }: {
  row: RefObject<HTMLElement | null>
  draft: TaskDraft
  onDraft: (draft: TaskDraft) => void
  triggers: Array<RefObject<HTMLElement | null>>
  onSave: (draft: TaskDraft) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const { priority, state, title } = draft
  const patch = (fields: Partial<TaskDraft>) => onDraft({ ...draft, ...fields })
  const schedule = (fields: TaskPatch) => {
    patch({
      start: fields.start ?? draft.start, end: fields.end ?? draft.end,
      window: fields.window === undefined ? draft.window : fields.window,
    })
    return Promise.resolve(true)
  }
  const m = useMessages()

  return (
    <DraftSlot subgrid className="ddlrow task-row task-create-row" slot={row}>
      <TaskScheduleField mode="date" task={draft} onSave={schedule} className="task-date-part" />
      <TaskScheduleField mode="time" task={draft} onSave={schedule} className="task-clock-part" />
      <PriorityPicker
        value={priority} className={tagClass(PRIORITY_STATE[priority], 'label', 'plan-priority')}
        onPick={(next) => patch({ priority: next })}
      >{priority.toUpperCase()}</PriorityPicker>
      <ChoicePicker
        value={state} options={TASK_STATES} label={(next) => stateWord(m)[next]}
        className="dleft plan-cell state-cell" onPick={(next) => patch({ state: next })}
      />
      <span className="plan-name-cell">
        <InlineDraftInput
          scopeRef={row} triggers={triggers} placeholder={m.project.plan.taskNamePlaceholder}
          onSubmit={(nextTitle) => onSave({ ...draft, title: nextTitle })} onCancel={onCancel}
          value={title} onChange={(event) => patch({ title: event.target.value })}
        />
      </span>
    </DraftSlot>
  )
}

/**
 * The new-milestone row, a view of `draft`, which every change replaces through `onDraft`: its date
 * and state are picked as a saved milestone's are, in the same columns. `row` is its draft slot.
 */
function MilestoneCreateRow({ row, draft, onDraft, triggers, onSave, onCancel }: {
  row: RefObject<HTMLElement | null>
  draft: MilestoneDraft
  onDraft: (draft: MilestoneDraft) => void
  triggers: Array<RefObject<HTMLElement | null>>
  onSave: (draft: MilestoneDraft) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const { date, done, title } = draft
  const m = useMessages()

  return (
    <DraftSlot subgrid className="ddlrow milestone-row milestone-create-row" slot={row}>
      <DateButton iso={date} className="plan-cell plan-date-button" onPick={(next) => onDraft({ ...draft, date: next })}>
        <DateChip date={date} className="plan-date" />
      </DateButton>
      <MilestoneStatePicker done={done} onPick={(next) => onDraft({ ...draft, done: next })} />
      <span className="plan-name-cell">
        <InlineDraftInput
          scopeRef={row} triggers={triggers} placeholder={m.project.plan.milestoneNamePlaceholder}
          onSubmit={(nextTitle) => onSave({ date, title: nextTitle, done })} onCancel={onCancel}
          value={title} onChange={(event) => onDraft({ ...draft, title: event.target.value })}
        />
      </span>
    </DraftSlot>
  )
}

/** A milestone's open or done state, picked from a menu, in a new row and a saved one alike. */
function MilestoneStatePicker({ done, onPick }: { done: boolean; onPick: (done: boolean) => void }) {
  const m = useMessages()
  return (
    <ChoicePicker
      value={done ? 'done' : 'open'} options={MILESTONE_STATES}
      label={(state) => (state === 'done' ? m.project.plan.milestoneState.done : m.project.plan.milestoneState.open)}
      className="dleft plan-cell state-cell"
      onPick={(state) => onPick(state === 'done')}
    />
  )
}

/** Where a task's or milestone's name being renamed is kept: the name, among its item's drafts. */
const nameDraft = (projectId: string, kind: 'task' | 'milestone', id: string) => ({ scope: ['project', projectId, kind, id], target: 'name' })

/**
 * A task's or milestone's name in its row: `rest` at rest, and, once its row's … menu has asked to
 * rename it, the name's inline field in its place, kept as a draft under `keep`.
 */
function PlanNameCell({ value, label, keep, onSave, rest }: {
  value: string
  label: string
  keep: NonNullable<InlineFieldProps['keep']>
  onSave: (value: string) => boolean | Promise<boolean>
  rest: ReactNode
}) {
  return (
    <InlineField
      label={label} value={value} className="plan-name-cell" keep={keep}
      normalize={(next) => next.trim()} validate={(next) => next !== ''} onSave={onSave} rest={rest} selectAll
    />
  )
}

/**
 * The … menu of a task's or milestone's row: Rename, which opens the name `title` in place through its
 * draft under `keep`, and Delete, which goes to `onDelete` at once, since the change log can undo it.
 */
function PlanRowMenu({ title, keep, onDelete }: {
  title: string
  keep: NonNullable<InlineFieldProps['keep']>
  onDelete: () => void
}) {
  const m = useMessages()
  const names = useDrafts<string>(keep.scope)
  return (
    <DotsMenu stopRowActivation onRename={() => names.set(keep.target, title)}>
      <MenuItem className="mi danger" onSelect={onDelete}>{m.common.delete}</MenuItem>
    </DotsMenu>
  )
}

/** A task's name cell: the name is the row's keyboard control for opening the task, so its click reaches the row. */
function TaskNameCell({ projectId, task, onSave }: { projectId: string; task: Task; onSave: (patch: TaskPatch) => Promise<boolean> }) {
  const m = useMessages()
  return (
    <PlanNameCell
      value={task.title} label={m.project.plan.taskNamePlaceholder} onSave={(title) => onSave({ title })}
      keep={nameDraft(projectId, 'task', task.id)}
      rest={<ToolbarButton className="plan-cell plan-name plan-open"><FadeText>{task.title}</FadeText></ToolbarButton>}
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
  return (
    <>
      <PanelHead title={task.title} onClose={onClose} />
      <PanelBody>
        <div className="project-task-detail-meta">
          <DateChip>{fmt.dateRange(task.start, task.end)}</DateChip>
          <ProjectPriorityTag priority={task.priority} />
          <span className="project-task-detail-state">{stateWord(m)[task.state]}</span>
          {task.origin === 'agent' ? <AgentLabel /> : null}
        </div>
        <NodeAssignment node={node} nodes={nodes} canUnlink={handSet} onOpen={onOpenNode} onSet={onSetNode} />
        <MarkdownSection
          key={task.id} title={m.project.plan.noteHeading} level="group" className="task-note" edit={note}
          onSave={(next) => {
            note.drop()
            void onSaveNote(next)
          }}
        />
      </PanelBody>
    </>
  )
}

function TaskRow({ projectId, task, selected, reorder, onSave, onDelete, onOpen }: {
  projectId: string
  task: Task
  /** Whether this task's detail panel is the one currently open. */
  selected: boolean
  /**
   * The whole row is its drag handle: a task's name is a control, not prose, and a grip would take a
   * column from the narrow plan list. Omitted for an archived row: it does not move, since its
   * position among other done tasks does not matter.
   */
  reorder?: ReorderItemProps
  onSave: (patch: TaskPatch) => Promise<boolean>
  onDelete: () => void
  /** Opens the task's detail panel; the row's own field editors swallow their clicks so they do not also open it. */
  onOpen: () => void
}) {
  const m = useMessages()
  return (
    // The row is the toolbar of its own controls, from its date to its delete.
    <Toolbar label={task.title}>
      <Item
        composite subgrid selected={selected} data-row={task.id} {...reorder} onActivate={onOpen}
        className={`ddlrow task-row${task.state === 'done' ? ' done' : ''}`}
        menu={<PlanRowMenu title={task.title} keep={nameDraft(projectId, 'task', task.id)} onDelete={onDelete} />}
      >
        <TaskScheduleField mode="date" task={task} onSave={onSave} className="task-date-part" stopRowActivation />
        <TaskScheduleField mode="time" task={task} onSave={onSave} className="task-clock-part" stopRowActivation />
        <PriorityPicker
          value={task.priority} className={tagClass(PRIORITY_STATE[task.priority], 'label', 'plan-priority')}
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
      </Item>
    </Toolbar>
  )
}

function MilestoneRow({ projectId, milestone, onHover, onSave, onDelete }: {
  projectId: string
  milestone: Milestone
  onHover: (milestoneId: string | null) => void
  onSave: (patch: Partial<Pick<Milestone, 'date' | 'title' | 'done'>>) => Promise<boolean>
  onDelete: () => void
}) {
  const m = useMessages()
  return (
    <Item
      subgrid data-row={milestone.id}
      className={`ddlrow milestone-row${milestone.done ? ' done' : ''}`}
      onMouseEnter={() => onHover(milestone.id)} onMouseLeave={() => onHover(null)}
      menu={<PlanRowMenu title={milestone.title} keep={nameDraft(projectId, 'milestone', milestone.id)} onDelete={onDelete} />}
    >
      <DateButton
        iso={milestone.date} className="plan-cell plan-date-button"
        onPick={(date) => { void onSave({ date }) }}
      >
        <DateChip date={milestone.date} className="plan-date" />
      </DateButton>
      <MilestoneStatePicker done={milestone.done} onPick={(done) => { void onSave({ done }) }} />
      <PlanNameCell
        value={milestone.title} label={m.project.plan.milestoneNamePlaceholder}
        keep={nameDraft(projectId, 'milestone', milestone.id)} onSave={(title) => onSave({ title })}
        rest={<FadeText>{milestone.title}</FadeText>}
      />
    </Item>
  )
}

/**
 * Complete research-plan editor. The host supplies persistence and timeline coordination while
 * this component owns task/milestone presentation, creation, and per-field editing behavior.
 */
export function ProjectPlan({
  projectId, project, tab, today, creating, flashId, selectedTaskId,
  listRef, draftRef, addRef, timelineAddRef,
  onTab, onReselectTab, onDiscardOpenEdits, onStartTask, onStartMilestone, onCreating, onCancelCreate,
  onCreateTask, onCreateMilestone, onUpdateTask, onDeleteTask, onReorderTasks, onOpenTask,
  onUpdateMilestone, onDeleteMilestone, onHoverMilestone,
}: {
  /** The project the plan is of, whose name edits are kept with its tasks and milestones. */
  projectId: string
  project: Pick<Project, 'tasks' | 'milestones'>
  tab: PlanTab
  today: string
  creating: PlanCreating | null
  /** The task or milestone being located, which shows, its archive group unfolded, while it flashes. */
  flashId: string | null
  /** The task whose detail panel is currently open, so its row can show as selected. */
  selectedTaskId: string | null
  listRef: RefObject<HTMLDivElement | null>
  /** The draft slot of the new row, which the plan's add controls put the caret back in. */
  draftRef: RefObject<HTMLElement | null>
  addRef: RefObject<HTMLButtonElement | null>
  timelineAddRef: RefObject<HTMLButtonElement | null>
  onTab: (tab: PlanTab) => void
  /** Called when the current tab is picked again. */
  onReselectTab: () => void
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
    taskIds, (id) => (taskDoneById.get(id) ? 'done' : 'active'), (order) => onReorderTasks(order), { axis: 'y', handle: 'row' },
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
        onChange={(value) => { onTab(value); onDiscardOpenEdits() }} onReselect={onReselectTab}
        actions={(
          <AddAction
            size="compact" ref={addRef}
            label={tab === 'ms' ? m.project.plan.addMilestone : m.project.plan.addTask}
            onClick={() => (tab === 'ms' ? onStartMilestone(today) : onStartTask())}
          >{tab === 'ms' ? m.project.plan.milestoneMode : m.project.plan.taskMode}</AddAction>
        )}
        tabs={[
          {
            value: 'task', label: m.project.plan.taskMode,
            content: project.tasks.length === 0 && creating?.kind !== 'task' ? null : (
              <List id="taskList" variant="embedded">
                {creating?.kind === 'task'
                  ? (
                    <TaskCreateRow
                      row={draftRef} draft={creating.draft} onDraft={(draft) => onCreating({ kind: 'task', draft })}
                      triggers={[addRef, timelineAddRef]}
                      onCancel={onCancelCreate} onSave={onCreateTask}
                    />
                  )
                  : null}
                {activeTasks.map((task) => (
                  <TaskRow
                    projectId={projectId}
                    key={task.id} task={task} selected={selectedTaskId === task.id}
                    reorder={taskOrder.itemProps(task.id)}
                    onSave={(patch) => onUpdateTask(task.id, patch)}
                    onDelete={() => onDeleteTask(task.id)}
                    onOpen={() => onOpenTask(task.id)}
                  />
                ))}
                {archivedTasks.length === 0
                  ? null
                  : (
                    <Group
                      title={m.common.archived} count={archivedTasks.length}
                      fold={{ open: taskArchiveShown, onToggle: () => setTaskArchiveOpen((open) => !open) }}
                    >
                      {archivedTasks.map((task) => (
                        <TaskRow
                          projectId={projectId}
                          key={task.id} task={task}
                          selected={selectedTaskId === task.id}
                          onSave={(patch) => onUpdateTask(task.id, patch)}
                          onDelete={() => onDeleteTask(task.id)}
                          onOpen={() => onOpenTask(task.id)}
                        />
                      ))}
                    </Group>
                  )}
              </List>
            ),
          },
          {
            value: 'ms', label: m.project.plan.milestoneMode,
            content: project.milestones.length === 0 && creating?.kind !== 'ms' ? null : (
              <List id="msList" variant="embedded">
                {activeMilestones.map((milestone) => (
                  <MilestoneRow
                    projectId={projectId}
                    key={milestone.id} milestone={milestone}
                    onHover={onHoverMilestone}
                    onSave={(patch) => onUpdateMilestone(milestone.id, patch)}
                    onDelete={() => onDeleteMilestone(milestone.id)}
                  />
                ))}
                {creating?.kind === 'ms'
                  ? (
                    <MilestoneCreateRow
                      row={draftRef} draft={creating.draft} onDraft={(draft) => onCreating({ kind: 'ms', draft })}
                      triggers={[addRef, timelineAddRef]}
                      onCancel={onCancelCreate} onSave={onCreateMilestone}
                    />
                  )
                  : null}
                {archivedMilestones.length === 0
                  ? null
                  : (
                    <Group
                      title={m.common.archived} count={archivedMilestones.length}
                      fold={{ open: msArchiveShown, onToggle: () => setMsArchiveOpen((open) => !open) }}
                    >
                      {archivedMilestones.map((milestone) => (
                        <MilestoneRow
                          projectId={projectId}
                          key={milestone.id} milestone={milestone}
                          onHover={onHoverMilestone}
                          onSave={(patch) => onUpdateMilestone(milestone.id, patch)}
                          onDelete={() => onDeleteMilestone(milestone.id)}
                        />
                      ))}
                    </Group>
                  )}
              </List>
            ),
          },
        ]}
      />
    </section>
  )
}
