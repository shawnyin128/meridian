import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode, Ref } from 'react'
import { Toolbar, useToolbarItem } from './Toolbar.js'
import './Item.css'

/**
 * Keeps the second press of a double-click on an item that opens something from selecting a word:
 * the item is a control, not prose. A first press, and so a drag, still selects; a field or an editor
 * in the item keeps its own selection.
 */
export function holdRepeatSelection(event: ReactMouseEvent) {
  if (event.detail < 2) return
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]') !== null) return
  event.preventDefault()
}

/**
 * The slot at an item's end for the actions on that item: neutral ghost glyphs (`IconButton`s, a
 * destructive one with `tone="danger"`, and `DotsMenu`) that show only while the item is hovered or
 * holds focus, or while one of their menus or dialogs is open. Any element marked `data-row-actions`
 * hosts the slot; every `Item` but a button row marks itself. The slot is a toolbar: one Tab stop with
 * the arrow keys between its actions, which join the item's own toolbar if it has one.
 */
export function RowActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Toolbar><span className={`row-actions${className ? ` ${className}` : ''}`}>{children}</span></Toolbar>
}

/** Whether a slot has content: React renders nothing for undefined, null and false. */
const shown = (content: ReactNode) => content !== undefined && content !== null && content !== false

type ItemProps = {
  /** `row` is a line of a List; `card` is a bordered item of its own. Both start their content at `--item-inset`. */
  density?: 'row' | 'card'
  /** In a row, `2` puts the meta line under the title instead of after it; a card always does. */
  lines?: 1 | 2
  /** A mark before the title: a status dot, an icon. */
  leading?: ReactNode
  /** The item's name, in the item-title type; in a card or a two-line row, in the title weight. */
  title?: ReactNode
  /** The secondary line, in the meta type. */
  meta?: ReactNode
  /** The item's tags, after its title. */
  tags?: ReactNode
  /** A date, a value or a control at the item's end, before its actions. */
  trailing?: ReactNode
  /** The actions of the item's row-actions slot. */
  actions?: ReactNode
  /** The item's overflow menu (`DotsMenu`), the last control of its row-actions slot. */
  menu?: ReactNode
  /** A row's own cells after its title, or a card's body under its head line. */
  children?: ReactNode
  className?: string
  /** The grid columns of a row that lays its cells out itself. */
  columns?: string
  /** An item that holds controls of its own: a div that forwards a pointer click anywhere else on it to `onActivate`. */
  composite?: boolean
  /** The item whose detail is open beside the list. */
  selected?: boolean
  /** An archived card, on the page's own fill. */
  muted?: boolean
  onActivate?: () => void
  /** The DOM element of an item that is not a button row. */
  elementRef?: Ref<HTMLElement>
  style?: CSSProperties
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'style' | 'onClick' | 'title'>

/**
 * One list item, the one shell of every row and card: its inset, edge, type, hover, selected, drop
 * and open looks, and its slots, in the order leading, title with meta, own cells, tags, trailing and
 * the row-actions slot with the overflow menu last. A row with `onActivate` is a button; a `composite`
 * row and an actionable card hold controls of their own and must include the keyboard control for
 * the same action (`ItemOpen` around the name). A double-click on an actionable item selects no text
 * (`holdRepeatSelection`); an `onMouseDown` given to a composite item, as a toolbar that wraps it
 * gives, runs after that.
 */
export function Item({
  density = 'row', lines = 1, leading, title, meta, tags, trailing, actions, menu, children, className = '', columns,
  composite = false, selected = false, muted = false, onActivate, elementRef, style, ...props
}: ItemProps) {
  const card = density === 'card'
  const button = onActivate !== undefined && !composite && !card
  const slotted = [leading, title, meta, tags, trailing, actions, menu].some(shown)
  const classes = [
    'item', `item--${density}`, slotted ? 'item--slotted' : '', lines === 2 && !card ? 'item--two-line' : '',
    columns === undefined ? '' : 'item--columns',
    onActivate === undefined ? '' : 'item--actionable',
    selected ? 'item--selected' : '', muted ? 'item--muted' : '', className,
  ].filter(Boolean).join(' ')
  const itemStyle = columns === undefined ? style : { ...style, gridTemplateColumns: columns }
  const slot = (name: string, content: ReactNode) => (shown(content) ? <span className={`item-${name}`}>{content}</span> : null)
  const main = shown(title) || shown(meta) ? <span className="item-main">{slot('title', title)}{slot('meta', meta)}</span> : null
  const tail = shown(actions) || shown(menu) ? <RowActions className="item-actions">{actions}{menu}</RowActions> : null
  const content = card && slotted
    ? <><div className="item-head">{slot('leading', leading)}{main}{slot('tags', tags)}{slot('trailing', trailing)}{tail}</div>{children}</>
    : <>{slot('leading', leading)}{main}{children}{slot('tags', tags)}{slot('trailing', trailing)}{tail}</>
  if (button) {
    return (
      <button
        className={classes} style={itemStyle} type="button" onClick={onActivate} onMouseDown={holdRepeatSelection}
        {...props as ButtonHTMLAttributes<HTMLButtonElement>}
      >{content}</button>
    )
  }
  const { onMouseDown, ...rest } = props
  const Tag = card ? 'article' : 'div'
  return (
    <Tag
      ref={elementRef as Ref<HTMLDivElement>} className={classes} style={itemStyle} data-row-actions=""
      onClick={onActivate}
      onMouseDown={onActivate === undefined ? onMouseDown : (event) => { holdRepeatSelection(event); onMouseDown?.(event) }}
      {...rest as HTMLAttributes<HTMLDivElement>}
    >{content}</Tag>
  )
}

/**
 * The button around an actionable card's or composite row's name: the item's keyboard control, whose
 * click reaches the item, and one of the controls of the toolbar the item renders in. Other props and
 * the ref go to the button, so a tooltip can name it.
 */
export const ItemOpen = forwardRef<HTMLButtonElement, { children: ReactNode; className?: string }
  & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'type'>>(
  function ItemOpen({ children, className = '', ...props }, ref) {
    return useToolbarItem()(
      <button {...props} ref={ref} type="button" className={`item-open${className ? ` ${className}` : ''}`}>{children}</button>,
    )
  },
)
