import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Task, TaskPatch, TaskWindow } from '../../shared/contract.js'
import { TASK_SLOT_ENDS, TASK_SLOT_STARTS } from '../../shared/contract.js'
import { ActionPopover } from './ActionPopover.js'
import { DateChip } from './DateTimeDisplay.js'
import { ChoicePicker, DateRangeField } from './FieldPickers.js'
import { FieldRow, FieldRows } from './FormControls.js'
import { SegmentedControl } from './SegmentedControl.js'
import { useToolbarItem } from './Toolbar.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import { CommitActions } from './CommitActions.js'
import './TaskScheduleField.css'

export type ScheduleEditMode = 'date' | 'time'

/** The schedule of a task, saved or still drafted: its date range and its time window, if it has one. */
export type TaskSchedule = Pick<Task, 'start' | 'end'> & { window?: TaskWindow | null | undefined }

/** The slot that ends two hours after `start`, and the slot that starts two hours before `end`. */
const endAfter = (start: TaskWindow['start']): TaskWindow['end'] => TASK_SLOT_ENDS[TASK_SLOT_STARTS.indexOf(start)]!
const startBefore = (end: TaskWindow['end']): TaskWindow['start'] => TASK_SLOT_STARTS[TASK_SLOT_ENDS.indexOf(end)]!

/**
 * `window` on a task of `start` to `end`, after its `part` bound was picked: on a one-day task a window
 * never ends before it starts, so the other bound moves to one slot past the picked one; across days
 * the start falls on the first day and the end on the last, in any order.
 */
function windowAfter(window: TaskWindow, start: string, end: string, part: 'start' | 'end'): TaskWindow {
  if (start !== end || window.end > window.start) return window
  return part === 'start' ? { start: window.start, end: endAfter(window.start) } : { start: startBefore(window.end), end: window.end }
}

/**
 * One editor for the date range and the time window; `mode` only picks which fields this edit shows.
 * A date range that turns a task into a one-day task whose window ends before it starts saves the
 * window with it, moved one slot past the bound of the day picked last.
 */
export function TaskScheduleEditor({ mode, task, saving, onSave, onCancel }: {
  mode: ScheduleEditMode
  task: TaskSchedule
  saving: boolean
  onSave: (patch: TaskPatch) => void
  onCancel: () => void
}) {
  const m = useMessages()
  const [start, setStart] = useState(task.start)
  const [end, setEnd] = useState(task.end)
  const [window, setWindow] = useState<TaskWindow | null>(task.window ?? null)
  const [picked, setPicked] = useState<'start' | 'end'>('start')
  const pickSlot = (part: 'start' | 'end', slot: string) => setWindow((current) => current
    && windowAfter({ ...current, [part]: slot } as TaskWindow, start, end, part))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (mode === 'date') {
      const kept = task.window ? windowAfter(task.window, start, end, picked) : undefined
      onSave(kept === undefined || kept === task.window ? { start, end } : { start, end, window: kept })
      return
    }
    onSave({ window })
  }

  return (
    <form className="schedule-form" onSubmit={submit}>
      {mode === 'date'
        ? (
          <DateRangeField
            appearance="field" start={start} end={end}
            onChange={(range) => {
              setPicked(range.start === start ? 'end' : 'start')
              setStart(range.start)
              setEnd(range.end)
            }}
          >
            {(startField, endField) => (
              <FieldRows>
                <FieldRow label={m.research.schedule.startLabel}>{startField}</FieldRow>
                <FieldRow label={m.research.schedule.endLabel}>{endField}</FieldRow>
              </FieldRows>
            )}
          </DateRangeField>
        )
        : (
          <>
            <SegmentedControl
              className="schedule-mode"
              label={m.research.schedule.modeLabel}
              value={window === null ? 'allday' : 'window'}
              options={[
                { value: 'allday', label: m.project.plan.windowMode.allDay },
                { value: 'window', label: m.project.plan.windowMode.timed },
              ]}
              onChange={(value) => {
                if (value === 'allday') { setWindow(null); return }
                setWindow((current) => current ?? { start: '10:00', end: '12:00' })
              }}
            />
            {window === null
              ? null
              : (
                <div className="schedule-window">
                  <ChoicePicker
                    appearance="field" className="schedule-input" aria-label={m.research.schedule.startSlot}
                    value={window.start} options={TASK_SLOT_STARTS} onPick={(slot) => pickSlot('start', slot)}
                  />
                  <span>–</span>
                  <ChoicePicker
                    appearance="field" className="schedule-input" aria-label={m.research.schedule.endSlot}
                    value={window.end} options={TASK_SLOT_ENDS} onPick={(slot) => pickSlot('end', slot)}
                  />
                </div>
              )}
          </>
        )}
      <div className="schedule-actions">
        <CommitActions place="foot" onCancel={onCancel} saving={saving} />
      </div>
    </form>
  )
}

/**
 * A separate date or time-window entry of a saved or a drafted task; both open TaskScheduleEditor but
 * never edit together. Its trigger is one of the controls of the toolbar it renders in.
 */
export function TaskScheduleField({ mode, task, onSave, className = '', stopRowActivation = false }: {
  mode: ScheduleEditMode
  task: TaskSchedule
  onSave: (patch: TaskPatch) => Promise<boolean>
  className?: string
  /** Pass true when the row or card itself is clickable, so the trigger swallows the click instead of bubbling it. */
  stopRowActivation?: boolean
}) {
  const fmt = useFormat()
  const m = useMessages()
  const asItem = useToolbarItem()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const label = mode === 'date'
    ? fmt.dateRange(task.start, task.end)
    : task.window ? `${task.window.start}–${task.window.end}` : m.project.plan.windowMode.allDay

  const save = async (patch: TaskPatch) => {
    setSaving(true)
    try {
      if (await onSave(patch)) setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ActionPopover
      open={open} onOpenChange={(next) => { if (!saving || next) setOpen(next) }}
      trigger={asItem(
        <button
          type="button" className={`schedule-trigger${className ? ` ${className}` : ''}`}
          onClick={stopRowActivation ? (e) => e.stopPropagation() : undefined}
        ><DateChip>{label}</DateChip></button>,
      )}
      surface="form" contentClassName="schedule-pop" side="bottom" align="start" sideOffset={4}
      contentProps={{ onEscapeKeyDown: (event) => { if (saving) event.preventDefault() } }}
    >
      {open
        ? (
          <TaskScheduleEditor
            key={`${mode}/${task.start}/${task.end}/${task.window?.start ?? 'all'}/${task.window?.end ?? 'day'}`}
            mode={mode} task={task} saving={saving} onSave={(patch) => { void save(patch) }}
            onCancel={() => { if (!saving) setOpen(false) }}
          />
        )
        : null}
    </ActionPopover>
  )
}
