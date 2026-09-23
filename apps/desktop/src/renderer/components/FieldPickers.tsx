import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Task } from '../../shared/contract.js'
import { useToday } from '../shell/AppShell.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import { ActionMenu, MenuRadioGroup, MenuRadioItem } from './ActionMenu.js'
import { ActionPopover, PopoverClose } from './ActionPopover.js'
import { IconDots } from './icons.js'
import './FieldPickers.css'

const PRIORITIES: Task['priority'][] = ['p0', 'p1', 'p2']

/**
 * The one overflow-menu trigger. The tooltip is always the shared "more actions" label; `label`
 * adds the screen-reader name for rows that need to say which object the menu belongs to.
 * `stopRowActivation` keeps the click off a clickable row or card underneath.
 */
export function DotsMenu({
  children, label, stopRowActivation = false, open, onOpenChange, contentClassName,
}: {
  children: ReactNode
  /** The screen-reader name, e.g. naming which idea or chat the menu manages. Falls back to the bare tooltip when omitted. */
  label?: string
  /** Pass true when the row or card itself is clickable, so the trigger swallows the click instead of bubbling it. */
  stopRowActivation?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  contentClassName?: string
}) {
  const m = useMessages()
  return (
    <ActionMenu
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(contentClassName === undefined ? {} : { contentClassName })}
      stopContentClickPropagation
      trigger={(
        <button
          type="button" className="dots" title={m.common.menu.more} aria-label={label}
          onClick={stopRowActivation ? (e) => e.stopPropagation() : undefined}
        ><IconDots /></button>
      )}
    >{children}</ActionMenu>
  )
}

/** A single-value picker whose trigger appearance is supplied by the host field. */
export function ChoicePicker<T extends string>({
  value, options, onPick, label = (option) => option, className = 'pv metadata-editable',
  stopRowActivation = false,
}: {
  value: T
  options: readonly T[]
  onPick: (next: T) => void
  label?: (option: T) => string
  className?: string
  /** Pass true when the row or card itself is clickable, so the trigger swallows the click instead of bubbling it. */
  stopRowActivation?: boolean
}) {
  const m = useMessages()
  return (
    <ActionMenu
      align="start"
      trigger={(
        <button
          className={className} title={m.common.field.clickToEdit}
          onClick={stopRowActivation ? (e) => e.stopPropagation() : undefined}
        >{label(value)}</button>
      )}
    >
      <MenuRadioGroup value={value}>
        {options.map((option) => (
          <MenuRadioItem
            className={option === value ? 'mi on' : 'mi'} key={option} value={option}
            onSelect={() => onPick(option)}
          >
            {label(option)}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ActionMenu>
  )
}

/** Priority picker shared by plan rows and project metadata. */
export function PriorityPicker({ value, className, title, onPick, children, stopRowActivation = false }: {
  value: Task['priority']
  className: string
  title: string
  onPick: (next: Task['priority']) => void
  children: ReactNode
  /** Pass true when the row or card itself is clickable, so the trigger swallows the click instead of bubbling it. */
  stopRowActivation?: boolean
}) {
  const m = useMessages()
  const priorityNote = (option: Task['priority']) => ` · ${m.common.priority[option]}`
  return (
    <ActionMenu
      align="start"
      trigger={(
        <button
          className={className} title={title}
          onClick={stopRowActivation ? (e) => e.stopPropagation() : undefined}
        >{children}</button>
      )}
    >
      <MenuRadioGroup value={value}>
        {PRIORITIES.map((priority) => (
          <MenuRadioItem
            className={priority === value ? 'mi on' : 'mi'} key={priority} value={priority}
            onSelect={() => onPick(priority)}
          >
            {priority.toUpperCase()}{priorityNote(priority)}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ActionMenu>
  )
}

function Calendar({ selected, onPick }: { selected: string; onPick: (iso: string) => void }) {
  const today = useToday()
  const fmt = useFormat()
  const [ym, setYm] = useState({ y: Number(selected.slice(0, 4)), m: Number(selected.slice(5, 7)) })
  const first = new Date(Date.UTC(ym.y, ym.m - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate()
  const shift = (delta: number) => setYm(({ y, m }) => {
    const nextMonth = m + delta
    return {
      y: y + Math.floor((nextMonth - 1) / 12),
      m: ((nextMonth - 1) % 12 + 12) % 12 + 1,
    }
  })

  return (
    <>
      <div className="calh">
        <button className="cnav" onClick={() => shift(-1)}>‹</button>
        <b>{fmt.monthYear(`${ym.y}-${String(ym.m).padStart(2, '0')}-01`)}</b>
        <button className="cnav" onClick={() => shift(1)}>›</button>
      </div>
      <div className="calg">
        {[...Array(7)].map((_, weekday) => (
          <span className="cw" key={weekday}>{fmt.weekdayShort(weekday)}</span>
        ))}
        {[...Array(first)].map((_, index) => <span className="cd off" key={`off${index}`} />)}
        {[...Array(daysInMonth)].map((_, index) => {
          const iso = `${ym.y}-${String(ym.m).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
          return (
            <PopoverClose
              className={`cd${iso === today ? ' today' : ''}${iso === selected ? ' sel' : ''}`}
              key={iso} onClick={() => onPick(iso)}
            >{index + 1}</PopoverClose>
          )
        })}
      </div>
    </>
  )
}

/** Shared calendar trigger. Consumers control only the trigger presentation and selected ISO date. */
export function DateButton({ iso, className, title, onPick, children }: {
  iso: string
  className: string
  title: string
  onPick: (next: string) => void
  children?: ReactNode
}) {
  const fmt = useFormat()
  return (
    <ActionPopover
      align="start"
      trigger={<button className={className} title={title}>{children ?? fmt.date(iso)}</button>}
    >
      <Calendar selected={iso} onPick={onPick} />
    </ActionPopover>
  )
}
