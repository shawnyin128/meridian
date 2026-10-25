import { createContext, forwardRef, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  ButtonHTMLAttributes, HTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode, TdHTMLAttributes, ThHTMLAttributes,
} from 'react'
import type { SortDirection } from '../../shared/contract.js'
import { useRowCap } from '../hooks/useRowCap.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { useMessages } from '../messages/useMessages.js'
import { CountBadge } from './CountBadge.js'
import { Grip, type GripLimits } from './Grip.js'
import { RowActions } from './Item.js'
import { EMBEDDED_LIST_ROW_LIMIT } from './List.js'
import { useToolbarItem } from './Toolbar.js'
import { Tooltip } from './Tooltip.js'
import './Table.css'

/** The width of the actions column at a table's end: two nested 24px buttons in its header cell. */
const ACTIONS_WIDTH = 52
/** The width of a column being created. */
const DRAFT_WIDTH = 140
/** The least width a drag gives a column; the window can still shrink the table further. */
const MIN_WIDTH = 56

const ARROW_PATH: Record<SortDirection, string> = { asc: 'M6 15l6-6 6 6', desc: 'M6 9l6 6 6-6' }

/** One column of a Table. */
export type TableColumn = {
  /** Identity of the column, also the key of its width. */
  key: string
  /** What its header cell shows. */
  label: ReactNode
  /** The column's name where a control names it, as its resize grip does; `label` when that is text. */
  name?: string | undefined
  /** The width it starts at, and that a double-click on its grip restores, in px. */
  width: number
  /** Sorting by it: `direction` while the table is sorted by this column, and `onSort` to sort by it. */
  sort?: { direction: SortDirection | undefined; onSort: () => void } | undefined
  /** `end` lines its header and cells up at their end, as numbers are. */
  align?: 'end' | undefined
  /** A control before the label, such as the handle that moves the column. */
  lead?: ReactNode
  /** While a column is dragged: `moving` dims its header, `before` and `after` mark where it lands. */
  move?: 'moving' | 'before' | 'after' | undefined
  /** Events and data attributes of the header cell, such as those of a column dropped on it. */
  headProps?: (Omit<ThHTMLAttributes<HTMLTableCellElement>, 'children' | 'className'>
    & { [data: `data-${string}`]: string | undefined }) | undefined
}

/** Whether a column draft is open and whether the table has an actions column; every row follows both. */
const Shape = createContext<{ draft: boolean; actions: boolean }>({ draft: false, actions: false })

/** What a width belongs to: a column, by its key, or null for the actions column. */
type Slot = string | null

/** A column resize in progress: `start` is the grip's pane width when it began. */
type WidthDrag = {
  start: number
  widths: Map<Slot, number>
  left: { slot: Slot; initial: number; width: number }
  right?: { slot: Slot; initial: number; width: number }
}

/** The body rows of the table in `box`, in document order. */
const bodyRows = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>(':scope > table > tbody > tr')]

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')

function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d={ARROW_PATH[direction]} />
    </svg>
  )
}

/**
 * The one table. Its scroll box scrolls both ways and fades where content is hidden; the header row
 * sticks to the top, the first column, the row's name, to the start, and the actions column to the
 * end, and each fades the content scrolling under it while it is stuck. Every column has a resize
 * grip on its header's end edge that trades width with the next column only, so the columns after it
 * stay put; a double-click puts it back to its `width`. A sortable header sorts on click, through its
 * button from the keyboard, and reports `aria-sort`.
 * `rows` is `fill`, taking the height its parent leaves, or `capped`, showing the header and the
 * first five rows and scrolling the rest, as an embedded list does. With `actions`, the table ends
 * in the actions column: its header cell holds `actions` (null for nothing) and each row its own.
 * `draft` is the header cell of a column being created (a `TableDraftHead`), placed after the
 * columns; while it is open every row leaves a cell under it. `className` only names the table.
 * `children` are the body rows, each a `TableRow`.
 */
export function Table({ columns, rows = 'fill', actions, draft = null, className, children }: {
  columns: readonly TableColumn[]
  rows?: 'fill' | 'capped'
  actions?: ReactNode
  draft?: ReactNode
  className?: string | undefined
  children: ReactNode
}) {
  const m = useMessages()
  const box = useRef<HTMLDivElement | null>(null)
  const fade = useScrollFade('both', box)
  const cap = useRowCap(box, bodyRows, rows === 'capped' ? EMBEDDED_LIST_ROW_LIMIT : undefined)
  const drag = useRef<WidthDrag | null>(null)
  const [widths, setWidths] = useState<ReadonlyMap<Slot, number>>(new Map())
  const hasActions = actions !== undefined
  const slots: Slot[] = [...columns.map((column) => column.key), ...(hasActions ? [null] : [])]
  // Each slot's <col>, by which a resize measures and sizes its column.
  const cols = useRef(new Map<Slot, HTMLTableColElement>())
  const colRef = (slot: Slot) => (element: HTMLTableColElement | null) => {
    if (element === null) cols.current.delete(slot)
    else cols.current.set(slot, element)
  }
  const slotList = JSON.stringify(slots)

  // A column that leaves the table takes its width with it.
  useLayoutEffect(() => {
    const live = new Set<Slot>(JSON.parse(slotList) as Slot[])
    setWidths((held) => ([...held.keys()].every((slot) => live.has(slot))
      ? held : new Map([...held].filter(([slot]) => live.has(slot)))))
  }, [slotList])

  const defaultWidth = (slot: Slot) => (slot === null ? ACTIONS_WIDTH : columns.find((column) => column.key === slot)!.width)
  const minimumWidth = (slot: Slot) => (slot === null ? ACTIONS_WIDTH : MIN_WIDTH)
  const widthOf = (slot: Slot) => widths.get(slot) ?? defaultWidth(slot)
  const slotAfter = (slot: Slot): Slot | undefined => slots[slots.indexOf(slot) + 1]

  /**
   * Freezes the widths the browser shows, so the slack of the table's full width is not spread over
   * the columns again, and starts resizing the column of `slot` from `start`, the grip's pane width,
   * or its measured width. Returns the sizes, measured the same way, that keep both columns at least
   * at their minimum width.
   */
  const beginResize = (slot: Slot, start?: number): GripLimits => {
    const measured = new Map(widths)
    for (const [held, column] of cols.current) {
      const width = column.getBoundingClientRect().width
      if (width > 0) measured.set(held, width)
    }
    for (const [held, width] of measured) {
      const column = cols.current.get(held)
      if (column) column.style.width = `${width}px`
    }
    const rightSlot = slotAfter(slot)
    const leftWidth = measured.get(slot) ?? widthOf(slot)
    const rightWidth = rightSlot === undefined ? undefined : measured.get(rightSlot) ?? widthOf(rightSlot)
    const from = start ?? leftWidth
    drag.current = {
      start: from,
      widths: measured,
      left: { slot, initial: leftWidth, width: leftWidth },
      ...(rightSlot === undefined || rightWidth === undefined ? {} : { right: { slot: rightSlot, initial: rightWidth, width: rightWidth } }),
    }
    return {
      min: from + minimumWidth(slot) - leftWidth,
      max: rightSlot === undefined || rightWidth === undefined ? Number.POSITIVE_INFINITY : from + rightWidth - minimumWidth(rightSlot),
    }
  }

  const resizeTo = (size: number) => {
    const d = drag.current!
    const raw = size - d.start
    const delta = d.right === undefined
      ? Math.max(minimumWidth(d.left.slot) - d.left.initial, raw)
      : Math.max(minimumWidth(d.left.slot) - d.left.initial, Math.min(d.right.initial - minimumWidth(d.right.slot), raw))
    d.left.width = d.left.initial + delta
    if (d.right !== undefined) d.right.width = d.right.initial - delta
    for (const side of [d.left, d.right]) {
      const column = side === undefined ? undefined : cols.current.get(side.slot)
      if (column) column.style.width = `${side!.width}px`
    }
  }

  const endResize = () => {
    const d = drag.current!
    drag.current = null
    const next = new Map(d.widths).set(d.left.slot, d.left.width)
    if (d.right !== undefined) next.set(d.right.slot, d.right.width)
    setWidths(next)
  }

  const grip = (key: string, name: string) => {
    const right = slotAfter(key)
    return (
      <Tooltip label={m.common.table.resize(name)} note={m.shell.sidebar.dragHint}>
        <Grip
          className="table-grip" label={m.common.table.resize(name)} value={widthOf(key)} min={minimumWidth(key)}
          max={right === undefined ? widthOf(key) : widthOf(key) + widthOf(right) - minimumWidth(right)}
          onResizeStart={(size) => beginResize(key, size)} onResize={resizeTo} onResizeEnd={endResize}
          onReset={() => {
            beginResize(key)
            resizeTo(defaultWidth(key))
            endResize()
          }}
        />
      </Tooltip>
    )
  }

  const ariaSort = (column: TableColumn) => (column.sort?.direction === undefined ? undefined
    : column.sort.direction === 'asc' ? 'ascending' : 'descending')

  return (
    <div
      className={`table-scroll table-scroll--${rows}${cap === null ? '' : ' table-scroll--capped-rows'}`} ref={fade}
      data-fade-held="left right top" style={cap === null ? undefined : { maxHeight: cap }}
    >
      <table className={classes('table', className)}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} ref={colRef(column.key)} data-cw={column.key} style={{ width: `${widthOf(column.key)}px` }} />
          ))}
          {draft === null ? null : <col style={{ width: `${DRAFT_WIDTH}px` }} />}
          {hasActions ? <col ref={colRef(null)} style={{ width: `${widthOf(null)}px` }} /> : null}
        </colgroup>
        <thead>
          <tr data-row-actions="">
            {columns.map((column) => {
              const name = column.name ?? (typeof column.label === 'string' ? column.label : column.key)
              return (
                <th
                  {...column.headProps} key={column.key} aria-sort={ariaSort(column)}
                  className={classes(column.align === 'end' && 'table-end', column.move && `table-move-${column.move}`)}
                  onClick={column.sort?.onSort}
                >
                  {column.lead}
                  {column.sort === undefined ? column.label : (
                    <button type="button" className="table-sort">
                      {column.label}{column.sort.direction === undefined ? null : <> <SortArrow direction={column.sort.direction} /></>}
                    </button>
                  )}
                  {grip(column.key, name)}
                </th>
              )
            })}
            {draft}
            {hasActions ? <th className="table-actions">{actions === null ? null : <RowActions>{actions}</RowActions>}</th> : null}
          </tr>
        </thead>
        <Shape.Provider value={{ draft: draft !== null, actions: hasActions }}>
          <tbody>{children}</tbody>
        </Shape.Provider>
      </table>
    </div>
  )
}

/**
 * The header cell of a column being created, the place of its name's draft; `Table` takes it as its
 * `draft`. `className` only names it.
 */
export const TableDraftHead = forwardRef<HTMLTableCellElement, { className?: string; children: ReactNode }>(
  function TableDraftHead({ className, children }, ref) {
    return <th ref={ref} className={classes('table-draft', className)}>{children}</th>
  },
)

/**
 * One body row of a `Table`. It takes the hover fill, `selected` the selected look; with `onClick`
 * it is the pointer's way to what the row opens. It hosts the row-actions slot: `actions` go in the
 * table's actions column. It leaves the cell under an open column draft. Other props and the ref go
 * to the `<tr>`, so a context menu or a toolbar can wrap it; `className` only names it.
 */
export const TableRow = forwardRef<HTMLTableRowElement, {
  selected?: boolean | undefined
  actions?: ReactNode
  className?: string | undefined
  children: ReactNode
} & Omit<HTMLAttributes<HTMLTableRowElement>, 'children' | 'className'>>(function TableRow(
  { selected = false, actions, className, children, ...props }, ref,
) {
  const shape = useContext(Shape)
  return (
    <tr
      {...props} ref={ref} data-row-actions=""
      className={classes('table-row', props.onClick !== undefined && 'table-row--opens', selected && 'table-row--selected', className)}
    >
      {children}
      {shape.draft ? <td /> : null}
      {shape.actions ? <td className="table-actions">{actions === undefined ? null : <RowActions>{actions}</RowActions>}</td> : null}
    </tr>
  )
})

/**
 * Calls `measure` with `box`, a cell's content box, after every render of the caller and whenever the
 * cell changes size, but not while the pointer rests on the cell, whose content then shows whole, and
 * not while the box is on a hidden screen, which lays it out zero wide.
 */
function useCellMeasure(box: { current: HTMLElement | null }, measure: (box: HTMLElement) => void): void {
  const latest = useRef(measure)
  latest.current = measure
  const update = useRef(() => {
    const content = box.current
    if (content === null || content.clientWidth === 0 || content.parentElement!.matches(':hover')) return
    latest.current(content)
  })
  useLayoutEffect(() => update.current())
  useEffect(() => {
    const observer = new ResizeObserver(() => update.current())
    observer.observe(box.current!.parentElement!)
    return () => observer.disconnect()
  }, [box])
}

/**
 * One body cell of a `TableRow`, in one line. `content` is `text`, which fades out where the cell
 * cuts it off and shows whole over the cells beside it while the pointer rests on it; `chips`, which
 * keep the first chip, fold those that do not fit behind a +N count that unfolds them, and never
 * squeeze one; or `controls`, such as an editor, left as they are. `kind` is the row's `title`, a
 * `meta` value in the quiet colour, or an `edit` value that opens its editor on a click. Other props
 * and the ref go to the `<td>`; `className` only names it.
 */
export const TableCell = forwardRef<HTMLTableCellElement, {
  content?: 'text' | 'chips' | 'controls'
  kind?: 'title' | 'meta' | 'edit' | undefined
  /** `end` for a cell of a column whose `align` is `end`. */
  align?: 'end' | undefined
  className?: string | undefined
  children?: ReactNode
} & Omit<TdHTMLAttributes<HTMLTableCellElement>, 'children' | 'className' | 'align'>>(function TableCell(
  { content = 'text', kind, align, className, children, ...props }, ref,
) {
  const names = classes(kind && `table-cell--${kind}`, align === 'end' && 'table-end', className)
  return (
    <td {...props} ref={ref} className={names || undefined}>
      {content === 'controls' ? children
        : content === 'chips' ? <TableChips>{children}</TableChips>
          : <TableText>{children}</TableText>}
    </td>
  )
})

/** A cell's text on one line, marked `table-cut` while the cell cuts it off. */
function TableText({ children }: { children: ReactNode }) {
  const box = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)
  useCellMeasure(box, (text) => setCut(text.scrollWidth > text.clientWidth + 1))
  return <span ref={box} className={cut ? 'table-text table-cut' : 'table-text'}>{children}</span>
}

/**
 * A cell's chips on one line: the first always stays, fading at the cell's end if it must, and the
 * chips past the end fold behind a +N count that unfolds them onto more lines. A trailing chip that
 * adds one (`tagadd`) folds with them but is not counted.
 */
function TableChips({ children }: { children: ReactNode }) {
  const m = useMessages()
  const box = useRef<HTMLSpanElement>(null)
  const [folded, setFolded] = useState(0)
  const [open, setOpen] = useState(false)
  useCellMeasure(box, (chips) => {
    chips.classList.remove('is-open')
    chips.querySelectorAll(':scope > .table-folded').forEach((chip) => chip.classList.remove('table-folded'))
    // The +N takes no room while the chips are measured.
    const badge = chips.querySelector(':scope > .morebadge')
    badge?.classList.add('table-folded')
    let hidden = 0
    if (chips.scrollWidth > chips.clientWidth + 1) {
      const limit = chips.getBoundingClientRect().left + chips.clientWidth - 40
      let past = false
      ;[...chips.children].forEach((chip, i) => {
        if (i === 0 || chip === badge) return
        if (past || chip.getBoundingClientRect().right > limit) {
          past = true
          chip.classList.add('table-folded')
          if (!chip.classList.contains('tagadd')) hidden++
        }
      })
    }
    badge?.classList.remove('table-folded')
    if (open && hidden > 0) chips.classList.add('is-open')
    setFolded(hidden)
    if (hidden === 0) setOpen(false)
  })
  return (
    <span ref={box} className={open && folded > 0 ? 'table-chips is-open' : 'table-chips'}>
      {children}
      {folded === 0 ? null : (
        <CountBadge
          className="morebadge" count={folded} more={{ open }}
          label={open ? m.common.table.showLess(folded) : m.common.table.showMore(folded)}
          onClick={(event: ReactMouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            setOpen((held) => !held)
          }}
        />
      )}
    </span>
  )
}

/**
 * The button of a row's name in its title cell, the keyboard's way to what the row opens: it draws
 * nothing of its own, and its click reaches the row. In a toolbar it is one of its controls.
 */
export const TableOpen = forwardRef<HTMLButtonElement, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className'>>(
  function TableOpen(props, ref) {
    return useToolbarItem()(<button {...props} ref={ref} type="button" className="table-open" />)
  },
)
