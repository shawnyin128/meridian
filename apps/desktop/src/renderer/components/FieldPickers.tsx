import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Task } from '../../shared/contract.js'
import { dnum } from '../../shared/dates.js'
import { useToday } from '../shell/AppShell.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import { ActionMenu, MenuRadioGroup, MenuRadioItem, type MenuSurface } from './ActionMenu.js'
import { ActionPopover, PopoverClose } from './ActionPopover.js'
import { FormButton } from './FormControls.js'
import { IconButton } from './IconButton.js'
import { IconChevron, IconDots, IconNext, IconPrevious } from './icons.js'
import { ToggleGroup, ToggleItem, useToolbarItem } from './Toolbar.js'
import { FadeText } from './FadeText.js'
import { typesText } from '../lib/keyboard.js'
import { Button } from './Button.js'
import './FieldPickers.css'
import './InlineField.css'

const PRIORITIES: Task['priority'][] = ['p0', 'p1', 'p2']

/** Where a menu opened by a right-click sits: its top-left corner at the pointer, from the trigger's bottom-left. */
type PointerPlace = { sideOffset: number; alignOffset: number }

/**
 * The one overflow-menu trigger, named and tooltipped by `label`, which says which object the menu
 * belongs to, or by the shared "more actions" label without one. `stopRowActivation` keeps the click
 * off a clickable row or card underneath. It goes in its row's `RowActions` slot, which shows it.
 * The same menu opens on a right-click anywhere on the row or card that hosts the slot (the nearest
 * element marked `data-row-actions`: an `Item` holding it in its `menu` slot, or a row hosting
 * `RowActions`), at the pointer, and on the ContextMenu key or Shift+F10 there,
 * at the trigger; a right-click in a text field or on selected text keeps the system's edit menu, and
 * a row inside another opens only its own menu.
 * `onCloseAutoFocus` runs once the closed menu is about to hand focus back to its trigger; preventing
 * it leaves focus to an editor an item opens in place.
 */
export function DotsMenu({
  children, label, stopRowActivation = false, open, onOpenChange, surface, onCloseAutoFocus,
}: {
  children: ReactNode
  /** The name, e.g. naming which idea or chat the menu manages. Falls back to the shared "more actions" label when omitted. */
  label?: string
  /** Pass true when the row or card itself is clickable, so the trigger swallows the click instead of bubbling it. */
  stopRowActivation?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  surface?: MenuSurface
  onCloseAutoFocus?: (event: Event) => void
}) {
  const m = useMessages()
  const [own, setOwn] = useState(false)
  const [place, setPlace] = useState<PointerPlace | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const change = (next: boolean) => {
    if (open === undefined) setOwn(next)
    onOpenChange?.(next)
  }
  const changeNow = useRef(change)
  changeNow.current = change
  useEffect(() => {
    const button = trigger.current
    const host = button === null ? null : button.closest<HTMLElement>('[data-row-actions]')
    if (button === null || host === null) return
    const pointer = (event: MouseEvent) => {
      const selection = window.getSelection()
      const selected = selection !== null && !selection.isCollapsed && event.target instanceof Node
        && selection.getRangeAt(0).intersectsNode(event.target)
      if (event.defaultPrevented || typesText(event.target) || selected) return
      event.preventDefault()
      const anchor = button.getBoundingClientRect()
      setPlace({ sideOffset: event.clientY - anchor.bottom, alignOffset: event.clientX - anchor.left })
      changeNow.current(true)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
      if (event.defaultPrevented || typesText(event.target)) return
      event.preventDefault()
      setPlace(null)
      changeNow.current(true)
    }
    host.addEventListener('contextmenu', pointer)
    host.addEventListener('keydown', key)
    return () => {
      host.removeEventListener('contextmenu', pointer)
      host.removeEventListener('keydown', key)
    }
  }, [])
  return (
    <ActionMenu
      open={open ?? own}
      onOpenChange={(next) => {
        if (next) setPlace(null)
        change(next)
      }}
      {...(place === null ? {} : { align: 'start' as const, ...place })}
      {...(surface === undefined ? {} : { surface })}
      {...(onCloseAutoFocus === undefined ? {} : { contentProps: { onCloseAutoFocus } })}
      stopContentClickPropagation
      trigger={(
        <IconButton
          ref={trigger} label={label ?? m.common.menu.more} size="nested" className="dots"
          onClick={stopRowActivation ? (e) => e.stopPropagation() : undefined}
        ><IconDots /></IconButton>
      )}
    >{children}</ActionMenu>
  )
}

/**
 * The one single-value picker: a menu of `options` with the picked one marked. With
 * `appearance="field"` it is the boxed field of a form, showing the picked option's label, or
 * `placeholder` while `value` matches no option, and with the refused look of a field while
 * `aria-invalid` holds. With `appearance="button"` its trigger is a compact Button showing
 * `children`, for a heading's actions. Otherwise the host field supplies the trigger's class, and its
 * content as `children`, which defaults to the picked option's label. Outside the field appearance
 * the trigger is one of the controls of the toolbar it renders in.
 */
export function ChoicePicker<T extends string>({
  value, options, onPick, label = (option) => option, className, appearance, placeholder = '',
  disabled = false, 'aria-label': ariaLabel, 'aria-invalid': invalid, stopRowActivation = false, children,
}: {
  value: T
  options: readonly T[]
  onPick: (next: T) => void
  label?: (option: T) => string
  className?: string
  appearance?: 'field' | 'button'
  placeholder?: string
  disabled?: boolean
  'aria-label'?: string
  'aria-invalid'?: true | undefined
  /** Pass true when the row or card itself is clickable, so the trigger swallows the click instead of bubbling it. */
  stopRowActivation?: boolean
  children?: ReactNode
}) {
  const asItem = useToolbarItem()
  const picked = options.includes(value) ? label(value) : placeholder
  const trigger = appearance === 'field'
    ? (
      <FormButton
        className={`choice-picker${className ? ` ${className}` : ''}`} aria-label={ariaLabel} aria-invalid={invalid}
        disabled={disabled}
      >
        <FadeText className="choice-picker-value" label={picked}>{picked}</FadeText>
        <IconChevron />
      </FormButton>
    )
    : appearance === 'button'
      ? (
        <Button
          size="compact" className={className} aria-label={ariaLabel} disabled={disabled}
          onClick={stopRowActivation ? (e) => e.stopPropagation() : undefined}
        >{children ?? label(value)}</Button>
      )
      : asItem(
        <button
          className={className ?? 'pv metadata-editable'} aria-label={ariaLabel}
          disabled={disabled} onClick={stopRowActivation ? (e) => e.stopPropagation() : undefined}
        >{children ?? label(value)}</button>,
      )
  return (
    <ActionMenu
      align="start" trigger={trigger} stopContentClickPropagation={stopRowActivation}
      {...(appearance === 'field' ? { contentClassName: 'choice-picker-menu', scrolls: true } : {})}
    >
      <MenuRadioGroup value={value}>
        {options.map((option) => (
          <MenuRadioItem key={option} value={option} onSelect={() => onPick(option)}>
            {label(option)}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ActionMenu>
  )
}

/** Priority picker shared by plan rows and project metadata; its trigger is one of the controls of the toolbar it renders in. */
export function PriorityPicker({ value, className, onPick, children, stopRowActivation = false }: {
  value: Task['priority']
  className: string
  onPick: (next: Task['priority']) => void
  children: ReactNode
  /** Pass true when the row or card itself is clickable, so the trigger swallows the click instead of bubbling it. */
  stopRowActivation?: boolean
}) {
  const m = useMessages()
  const asItem = useToolbarItem()
  const priorityNote = (option: Task['priority']) => ` · ${m.common.priority[option]}`
  return (
    <ActionMenu
      align="start"
      trigger={asItem(
        <button className={className} onClick={stopRowActivation ? (e) => e.stopPropagation() : undefined}>
          {children}
        </button>,
      )}
    >
      <MenuRadioGroup value={value}>
        {PRIORITIES.map((priority) => (
          <MenuRadioItem key={priority} value={priority} onSelect={() => onPick(priority)}>
            {priority.toUpperCase()}{priorityNote(priority)}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ActionMenu>
  )
}

/** A month of days to pick `selected` from; days before `min`, when given, cannot be picked. */
function Calendar({ selected, min, onPick }: { selected: string; min: string | undefined; onPick: (iso: string) => void }) {
  const m = useMessages()
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
        <IconButton label={m.common.calendar.previous} size="nested" onClick={() => shift(-1)}><IconPrevious /></IconButton>
        <b>{fmt.monthYear(`${ym.y}-${String(ym.m).padStart(2, '0')}-01`)}</b>
        <IconButton label={m.common.calendar.next} size="nested" onClick={() => shift(1)}><IconNext /></IconButton>
      </div>
      <ToggleGroup
        label={fmt.monthYear(`${ym.y}-${String(ym.m).padStart(2, '0')}-01`)} className="calg" value={selected}
        onValueChange={(iso) => { if (iso !== '') onPick(iso) }}
      >
        {[...Array(7)].map((_, weekday) => (
          <span className="cw" key={weekday}>{fmt.weekdayShort(weekday)}</span>
        ))}
        {[...Array(first)].map((_, index) => <span className="cd off" key={`off${index}`} />)}
        {[...Array(daysInMonth)].map((_, index) => {
          const iso = `${ym.y}-${String(ym.m).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
          return (
            <ToggleItem
              asChild key={iso} value={iso} aria-label={fmt.date(iso)} aria-current={iso === today ? 'date' : undefined}
              disabled={min !== undefined && dnum(iso) < dnum(min)}
            >
              <PopoverClose className={`cd${iso === today ? ' today' : ''}${iso === selected ? ' sel' : ''}`}>{index + 1}</PopoverClose>
            </ToggleItem>
          )
        })}
      </ToggleGroup>
    </>
  )
}

/**
 * Shared calendar trigger for the ISO date `iso`; days before `min`, when given, cannot be picked.
 * With `appearance="field"` it is the boxed field of a form, as ChoicePicker's is, showing the date;
 * otherwise consumers control only the trigger's class and its content, which defaults to the date.
 */
export function DateButton({ iso, min, className, appearance, onPick, children }: {
  iso: string
  min?: string
  className?: string
  appearance?: 'field'
  onPick: (next: string) => void
  children?: ReactNode
}) {
  const fmt = useFormat()
  const shown = children ?? fmt.date(iso)
  return (
    <ActionPopover
      align="start"
      trigger={appearance === 'field'
        ? (
          <FormButton className={`choice-picker${className ? ` ${className}` : ''}`}>
            <FadeText className="choice-picker-value">{shown}</FadeText>
            <IconChevron />
          </FormButton>
        )
        : <button className={className}>{shown}</button>}
    >
      <Calendar selected={iso} min={min} onPick={onPick} />
    </ActionPopover>
  )
}

/** A date range of ISO dates; `start` is never after `end`. */
export type DateRange = { start: string; end: string }

/**
 * The one date range field: its start and its end, each a DateButton on the one calendar, under one
 * rule for the end before the start: the end's calendar starts at the start, and a start picked after
 * the end takes the end along to it. `onChange` receives each new range. `children` lays out the two
 * triggers, given as `start` and `end`; `className` and `appearance` dress both as DateButton's do.
 */
export function DateRangeField({ start, end, onChange, className, appearance, children }: DateRange & {
  onChange: (range: DateRange) => void
  className?: string
  appearance?: 'field'
  children: (start: ReactNode, end: ReactNode) => ReactNode
}) {
  const dressed = { ...(className === undefined ? {} : { className }), ...(appearance === undefined ? {} : { appearance }) }
  return children(
    <DateButton {...dressed} iso={start} onPick={(next) => onChange({ start: next, end: dnum(end) < dnum(next) ? next : end })} />,
    <DateButton {...dressed} iso={end} min={start} onPick={(next) => onChange({ start, end: next })} />,
  )
}
