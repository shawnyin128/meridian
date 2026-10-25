import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Task } from '../../shared/contract.js'
import { useToday } from '../shell/AppShell.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import { ActionMenu, MenuRadioGroup, MenuRadioItem } from './ActionMenu.js'
import { ActionPopover, PopoverClose } from './ActionPopover.js'
import { FormButton } from './FormControls.js'
import { IconButton } from './IconButton.js'
import { IconChevron, IconDots, IconNext, IconPrevious } from './icons.js'
import { ToggleGroup, ToggleItem, useToolbarItem } from './Toolbar.js'
import { FadeText } from './FadeText.js'
import { Button } from './Button.js'
import './FieldPickers.css'

const PRIORITIES: Task['priority'][] = ['p0', 'p1', 'p2']

/**
 * The one overflow-menu trigger, named and tooltipped by `label`, which says which object the menu
 * belongs to, or by the shared "more actions" label without one. `stopRowActivation` keeps the click
 * off a clickable row or card underneath. It goes in its row's `RowActions` slot, which shows it.
 * `onCloseAutoFocus` runs once the closed menu is about to hand focus back to its trigger; preventing
 * it leaves focus to an editor an item opens in place.
 */
export function DotsMenu({
  children, label, stopRowActivation = false, open, onOpenChange, contentClassName, onCloseAutoFocus,
}: {
  children: ReactNode
  /** The name, e.g. naming which idea or chat the menu manages. Falls back to the shared "more actions" label when omitted. */
  label?: string
  /** Pass true when the row or card itself is clickable, so the trigger swallows the click instead of bubbling it. */
  stopRowActivation?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  contentClassName?: string
  onCloseAutoFocus?: (event: Event) => void
}) {
  const m = useMessages()
  return (
    <ActionMenu
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(contentClassName === undefined ? {} : { contentClassName })}
      {...(onCloseAutoFocus === undefined ? {} : { contentProps: { onCloseAutoFocus } })}
      stopContentClickPropagation
      trigger={(
        <IconButton
          label={label ?? m.common.menu.more} size="nested" className="dots"
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
      {...(appearance === 'field' ? { contentClassName: 'ctxmenu choice-picker-menu', scrolls: true } : {})}
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

function Calendar({ selected, onPick }: { selected: string; onPick: (iso: string) => void }) {
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
 * Shared calendar trigger for the ISO date `iso`. With `appearance="field"` it is the boxed field of a
 * form, as ChoicePicker's is, showing the date; otherwise consumers control only the trigger's class
 * and its content, which defaults to the date.
 */
export function DateButton({ iso, className, appearance, onPick, children }: {
  iso: string
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
      <Calendar selected={iso} onPick={onPick} />
    </ActionPopover>
  )
}
