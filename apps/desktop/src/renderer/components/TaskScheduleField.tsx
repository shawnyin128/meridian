import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Task, TaskPatch, TaskWindow } from '../../shared/contract.js'
import { TASK_SLOT_ENDS, TASK_SLOT_STARTS } from '../../shared/contract.js'
import { ActionPopover } from './ActionPopover.js'
import { DateChip } from './DateTimeDisplay.js'
import { ChoicePicker } from './FieldPickers.js'
import { FormInput } from './FormControls.js'
import { SegmentedControl } from './SegmentedControl.js'
import { useToolbarItem } from './Toolbar.js'
import { dnum } from '../../shared/dates.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import './TaskScheduleField.css'

export type ScheduleEditMode = 'date' | 'time'

/** One editor for the date range and the time window; `mode` only picks which fields this edit shows. */
export function TaskScheduleEditor({ mode, task, saving, onSave, onCancel }: {
  mode: ScheduleEditMode
  task: Task
  saving: boolean
  onSave: (patch: TaskPatch) => void
  onCancel: () => void
}) {
  const m = useMessages()
  const [start, setStart] = useState(task.start)
  const [end, setEnd] = useState(task.end)
  const [window, setWindow] = useState<TaskWindow | null>(task.window ?? null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (mode === 'date') {
      if (start === '' || end === '') return
      onSave({ start, end: dnum(end) < dnum(start) ? start : end })
      return
    }
    if (window !== null && window.end <= window.start) return
    onSave({ window })
  }

  return (
    <form className="schedule-form" onSubmit={submit}>
      {mode === 'date'
        ? (
          <>
            <label>{m.research.schedule.startLabel}
              <FormInput
                className="schedule-input" type="date" required value={start}
                onChange={(event) => {
                  const next = event.target.value
                  setStart(next)
                  if (next !== '' && end !== '' && dnum(end) < dnum(next)) setEnd(next)
                }}
              />
            </label>
            <label>{m.research.schedule.endLabel}
              <FormInput
                className="schedule-input" type="date" required min={start} value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </>
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
                    value={window.start} options={TASK_SLOT_STARTS}
                    onPick={(start) => setWindow((current) => current && ({ ...current, start }))}
                  />
                  <span>–</span>
                  <ChoicePicker
                    appearance="field" className="schedule-input" aria-label={m.research.schedule.endSlot}
                    value={window.end} options={TASK_SLOT_ENDS}
                    onPick={(end) => setWindow((current) => current && ({ ...current, end }))}
                  />
                </div>
              )}
          </>
        )}
      <div className="schedule-actions">
        <button className="btn" type="button" disabled={saving} onClick={onCancel}>{m.common.cancel}</button>
        <button className="btn pri" type="submit" disabled={saving}>{m.common.save}</button>
      </div>
    </form>
  )
}

/**
 * A separate date or time-window entry; both open TaskScheduleEditor but never edit together. Its
 * trigger is one of the controls of the toolbar it renders in.
 */
export function TaskScheduleField({ mode, task, onSave, className = '', stopRowActivation = false }: {
  mode: ScheduleEditMode
  task: Task
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
      contentClassName="ctxmenu schedule-pop" side="bottom" align="start" sideOffset={4}
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
