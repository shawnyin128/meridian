import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, RefObject } from 'react'
import type {
  Facet, ListParams, PaperCell, PaperColumn, PaperColumns, PaperRow, ReadState, RecordedChange, SortDirection,
  SortKey,
} from '../../../shared/contract.js'
import { MAX_PDF_UPLOAD_BYTES } from '../../../shared/contract.js'
import { DEFAULT_PAPER_GROUPS, PAPER_PAGE, READ_STATES } from '../../../shared/vocabulary.js'
import { papers } from '../../ipc.js'
import { errorLabel } from '../../lib/failure-label.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { IconGrip, IconRead, IconTrash } from '../icons.js'
import { CellPicker } from './CellPicker.js'
import { NewColumnHead } from './ColumnAdd.js'
import { builtinNames, columnKey, takenLabel } from './column-key.js'
import { ColumnMenu } from './ColumnMenu.js'
import { GroupMenu, groupRows } from './GroupMenu.js'
import { ParseProgress } from '../ParseProgress.js'
import { Pager } from '../Pager.js'
import { PaperMetadata, PaperTitleField, RatingStars, ReadStatePicker, readStateName } from '../PaperMetadata.js'
import { PaperTopics } from '../PaperTopics.js'
import { PaperReadingSummary } from './PaperReadingSummary.js'
import { FormInput } from '../FormControls.js'
import { ClearableInput } from '../ClearableInput.js'
import { PageBody, PageError, PageHeader, PageShell, PageTitle, PageToolbar } from '../PageShell.js'
import { NO_TRIGGERS } from '../../hooks/useOnLeave.js'
import { useInlineDraft } from '../../hooks/useInlineDraft.js'
import { useUndo } from '../../hooks/useUndo.js'
import { useJumpOrigin } from '../../hooks/useJumpOrigin.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { useScrollFade } from '../../hooks/useScrollFade.js'
import {
  useCrumbTail, useEscapeLayer, useJump, useNotice, usePaperCount, useScreen, useScreenReentry, useVaultRevision,
} from '../../shell/AppShell.js'
import { AddAction } from '../AddAction.js'
import { BackButton } from '../BackButton.js'
import { IconButton } from '../IconButton.js'
import { holdRepeatSelection, RowActions, StructuredList, StructuredRow } from '../StructuredList.js'
import { PanelClose } from '../PanelClose.js'
import { CountBadge, Tag, tagClass } from '../Tag.js'
import { Grip, type GripLimits } from '../Grip.js'
import { Toolbar, ToolbarButton } from '../Toolbar.js'
import { Tooltip } from '../Tooltip.js'
import { DetailPanel } from '../DetailPanel.js'
import { FadeText } from '../FadeText.js'
import { ActionMenu, MenuRadioGroup, MenuRadioItem } from '../ActionMenu.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '../ContextMenu.js'
import { FilterMenu } from '../FilterMenu.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { ResearchMap } from './ResearchMap.js'
import './PaperTable.css'

type ChipKey = 'topics'
/** The title column renders separately; a BodyKey is a built-in column to its right. */
export type BodyKey = 'short' | 'authors' | 'y' | 'venue' | 'rating' | 'st' | 'remark' | ChipKey
type ColKey = 't' | BodyKey | 'x'

/**
 * A column the table shows now. Custom columns carry their type and options and cannot be sorted.
 * Labels are not stored here: they come from the catalog for a built-in column, or `column.label`
 * for a custom one.
 */
type ShownCol =
  | { k: BodyKey; sort?: SortKey; column?: undefined }
  | { k: string; sort?: undefined; column: PaperColumn }

/** The label to show for a column of the table at this time, a built-in one named by `names`. */
function shownLabel(names: Catalog['papers']['columns'], col: ShownCol): string {
  return col.column ? col.column.label : names[col.k]
}

export const COLUMNS: { k: BodyKey; sort?: SortKey }[] = [
  { k: 'short' },
  { k: 'rating' },
  { k: 'authors', sort: 'authors' },
  { k: 'y', sort: 'year' },
  { k: 'venue' },
  { k: 'topics' },
  { k: 'st' },
  { k: 'remark' },
]

/** Width of the last column: the row's delete button, the header's + and the column gear share it. */
const ROWX_WIDTH = 52

const DEFAULT_WIDTHS: Record<ColKey, number> = {
  t: 300, short: 150, rating: 104, authors: 160, y: 104, venue: 120, topics: 240, st: 78,
  remark: 220,
  x: ROWX_WIDTH,
}

/** Custom column width, as in the demo: a column that was never resized stays this wide. */
const CUSTOM_WIDTH = 140
const MIN_COLUMN_WIDTH = 56

/** Lower limit for a manual drag; the browser can still shrink columns further as the window narrows. */
const minimumWidth = (key: string): number => key === 'x' ? ROWX_WIDTH : MIN_COLUMN_WIDTH

/** The width a double-click on a column's grip restores. */
const defaultWidth = (key: string): number => (DEFAULT_WIDTHS as Record<string, number>)[key] ?? CUSTOM_WIDTH

/** A column resize in progress: `start` is the grip's pane width when it began. */
type WidthDrag = {
  start: number
  widths: Record<string, number>
  left: { key: string; initial: number; width: number }
  right?: { key: string; initial: number; width: number }
}

const MIN_PAGE_SIZE = 20
const PAGE_SIZES = [MIN_PAGE_SIZE, 30, 50]
const RESEARCH_MAP_LIMIT = 200

const ARROW_PATH: Record<SortDirection, string> = { asc: 'M6 15l6-6 6 6', desc: 'M6 9l6 6 6-6' }

/**
 * The values a cell holds now: text and single-choice columns store one value, a multi-choice column
 * stores a list, and an empty cell is absent from the map.
 */
function cellValues(held: PaperCell | undefined): string[] {
  return held === undefined ? [] : Array.isArray(held) ? held : [held]
}

/**
 * The success notice for this column configuration change, or undefined when there is none. The first match
 * wins, in this order: a deleted column, an added column, a renamed column, changed groups, a changed
 * column order, and otherwise changed options.
 */
export function columnsNote(
  prev: PaperColumns, next: PaperColumns, notices: Catalog['papers']['notices'],
): string | undefined {
  const gone = prev.custom.find((c) => !next.custom.some((n) => n.key === c.key))
  if (gone) return notices.columnDeleted(gone.label)
  if (next.custom.some((c) => !prev.custom.some((p) => p.key === c.key))) return notices.columnCreated
  if (next.custom.some((c) => prev.custom.some((p) => p.key === c.key && p.label !== c.label))) {
    return notices.columnRenamed
  }
  if (next.groups.join() !== prev.groups.join()) return notices.groupsUpdated
  if ((next.order ?? []).join() !== (prev.order ?? []).join()) return notices.orderUpdated
  if (JSON.stringify(next.custom) !== JSON.stringify(prev.custom)) return notices.optionsDeleted
  return undefined
}

/**
 * The full order of all columns except the title. An older configuration may list only some of them;
 * the missing ones follow at the end in declaration order.
 */
export function orderedColumns(columns: PaperColumns): ShownCol[] {
  const all: ShownCol[] = [
    ...COLUMNS,
    ...columns.custom.map((column) => ({ k: column.key, column })),
  ]
  const byKey = new Map(all.map((column) => [column.k, column]))
  const keys = [...new Set([...(columns.order ?? []), ...all.map((column) => column.k)])]
  return keys.flatMap((key) => {
    const column = byKey.get(key)
    return column === undefined ? [] : [column]
  })
}

export function movedColumnOrder(
  columns: PaperColumns, from: string, to: string, after = false,
): string[] {
  const keys = orderedColumns(columns).map((column) => column.k)
  const fromAt = keys.indexOf(from)
  if (fromAt < 0 || !keys.includes(to) || from === to) return keys
  const next = keys.filter((key) => key !== from)
  const toAt = next.indexOf(to)
  next.splice(toAt + (after ? 1 : 0), 0, from)
  return next
}

function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d={ARROW_PATH[direction]} />
    </svg>
  )
}

/**
 * The picked group value with its paper count; its menu switches to another value of the same group.
 * `name` gives the name each value shows.
 */
function GroupValuePicker({ current, facets, name, onPick }: {
  current: string | null
  facets: Facet[]
  name: (value: string) => string
  onPick: (value: string) => void
}) {
  const m = useMessages()
  const count = facets.find((facet) => facet.value === current)?.count
  const shown = current === null ? null : name(current)
  return (
    <ActionMenu
      align="start"
      trigger={(
        <button type="button" className="btn sm" aria-label={m.papers.toolbar.groupValueAria}>
          {count === undefined ? shown : `${shown} · ${count}`}
        </button>
      )}
    >
      <MenuRadioGroup value={current ?? ''}>
        {facets.map((facet) => (
          <MenuRadioItem key={facet.value} value={facet.value} onSelect={() => onPick(facet.value)}>
            {name(facet.value)}
            <span className="mi-key">{facet.count}</span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ActionMenu>
  )
}

/**
 * Double-clicking a row's blank space, its text or its title opens the reader; the other buttons and
 * the editors inside a cell keep their own double-click behaviour.
 */
function opensPaperFrom(target: EventTarget | null): boolean {
  return !(target instanceof Element)
    || target.closest('button:not(.pt-open), input, select, textarea, [contenteditable="true"]') === null
}

/**
 * In-place editing of a text cell: Enter, a press outside `cell`, or focus leaving it hands the
 * input's text to `onSave`; Esc calls `onCancel` without writing the typed text. `onSave` returns
 * whether this edit is finished.
 */
function TextCellEdit({ cell, initial, onSave, onCancel }: {
  cell: RefObject<HTMLTableCellElement | null>
  initial: string
  onSave: (value: string) => boolean | Promise<boolean>
  onCancel: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const draft = useInlineDraft({
    row: cell, triggers: NO_TRIGGERS, onCancel,
    onSubmit: () => onSave(input.current!.value),
  })
  return (
    <FormInput
      appearance="inline" className="celledit paper-text-cell-input"
      ref={input}
      {...draft.inputProps}
      defaultValue={initial}
    />
  )
}

/**
 * The paper library table: filtering and grouping, paging, column-width dragging, a frozen first
 * column and header, long cells expanding in place on hover, a click on a row opening the detail
 * panel, adding a topic at the end of the topics cell, deleting at the end of a row, managing
 * columns from the menu at the end of the header, and a cell editor for each custom column type.
 * The table holds only the current page: papers.list fetches it by page, papers.facets supplies the
 * group values and counts, and papers.columns says which columns show.
 * A jump from another screen lands on that paper's title: the title goes into the filter box, which
 * leaves only that paper in the table. A jump with the `detail` anchor opens that paper's detail
 * panel instead and leaves the table as it was; one with `importPdf` opens the import's file chooser.
 */
export function PaperTable() {
  const m = useMessages()
  const jumpOrigin = useJumpOrigin()
  const [view, setView] = useState<'table' | 'research-map'>('table')
  const [rows, setRows] = useState<PaperRow[]>([])
  const [total, setTotal] = useState(0)
  const [mapRows, setMapRows] = useState<PaperRow[]>([])
  const [mapTotal, setMapTotal] = useState(0)
  const [mapLoading, setMapLoading] = useState(false)
  const [facets, setFacets] = useState<Facet[]>([])
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('none')
  const [sel, setSel] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(MIN_PAGE_SIZE)
  const [sort, setSort] = useState<SortKey>('addedAt')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [widths, setWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS)
  const [columns, setColumns] = useState<PaperColumns>(
    { hidden: [], custom: [], groups: [...DEFAULT_PAPER_GROUPS] })
  const names = builtinNames(m, columns)
  // Core's last confirmed column set. Every step on the column chain computes its write from this,
  // not from the columns captured in a render's closure.
  const confirmedColumns = useRef(columns)
  // Tail of the column chain: column configuration refetches and column set writes queue behind it,
  // each starting only after the previous one has settled.
  const columnChain = useRef<Promise<unknown>>(Promise.resolve())
  const [newCol, setNewCol] = useState(false)
  const colAdd = useRef<HTMLButtonElement>(null)
  const newColCell = useRef<HTMLTableCellElement>(null)
  // Identity of the current column-creation attempt; closing the draft in any way (Esc, outside
  // press, focus leaving, opening the detail panel) replaces it with null.
  const columnDraftToken = useRef<object | null>(null)
  // The custom cell being edited in place
  const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null)
  const editingTd = useRef<HTMLTableCellElement>(null)
  const [detail, setDetail] = useState<PaperRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const uploadInput = useRef<HTMLInputElement>(null)
  const dropDepth = useRef(0)
  const [movingColumn, setMovingColumn] = useState<string | null>(null)
  const [columnDrop, setColumnDrop] = useState<{ key: string; after: boolean } | null>(null)
  const drag = useRef<WidthDrag | null>(null)
  const table = useRef<HTMLTableElement>(null)
  const tableFade = useScrollFade('both')
  const detailFade = useScrollFade('y')
  const consumed = useRef(0)
  // Write queue of the cell being edited: each link resolves to the values the previous step settled
  // on, or to null when a step failed, which voids this pick so it is not sent.
  const queue = useRef<{
    cell: { id: string; key: string }
    chain: Promise<string[] | null>
  } | null>(null)

  const notice = useNotice()
  const paperCount = usePaperCount()
  const screen = useScreen()
  const { jump, open } = useJump()
  // The revision is bumped after a write so the grouping and row-fetch effects run again, like the
  // demo's renderLibRows call after a submit.
  const { revision, bump } = useVaultRevision()
  const reportError = useCallback((e: unknown) => setError(errorLabel(m, e)), [m])
  const closeDetail = useCallback(() => setDetail(null), [])
  const write = useVaultWrite()
  const undo = useUndo()
  const detailId = detail?.id

  // A write in the detail panel (linking a project) only bumps the vault revision, so the open paper
  // must be refetched.
  useEffect(() => {
    if (detailId === undefined) return
    void papers.get(detailId).then(setDetail).catch(reportError)
  }, [detailId, revision, reportError])

  // Opening a paper is a separate navigation action, so discard an unfinished column-header draft.
  // The established columns remain mounted and horizontally scrollable beside the inspector.
  useEffect(() => {
    if (detail === null) return
    columnDraftToken.current = null
    setNewCol(false)
  }, [detail])

  const filter = q.trim()
  const pageCount = Math.max(1, Math.ceil(total / size))
  // As in the demo's pagerHTML, a page past the end renders as the last page at once instead of
  // waiting for the refetched count to correct it.
  const shownPage = Math.min(page, pageCount)

  // With an ordinary grouping, the user picks a value first: until then only the group index shows,
  // no rows are fetched and no pager is drawn. A filter that leaves the picked value without rows also
  // returns to the index. Reading status is a direct filter: picking a status that has no papers now
  // draws an empty table instead of the group index.
  const listed = group === 'none'
    || (sel !== null && (group === 'readState' || facets.some((f) => f.value === sel)))
  // The title counts the rows the list shows under the search, the read-state filter and a picked group
  // value; with none of them active it counts the vault. The group index lists no rows, so a search
  // there leaves the title without a count.
  const filtered = filter !== '' || (view === 'table' && sel !== null)
  const titleCount = !filtered ? paperCount
    : view === 'research-map' ? (mapLoading ? null : mapTotal)
      : listed ? total : null

  useEffect(() => {
    // Fetching the column configuration also queues on the column chain, so it waits for a write in
    // flight to land. The fetched configuration is the base later writes compute from.
    columnChain.current = columnChain.current.then(() => papers.columns().then((live) => {
      confirmedColumns.current = live
      setColumns(live)
    }).catch(reportError))
  }, [revision, reportError])

  // Editing another cell drops the previous cell's write queue; the next cell's first pick computes
  // from the current column configuration and row again.
  useEffect(() => { queue.current = null }, [editingCell])

  useEffect(() => {
    if (group === 'none') {
      setFacets([])
      return
    }
    void papers.facets(group, filter).then(setFacets).catch(reportError)
  }, [group, filter, revision, reportError])

  useEffect(() => {
    if (view !== 'table' || !listed) return
    const params: ListParams = {
      page: shownPage, size, sort, direction,
      ...(filter ? { filter } : {}),
      ...(sel === null || group === 'none' ? {} : { facet: { field: group, value: sel } }),
    }
    void papers.list(params).then((r) => {
      setRows(r.rows)
      setTotal(r.total)
    }).catch(reportError)
  }, [view, listed, shownPage, size, sort, direction, filter, group, sel, revision, reportError])

  useEffect(() => {
    if (view !== 'research-map') return
    let active = true
    setMapLoading(true)
    const params: ListParams = {
      page: 1, size: RESEARCH_MAP_LIMIT, sort: 'addedAt', direction: 'desc',
      ...(filter ? { filter } : {}),
    }
    void papers.list(params).then((result) => {
      if (!active) return
      setMapRows(result.rows)
      setMapTotal(result.total)
    }).catch(reportError).finally(() => { if (active) setMapLoading(false) })
    return () => { active = false }
  }, [view, filter, revision, reportError])

  // Clicking the sidebar while this screen is shown lands on the plain table: an open detail panel closes.
  const reentry = useScreenReentry()
  useEffect(() => { setDetail(null) }, [reentry])

  // A jump from another screen lands on a paper title: put it in the filter box and go back to the
  // first page, like `go` in the demo's search. A jump that asks for the import opens the PDF picker;
  // the click that made the jump still counts as the user gesture the picker needs.
  useEffect(() => {
    if (jump === null || jump.seq === consumed.current) return
    consumed.current = jump.seq
    if (jump.anchor?.detail === true) {
      void papers.get(jump.target).then(setDetail).catch(reportError)
      return
    }
    if (jump.anchor?.importPdf === true) {
      if (!uploading) uploadInput.current?.click()
      return
    }
    setQ(jump.target)
    setPage(1)
  }, [jump, reportError, uploading])

  const backToValues = useCallback(() => { setSel(null); setPage(1) }, [])
  const backToUngrouped = useCallback(() => { setGroup('none'); setSel(null); setPage(1) }, [])

  /** A grouping's name in the UI: a custom column's label, else the built-in group name, else the key. */
  // groupNames is a plain object; without the hasOwn check, keys such as toString would return
  // functions from Object.prototype.
  const labelOf = (key: string) => columns.custom.find((c) => c.key === key)?.label
    ?? (Object.hasOwn(names.groupNames, key) ? names.groupNames[key as keyof typeof names.groupNames] : key)
  /** The name a value of the current grouping shows. */
  const valueName = (value: string) => (group === 'readState' ? readStateName(m, value) : value)

  useCrumbTail(useMemo(() => {
    if (view === 'research-map') return []
    if (group === 'none') return []
    // Same lookup order as labelOf. labelOf is a new function every render, and as a dependency it
    // would reset the breadcrumbs every frame.
    const { groupNames } = builtinNames(m, columns)
    const label = columns.custom.find((c) => c.key === group)?.label
      ?? (Object.hasOwn(groupNames, group) ? groupNames[group as keyof typeof groupNames] : group)
    const value = sel === null || group !== 'readState' ? sel : readStateName(m, sel)
    return value === null ? [{ text: label }] : [{ text: label, onClick: backToValues }, { text: value }]
  }, [view, group, sel, columns, backToValues, m]), backToUngrouped)

  // When the grouped-by column is unchecked, deleted or made a text column, fall back to "None" at once
  useEffect(() => {
    if (group !== 'none' && !columns.groups.includes(group)) {
      setGroup('none')
      setSel(null)
      setPage(1)
    }
  }, [columns, group])

  useEscapeLayer(detail !== null, closeDetail)

  // A column's grip moves the boundary between two columns: the left column and its right neighbour
  // grow and shrink by the same amount, so the total width stays fixed and columns further right do
  // not move. A resize first freezes the widths the browser actually shows, so the slack left by
  // width:100% is not redistributed across the table.
  /** The column right of column `k`, which gives or takes the width `k` gains or loses. */
  const columnAfter = (k: string): string | undefined => {
    const keys = ['t', ...cols.map((column) => column.k), 'x']
    return keys[keys.indexOf(k) + 1]
  }

  /**
   * Freezes the column widths and starts resizing column `k` from `start`, the grip's pane width,
   * or its measured width. Returns the sizes, measured the same way, that keep both columns at least
   * at their minimum width.
   */
  const beginResize = (k: string, start?: number): GripLimits => {
    const measured = { ...widths }
    table.current?.querySelectorAll<HTMLElement>('col[data-cw]').forEach((column) => {
      const key = column.dataset['cw']
      const width = column.getBoundingClientRect().width
      if (key !== undefined && width > 0) measured[key] = width
    })
    for (const [key, width] of Object.entries(measured)) {
      const column = table.current?.querySelector<HTMLElement>(`col[data-cw="${key}"]`)
      if (column) column.style.width = `${width}px`
    }
    const rightKey = columnAfter(k)
    const leftWidth = measured[k] ?? widthOf(k)
    const rightWidth = rightKey === undefined ? undefined : measured[rightKey] ?? widthOf(rightKey)
    const from = start ?? leftWidth
    drag.current = {
      start: from,
      widths: measured,
      left: { key: k, initial: leftWidth, width: leftWidth },
      ...(rightKey === undefined || rightWidth === undefined
        ? {}
        : { right: { key: rightKey, initial: rightWidth, width: rightWidth } }),
    }
    return {
      min: from + minimumWidth(k) - leftWidth,
      max: rightKey === undefined || rightWidth === undefined
        ? Number.POSITIVE_INFINITY
        : from + rightWidth - minimumWidth(rightKey),
    }
  }

  const resizeTo = (size: number) => {
    const d = drag.current!
    const raw = size - d.start
    const delta = d.right === undefined
        ? Math.max(minimumWidth(d.left.key) - d.left.initial, raw)
        : Math.max(
          minimumWidth(d.left.key) - d.left.initial,
          Math.min(d.right.initial - minimumWidth(d.right.key), raw),
        )
    d.left.width = d.left.initial + delta
    if (d.right !== undefined) d.right.width = d.right.initial - delta
    const left = table.current?.querySelector<HTMLElement>(`col[data-cw="${d.left.key}"]`)
    if (left) left.style.width = `${d.left.width}px`
    if (d.right !== undefined) {
      const right = table.current?.querySelector<HTMLElement>(`col[data-cw="${d.right.key}"]`)
      if (right) right.style.width = `${d.right.width}px`
    }
  }

  const endResize = () => {
    const d = drag.current!
    drag.current = null
    setWidths({
      ...d.widths,
      [d.left.key]: d.left.width,
      ...(d.right === undefined ? {} : { [d.right.key]: d.right.width }),
    })
  }

  const resetWidth = (k: string) => {
    beginResize(k)
    resizeTo(defaultWidth(k))
    endResize()
  }

  // Recalculate truncation after data, columns, widths, panels, or editing state change. Text cells
  // retain their hover preview; chip cells keep the first visible row and expose hidden items through
  // an explicit +N toggle. Hidden screens measure as zero, so defer this work until Papers is active.
  useEffect(() => {
    if (screen !== 'papers') return
    table.current?.querySelectorAll<HTMLElement>('td .ci').forEach((ci) => {
      const td = ci.parentElement!
      const wasExpanded = ci.dataset['expanded'] === 'true'
      ci.classList.remove('chip-expanded')
      ci.querySelectorAll('.hid').forEach((chip) => chip.classList.remove('hid'))
      ci.querySelector('.morebadge')?.remove()
      if (!ci.querySelector('.tagchip')) {
        td.classList.toggle('trunc', ci.scrollWidth > ci.clientWidth + 1)
        return
      }
      if (ci.scrollWidth <= ci.clientWidth + 1) {
        delete ci.dataset['expanded']
        td.classList.remove('trunc')
        return
      }
      const limit = ci.getBoundingClientRect().left + ci.clientWidth - 40
      let hidden = 0
      let real = 0
      ;[...ci.children].forEach((chip, i) => {
        // The first chip always stays, truncated if needed.
        if (i === 0) return
        if (hidden > 0 || chip.getBoundingClientRect().right > limit) {
          chip.classList.add('hid')
          hidden++
          // The trailing + is not content, so folding it away does not count toward +N.
          if (!chip.classList.contains('tagadd')) real++
        }
      })
      if (real > 0) {
        const badge = document.createElement('button')
        badge.type = 'button'
        badge.className = tagClass('neutral', 'label', 'morebadge')
        const setExpanded = (expanded: boolean) => {
          ci.dataset['expanded'] = String(expanded)
          ci.classList.toggle('chip-expanded', expanded)
          badge.textContent = expanded ? '−' : `+${real}`
          badge.setAttribute('aria-label', expanded ? m.papers.tags.showLess(real) : m.papers.tags.showMore(real))
          badge.setAttribute('aria-expanded', String(expanded))
        }
        setExpanded(wasExpanded)
        badge.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          setExpanded(ci.dataset['expanded'] !== 'true')
        })
        ci.appendChild(badge)
      }
      td.classList.add('trunc')
    })
  }, [rows, columns, widths, detail, screen, editingCell, m])

  /**
   * A column's current width: its dragged width once dragged, otherwise DEFAULT_WIDTHS for a built-in
   * column and 140 for a custom one.
   */
  const widthOf = (k: string) => widths[k] ?? CUSTOM_WIDTH

  /** The grip on the end edge of column `k`'s header; `name` is the column's shown name. */
  const columnGrip = (k: string, name: string) => {
    const right = columnAfter(k)
    return (
      <Tooltip label={m.papers.columnHeader.resize(name)} note={m.shell.sidebar.dragHint}>
        <Grip
          className="thgrip" label={m.papers.columnHeader.resize(name)} value={widthOf(k)} min={minimumWidth(k)}
          max={right === undefined ? widthOf(k) : widthOf(k) + widthOf(right) - minimumWidth(right)}
          onResizeStart={(size) => beginResize(k, size)} onResize={resizeTo} onResizeEnd={endResize}
          onReset={() => resetWidth(k)}
        />
      </Tooltip>
    )
  }

  const clickHeader = (key: SortKey) => {
    if (sort === key) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setDirection(key === 'year' ? 'desc' : 'asc')
    }
  }
  const ariaSort = (key: SortKey) => (sort !== key ? undefined : direction === 'asc' ? 'ascending' : 'descending')

  const addTopic = (p: PaperRow, value: string): Promise<boolean> =>
    write(papers.setTopic(p.id, value, true), { note: m.papers.notices.topicAdded, action: undo.change })

  const setReadState = (p: PaperRow, readState: ReadState) => {
    void write(papers.update(p.id, { readState }), { note: m.papers.notices.readStateUpdated })
  }

  const removeTopic = (p: PaperRow, value: string): Promise<boolean> =>
    write(papers.setTopic(p.id, value, false), { note: m.papers.notices.updated, action: undo.change })

  const setRating = (p: PaperRow, rating: number | null) => {
    void write(papers.update(p.id, { rating }), rating === null
      ? { note: m.papers.notices.updated, action: undo.change }
      : { note: m.papers.notices.rated(rating) })
  }

  const remove = (id: string) => {
    // As in the demo, a delete shortens the list by one item, so the page number clamps back in the
    // same frame instead of drawing an empty list first.
    void write(papers.delete(id).then((recorded) => {
      if (detail?.id === id) setDetail(null)
      setTotal((t) => t - 1)
      return recorded
    }), { note: m.common.trashed, action: undo.change })
  }

  /**
   * The browser file picker gives the renderer only a copy of the File the user explicitly chose. Its
   * content goes to Core as a structured-cloned Uint8Array; the paper's vault identity, checksum and
   * disk writes all stay in Core. On success, the new paper shows in the table with its details open.
   */
  const uploadPdf = async (file: File) => {
    if (file.size > MAX_PDF_UPLOAD_BYTES) {
      notice.refusal(m.papers.upload.tooLarge)
      if (uploadInput.current !== null) uploadInput.current.value = ''
      return
    }
    setUploading(true)
    setError(null)
    try {
      const result = await papers.import(file.name, new Uint8Array(await file.arrayBuffer()))
      if (result.kind === 'added') bump()
      setQ('')
      setPage(1)
      setGroup('none')
      setSel(null)
      setDetail(result.paper)
      notice.success(result.kind === 'added' ? m.papers.upload.addedParsing : m.papers.upload.alreadyInLibrary)
    } catch (cause) {
      notice.refusal(errorLabel(m, cause))
    } finally {
      setUploading(false)
      if (uploadInput.current !== null) uploadInput.current.value = ''
    }
  }

  const uploadFiles = async (files: File[]) => {
    const pdfs = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) { notice.refusal(m.papers.upload.dropPdfOnly); return }
    for (const file of pdfs) await uploadPdf(file)
  }

  const enterDrop = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dropDepth.current += 1
    setDropActive(true)
  }

  const leaveDrop = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return
    dropDepth.current = Math.max(0, dropDepth.current - 1)
    if (dropDepth.current === 0) setDropActive(false)
  }

  const dropFiles = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    dropDepth.current = 0
    setDropActive(false)
    void uploadFiles([...event.dataTransfer.files])
  }

  /** Close the cell being edited. */
  const closeCell = () => {
    setEditingCell(null)
  }

  // A text cell's save still in flight. Another cell opens only once it has landed, so a refused
  // save keeps its editor and text instead of being replaced.
  const cellSave = useRef<Promise<boolean> | null>(null)
  const holdCellSave = (save: boolean | Promise<boolean>): boolean | Promise<boolean> => {
    if (typeof save === 'boolean') return save
    const held = save.finally(() => { if (cellSave.current === held) cellSave.current = null })
    cellSave.current = held
    return held
  }
  const openCell = (cell: { id: string; key: string }) => {
    if (editingCell?.id === cell.id && editingCell.key === cell.key) return
    if (cellSave.current === null) setEditingCell(cell)
    else void cellSave.current.then((saved) => { if (saved) setEditingCell(cell) })
  }

  /**
   * Enter in a text cell: an unchanged value just closes it, otherwise the value is written back to
   * the cell. Returns whether the edit is finished: true when unchanged or written, false when the
   * write is rejected.
   */
  const saveCell = (p: PaperRow, k: string, value: string): boolean | Promise<boolean> => {
    if (value.trim() === (p.custom[k] ?? '')) return true
    return write(papers.update(p.id, { custom: { [k]: value.trim() === '' ? null : value.trim() } }),
      { note: m.papers.notices.updated, action: undo.change })
  }

  /**
   * Edits the remark: writes it to the reading record, the same text as in the reader's side panel,
   * as an entry in Recent Changes.
   */
  const saveRemark = (p: PaperRow, value: string): boolean | Promise<boolean> => {
    if (value.trim() === (p.remark ?? '').replace(/[\r\n]/g, '').trim()) return true
    return write(papers.mutateReading(p.id, { kind: 'remark.set', text: value }), {
      note: m.papers.notices.remarkSaved,
    })
  }

  /**
   * Writes back the option picked in this cell. With `created`, the option is first added to this
   * column (queued on the column chain and computed from the column set confirmed at that moment);
   * then `papers.update` changes the cell: a single-choice column takes the option, or is cleared when
   * its current value is picked again, and a multi-choice column adds or removes it. After a
   * single-choice write the editor closes, while a multi-choice one stays open for more picks; a write
   * shows a success notice. If any step is rejected, this pick writes nothing further and the cell's column
   * and row are refetched from Core to correct it; the unsent picks queued after it are voided too,
   * and the whole sequence shows one refusal notice. Consecutive picks in the same cell each compute their
   * values when their turn comes and the previous pick has truly settled, not when they are submitted.
   * Resolves whether this pick was written.
   */
  const savePick = (p: PaperRow, column: PaperColumn, value: string, created: boolean): Promise<boolean> => {
    const q = queue.current?.cell.id === p.id && queue.current.cell.key === column.key
      ? queue.current
      : {
        cell: { id: p.id, key: column.key },
        chain: Promise.resolve<string[] | null>(cellValues(p.custom[column.key])),
      }
    // The queue resets only when its last pick finishes, so the next new pick starts again from the
    // current row. It must not stay stuck voiding: the callback must also reset when it throws into
    // the catch below, or every later pick in this cell would be silently voided.
    const clearIfLatest = () => { if (queue.current === entry) queue.current = null }
    const chain: Promise<string[] | null> = q.chain.then(async (values) => {
      // If any earlier step in this cell failed, this pick is voided and not sent; that step is
      // already refetching the cell from Core to correct it.
      if (values === null) { clearIfLatest(); return null }
      const next = values.includes(value)
        ? values.filter((v) => v !== value)
        : column.type === 'select' ? [value] : [...values, value]
      // Core validates a cell's value against the column's options, so a new option must be added to
      // the column before it is written into the cell.
      const added = !created || await writeColumns(async (base) => {
        const withOption = {
          ...base,
          custom: base.custom.map((c) => (c.key === column.key ? { ...c, options: [...c.options, value] } : c)),
        }
        await papers.setColumns(withOption)
        return withOption
      })
      const ok = added && await write(papers.update(p.id, {
        custom: { [column.key]: next.length === 0 ? null : column.type === 'select' ? next[0]! : next },
      }), { note: m.papers.notices.updated, action: undo.change })
      if (ok) {
        if (column.type === 'select') closeCell()
        return next
      }
      // Rejected: this cell's assumptions no longer match Core, so refetch it; the rejected step
      // already showed the refusal notice.
      clearIfLatest()
      bump()
      return null
    }).catch((e: unknown) => { clearIfLatest(); notice.refusal(errorLabel(m, e)); return null })
    const entry = { cell: q.cell, chain }
    queue.current = entry
    return chain.then((settled) => settled !== null)
  }

  /**
   * Queues a column set change at the end of the column chain. When its turn comes, `step` receives
   * Core's last confirmed column set, does its own write and returns the written column set, which
   * then takes effect; `onApplied` (if given) is called synchronously at that moment, and the result
   * is true. When `step` throws or rejects, the label of its reason shows as a refusal notice, the column set is
   * refetched from Core to correct it, and the result is false. Each step starts only after the
   * previous step and its correction have settled.
   */
  const writeColumns = (
    step: (base: PaperColumns) => Promise<PaperColumns>, onApplied?: () => void,
  ): Promise<boolean> => {
    const run = columnChain.current.then(async () => {
      try {
        const next = await step(confirmedColumns.current)
        confirmedColumns.current = next
        setColumns(next)
        onApplied?.()
        return true
      } catch (e) {
        notice.refusal(errorLabel(m, e))
        await papers.columns().then((live) => {
          confirmedColumns.current = live
          setColumns(live)
        }).catch(reportError)
        return false
      }
    })
    columnChain.current = run
    return run
  }

  /**
   * A column configuration change, queued on the column chain: when its turn comes, `update` computes
   * the new configuration from the last confirmed column set and it is handed to Core. It takes effect
   * only once written (`onApplied` is called synchronously at that moment), bumps the vault revision,
   * shows its success notice, and drops a deleted column's width along with the column. Returns whether it was
   * written.
   */
  const changeColumns = (
    update: (base: PaperColumns) => PaperColumns, onApplied?: () => void,
  ): Promise<boolean> => writeColumns(async (base) => {
    const next = update(base)
    await papers.setColumns(next)
    bump()
    const gone = base.custom.find((c) => !next.custom.some((n) => n.key === c.key))
    if (gone) {
      setWidths((w) => {
        const rest = { ...w }
        delete rest[gone.key]
        return rest
      })
    }
    const note = columnsNote(base, next, m.papers.notices)
    if (note !== undefined) notice.success(note)
    return next
  }, onApplied)

  /**
   * The column name typed at the end of the header and the selected type, queued on the column chain;
   * when its turn comes, one column is written, its key computed from the column set confirmed at that
   * moment. Returns whether the draft is consumed: false for an empty name or one a column in the
   * table already uses; otherwise true once this column was written and the draft was not abandoned
   * before that.
   */
  const createColumn = (label: string, type: PaperColumn['type']): boolean | Promise<boolean> => {
    const builtinLabels = [names.columns.title, ...COLUMNS.map((c) => names.columns[c.k])]
    if (label === '' || takenLabel(label, columns, builtinLabels)) return false
    const token = {}
    columnDraftToken.current = token
    return changeColumns(
      (base) => ({ ...base, custom: [...base.custom, { key: columnKey(label, base), label, type, options: [] }] }),
      // Close the draft in the same commit as the new column. If this attempt was abandoned (the
      // token was replaced), its draft is already gone, and a newly opened one must stay open.
      () => { if (columnDraftToken.current === token) setNewCol(false) },
    ).then((ok) => ok && columnDraftToken.current === token)
  }

  /**
   * Writes a column set change that also rewrites papers, queued on the column chain: once `op` is
   * written, refetches the column set from Core, refetches the table's rows and shows `note`. When it
   * is rejected, the label of its reason shows as a refusal notice and the columns stay unchanged. Returns
   * whether it was written.
   */
  const writeColumnsAndCells = (op: () => Promise<RecordedChange>, note: string): Promise<boolean> =>
    writeColumns(async () => {
      const recorded = await op()
      const live = await papers.columns()
      bump()
      notice.success(note, undo.change(recorded))
      return live
    })

  /** Renames an option: every paper in the vault that holds it changes too, as one undoable change. */
  const renameOption = (key: string, from: string, to: string) =>
    writeColumnsAndCells(() => papers.renameOption(key, from, to), m.papers.notices.optionRenamed)

  /** Changes a column's type and converts every cell in the vault by its rules, as one undoable change. */
  const setColumnType = (key: string, type: PaperColumn['type']) =>
    writeColumnsAndCells(() => papers.setColumnType(key, type), m.papers.notices.columnTypeChanged)

  /**
   * What a custom cell shows: when not editing, the text of a text column inside .ci, so it truncates
   * and expands on hover like the remark cell, and chips for single- and multi-choice columns (inside
   * .ci, so they fold into +N like the topics cell when they do not fit); when editing, the input or
   * picker for the column type.
   */
  const customCell = (p: PaperRow, column: PaperColumn) => {
    const values = cellValues(p.custom[column.key])
    const editing = editingCell?.id === p.id && editingCell.key === column.key
    if (!editing) {
      if (column.type === 'text') return <span className="ci">{values[0] ?? ''}</span>
      return <span className="ci">{values.map((v) => <Tag shape="chip" className="tagchip" key={v}>{v}</Tag>)}</span>
    }
    if (column.type === 'text') {
      return (
        <TextCellEdit
          cell={editingTd} initial={values[0] ?? ''}
          onSave={(value) => holdCellSave(saveCell(p, column.key, value))}
          // Another cell may have been clicked before the write came back; close this cell only if it
          // is still the one being edited.
          onCancel={() => setEditingCell((cur) => (cur !== null && cur.id === p.id && cur.key === column.key ? null : cur))}
        />
      )
    }
    return (
      <CellPicker
        column={column} values={values} onClose={closeCell}
        onCommit={(value, created) => savePick(p, column, value, created)}
      />
    )
  }

  const cell = (p: PaperRow, c: ShownCol) => {
    if (c.column) {
      const editing = editingCell?.id === p.id && editingCell.key === c.k
      return (
        <td
          className="pt-cust" key={c.k} ref={editing ? editingTd : undefined}
          onClick={(e) => { e.stopPropagation(); openCell({ id: p.id, key: c.k }) }}
        >{customCell(p, c.column)}</td>
      )
    }
    const k = c.k
    if (k === 'short') return <td className="pt-dim" key={k}><span className="ci">{p.shortTitle ?? ''}</span></td>
    if (k === 'authors') return <td className="pt-dim" key={k}><span className="ci">{(p.authors ?? []).join(', ')}</span></td>
    if (k === 'rating') {
      return <td key={k}><RatingStars value={p.rating} onChange={(rating) => setRating(p, rating)} /></td>
    }
    if (k === 'y') return <td className="pt-dim" key={k}><span className="ci">{p.year ?? ''}</span></td>
    if (k === 'venue') return <td className="pt-dim" key={k}><span className="ci">{p.venue}</span></td>
    if (k === 'remark') {
      const editing = editingCell?.id === p.id && editingCell.key === k
      return (
        <td
          className="pt-remark" key={k} ref={editing ? editingTd : undefined}
          onClick={(event) => { event.stopPropagation(); openCell({ id: p.id, key: k }) }}
        >
          {editing
            ? (
              <TextCellEdit
                cell={editingTd} initial={p.remark ?? ''}
                onSave={(value) => holdCellSave(saveRemark(p, value))}
                onCancel={() => setEditingCell((held) => (
                  held !== null && held.id === p.id && held.key === k ? null : held
                ))}
              />
            )
            : <span className="ci">{p.remark ?? ''}</span>}
        </td>
      )
    }
    // This column is the user's own relationship with the paper, and only they change it; how far the
    // Wiki has written up the paper's page is a separate field.
    if (k === 'st') {
      return (
        <td key={k}>
          <ReadStatePicker value={p.readState} onPick={(readState) => setReadState(p, readState)} />
        </td>
      )
    }
    return (
      <td key={k}>
        <span className="ci">
          <PaperTopics
            topics={p.topics} onError={reportError} onAdd={(v) => addTopic(p, v)} onRemove={(v) => removeTopic(p, v)}
          />
        </span>
      </td>
    )
  }

  const cols: ShownCol[] = orderedColumns(columns)
    .filter((column) => column.column !== undefined || !columns.hidden.includes(column.k))
  const startColumnMove = (event: ReactDragEvent, key: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/x-meridian-column', key)
    const ghost = document.createElement('span')
    ghost.className = 'column-drag-ghost'
    document.body.append(ghost)
    event.dataTransfer.setDragImage(ghost, 0, 0)
    requestAnimationFrame(() => ghost.remove())
    setMovingColumn(key)
  }
  const dropColumn = (event: ReactDragEvent, target: string) => {
    event.preventDefault()
    event.stopPropagation()
    const source = event.dataTransfer.getData('text/x-meridian-column') || movingColumn
    setMovingColumn(null)
    setColumnDrop(null)
    if (source === null || source === target) return
    void changeColumns((base) => ({
      ...base, order: movedColumnOrder(base, source, target, columnDrop?.after ?? false),
    }))
  }
  const paperTable = (
    <div className="tblwrap" ref={tableFade} data-fade-held="left right top">
      <table ref={table} className="ptable">
        <colgroup>
          <col data-cw="t" style={{ width: `${widthOf('t')}px` }} />
          {cols.map((c) => <col key={c.k} data-cw={c.k} style={{ width: `${widthOf(c.k)}px` }} />)}
          {newCol ? <col style={{ width: `${CUSTOM_WIDTH}px` }} /> : null}
          <col data-cw="x" style={{ width: `${widthOf('x')}px` }} />
        </colgroup>
        <thead>
          <tr>
            {/* A sortable header sorts on click; its button is the keyboard's way to that click. */}
            <th data-k="title" aria-sort={ariaSort('title')} onClick={() => clickHeader('title')}>
              <button type="button" className="thsort">
                {m.papers.columns.title}{sort === 'title' ? <> <SortArrow direction={direction} /></> : null}
              </button>
              {columnGrip('t', m.papers.columns.title)}
            </th>
            {cols.map((c) => (
              <th
                key={c.k} data-k={c.sort} aria-sort={c.sort ? ariaSort(c.sort) : undefined}
                className={[
                  movingColumn === c.k ? 'column-moving' : '',
                  columnDrop?.key === c.k ? `column-drop-${columnDrop.after ? 'after' : 'before'}` : '',
                ].filter(Boolean).join(' ') || undefined}
                onDragOver={(event) => {
                  if (movingColumn !== null) {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    const bounds = event.currentTarget.getBoundingClientRect()
                    setColumnDrop({ key: c.k, after: event.clientX > bounds.left + bounds.width / 2 })
                  }
                }}
                onDrop={(event) => dropColumn(event, c.k)}
                onClick={() => { if (c.sort) clickHeader(c.sort) }}
              >
                <span
                  className="thmove" draggable
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => startColumnMove(event, c.k)}
                  onDragEnd={() => { setMovingColumn(null); setColumnDrop(null) }}
                ><IconGrip /></span>
                {c.sort
                  ? (
                    <button type="button" className="thsort">
                      {shownLabel(names.columns, c)}{sort === c.sort ? <> <SortArrow direction={direction} /></> : null}
                    </button>
                  )
                  : shownLabel(names.columns, c)}
                {columnGrip(c.k, shownLabel(names.columns, c))}
              </th>
            ))}
            {newCol
              ? (
                <NewColumnHead
                  cell={newColCell} triggers={[colAdd]} pickType
                  onCreate={createColumn}
                  onCancel={() => { columnDraftToken.current = null; setNewCol(false) }}
                />
              )
              : null}
            <th className="th-add">
              <AddAction
                variant="icon" className="colbtn" ref={colAdd} label={m.papers.columnHeader.addColumn}
                onClick={() => {
                  if (newCol) { newColCell.current?.querySelector('input')?.focus(); return }
                  setNewCol(true)
                }}
              />
              <ColumnMenu
                columns={columns} onChange={(update) => { void changeColumns(update) }}
                onRenameOption={renameOption} onRetype={setColumnType}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <ContextMenu
              key={p.id} label={m.papers.contextMenu.label(plainTitle(p.title))} className="paper-row-menu"
              trigger={(
                // The row is the toolbar of its own controls, from its title to its delete, and keeps its row role.
                <Toolbar role="row" aria-orientation={undefined}>
                  <tr
                    className={detail?.id === p.id ? 'selected' : undefined} data-row-actions=""
                    aria-current={detail?.id === p.id ? 'true' : undefined}
                    onClick={() => { void papers.get(p.id).then(setDetail).catch(reportError) }}
                    onMouseDown={holdRepeatSelection}
                    onDoubleClick={(event) => {
                      if (opensPaperFrom(event.target)) open('reader', p.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && event.target === event.currentTarget) {
                        void papers.get(p.id).then(setDetail).catch(reportError)
                      }
                    }}
                  >
                    <td className="pt-title"><ToolbarButton className="ci pt-open"><PaperText text={p.title} /></ToolbarButton></td>
                    {cols.map((c) => cell(p, c))}
                    {newCol ? <td className="pt-cust" /> : null}
                    <td className="row-actions-cell">
                      <RowActions>
                        <IconButton
                          label={m.papers.rowActions.delete} size="nested" tone="danger" className="rowx"
                          onClick={(e) => { e.stopPropagation(); remove(p.id) }}
                        ><IconTrash /></IconButton>
                      </RowActions>
                    </td>
                  </tr>
                </Toolbar>
              )}
            >
              <ContextMenuItem onSelect={() => { void papers.get(p.id).then(setDetail).catch(reportError) }}>
                {m.papers.contextMenu.openDetail}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => open('reader', p.id)}>{m.papers.contextMenu.openReader}</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem className="mi danger" onSelect={() => remove(p.id)}>
                {m.papers.contextMenu.moveToTrash}
              </ContextMenuItem>
            </ContextMenu>
          ))}
        </tbody>
      </table>
    </div>
  )

  // The group bar shows only keys the gear menu lists. A hand-edited configuration may hold an
  // unlisted key, which the gear cannot remove; drawing no option for it avoids a dead button that
  // Core would reject when clicked.
  const groupable = new Set(groupRows(columns, m.papers.groupNames).map((r) => r.key))

  return (
    <PageShell
      className="paper-library"
      onDragEnter={enterDrop} onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDragLeave={leaveDrop} onDrop={dropFiles}
    >
      {dropActive ? <div className="paper-drop"><strong>{m.papers.upload.dropToImport}</strong></div> : null}
      {/* As in the demo the title carries a count; until it arrives, the "·" and space after it are hidden. */}
      <PageHeader
        actions={(
          <>
            <FormInput
              ref={uploadInput} className="pdfupload-input" type="file" accept="application/pdf,.pdf" multiple
              onChange={(event) => {
                const files = [...(event.currentTarget.files ?? [])]
                if (files.length > 0) void uploadFiles(files)
              }}
            />
            <AddAction
              variant="page" className="pdfupload" disabled={uploading}
              onClick={() => uploadInput.current?.click()}
            >
              {uploading ? m.papers.upload.importing : m.papers.upload.importAction}
            </AddAction>
          </>
        )}
      >
        {jumpOrigin.origin === null ? null : <BackButton onClick={jumpOrigin.back} />}
        <PageTitle>{m.papers.title(titleCount)}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody className={detail ? 'libview withdetail' : 'libview'}>
        <div className="libwide">
          <PageToolbar className="paper-view-toolbar">
            <SegmentedControl
              label={m.papers.views.aria} value={view}
              options={[
                { value: 'table', label: m.papers.views.table },
                { value: 'research-map', label: m.papers.views.researchMap },
              ]}
              onChange={(next) => { setView(next); setDetail(null) }}
            />
            <div className="libbar">
              <ClearableInput
                appearance="field" wrapperClassName="paper-search"
                id="libq" placeholder={m.papers.toolbar.searchPlaceholder} autoComplete="off" value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1) }}
                onClear={() => { setQ(''); setPage(1) }} clearLabel={m.papers.toolbar.clearSearch}
              />
              {view === 'table' ? <div className="filters">
                <span className="pt-dim">{m.papers.toolbar.group}</span>
                <SegmentedControl
                  label={m.papers.toolbar.groupFieldAria}
                  value={group}
                  options={['none', ...columns.groups.filter((k) => k !== 'readState' && groupable.has(k))]
                    .map((k) => ({ value: k, label: labelOf(k) }))}
                  onChange={(value) => { setGroup(value); setSel(null); setPage(1) }}
                />
                {columns.groups.includes('readState')
                  ? (
                    <>
                      <FilterMenu
                        className="read-state-filter" name={names.columns.st}
                        label={m.papers.readState.filterAria(names.columns.st)} all={m.papers.readState.allStates}
                        options={READ_STATES.map((state) => ({ value: state, label: readStateName(m, state) }))}
                        current={group === 'readState' ? sel as ReadState | null : null}
                        onPick={(state) => {
                          setGroup(state === null ? 'none' : 'readState')
                          setSel(state)
                          setPage(1)
                        }}
                      />
                    </>
                  )
                  : null}
                <GroupMenu columns={columns} onChange={(update) => { void changeColumns(update) }} />
              </div> : null}
            </div>
          </PageToolbar>
          <ParseProgress
            onParsed={() => bump()}
            onOpenPaper={(id) => { void papers.get(id).then(setDetail).catch(reportError) }}
          />

          <div id="libList">
            {view === 'research-map'
              ? (
                <ResearchMap
                  rows={mapRows} total={mapTotal} loading={mapLoading}
                  onOpenPaper={(paper) => { void papers.get(paper.id).then(setDetail).catch(reportError) }}
                  onReadPaper={(paper) => open('reader', paper.id)}
                />
              )
              : !listed
              ? (
                <StructuredList variant="embedded" maxVisibleRows="all">
                  {facets.map((f) => {
                    const newest = m.papers.groupIndex.newest(plainTitle(f.newestTitle))
                    return (
                      <StructuredRow className="gxrow" key={f.value} onActivate={() => { setSel(f.value); setPage(1) }}>
                        <span className="gx-t">{valueName(f.value)}</span>
                        <FadeText className="gx-m" label={newest}>{newest}</FadeText>
                        <CountBadge className="n" count={f.count} />
                      </StructuredRow>
                    )
                  })}
                </StructuredList>
              )
              : (
                <>
                  {group !== 'none'
                    ? (
                      <div className="gnav">
                        <GroupValuePicker
                          current={sel} facets={facets} name={valueName} onPick={(value) => { setSel(value); setPage(1) }}
                        />
                      </div>
                    )
                    : null}
                  {paperTable}
                </>
              )}
          </div>
        </div>
      </PageBody>

      {view === 'table' && listed
        ? (
          <Pager
            total={total} page={shownPage} size={size} sizes={PAGE_SIZES}
            onPage={setPage} onSize={setSize}
            {...(detail ? { className: 'withdetail' } : {})}
          />
        )
        : null}

      <DetailPanel open={detail !== null} mode="overlay" className="paper-detail-slot">
        {detail === null
          ? null
          : (
            <div className="pdetail" ref={detailFade}>
              <div className="pd-h">
                <span className="pd-t"><PaperTitleField paper={detail} onSaved={setDetail} /></span>
                <IconButton label={m.papers.rowActions.openReader} onClick={() => open('reader', detail.id)}>
                  <IconRead />
                </IconButton>
                <PanelClose onClose={closeDetail} />
              </div>
              <PaperMetadata paper={detail} readStateLabel={names.columns.st} onSaved={setDetail} titled={false} />
              <PaperReadingSummary
                paper={detail}
                onRead={(anchor) => open('reader', detail.id, anchor)}
                onConclusions={() => open('wiki', `${PAPER_PAGE}${detail.id}`)}
              />
            </div>
          )}
      </DetailPanel>

    </PageShell>
  )
}
