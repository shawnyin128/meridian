import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react'
import type {
  Facet, ListParams, PaperCell, PaperColumn, PaperColumns, PaperRow, ReadState, SortDirection,
  SortKey,
} from '../../../shared/contract.js'
import { MAX_PDF_UPLOAD_BYTES } from '../../../shared/contract.js'
import { DEFAULT_PAPER_GROUPS, PAPER_PAGE, READ_STATES, READING_PAPER } from '../../../shared/vocabulary.js'
import { papers } from '../../ipc.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { IconCheck, IconCross, IconGrip, IconPlus, IconRead } from '../icons.js'
import { CellPicker } from './CellPicker.js'
import { NewColumnHead } from './ColumnAdd.js'
import { columnKey, takenLabel } from './column-key.js'
import { ColumnMenu } from './ColumnMenu.js'
import { GroupMenu, groupRows } from './GroupMenu.js'
import { ParseProgress } from '../ParseProgress.js'
import { Pager } from '../Pager.js'
import { PaperMetadata, RatingStars } from '../PaperMetadata.js'
import { PaperReadingSummary } from './PaperReadingSummary.js'
import { PickerPopover } from '../PickerPopover.js'
import { FormInput } from '../FormControls.js'
import { ClearableInput } from '../ClearableInput.js'
import { PageBody, PageError, PageHeader, PageShell, PageTitle, PageToolbar } from '../PageShell.js'
import { useCandidateKeys } from '../../hooks/useCandidateKeys.js'
import { NO_TRIGGERS } from '../../hooks/useOnLeave.js'
import { useInlineDraft } from '../../hooks/useInlineDraft.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import {
  useBanner, useCrumbTail, useEscapeLayer, useJump, usePaperCount, useScreen, useScreenReentry, useToast,
  useVaultRevision,
} from '../../shell/AppShell.js'
import { AddAction } from '../AddAction.js'
import { PanelClose } from '../PanelClose.js'
import { DetailPanel } from '../DetailPanel.js'
import { ActionMenu, MenuRadioGroup, MenuRadioItem, MenuSeparator } from '../ActionMenu.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '../ContextMenu.js'
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

/** The label to show for a column of the table at this time. */
function shownLabel(m: Catalog, col: ShownCol): string {
  return col.column ? col.column.label : m.papers.columns[col.k]
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

type WidthDrag = {
  x0: number
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
 * The banner for this column configuration change, or undefined when there is none. The first match
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
    <svg
      style={{ width: 9, height: 9, verticalAlign: 0 }} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d={ARROW_PATH[direction]} />
    </svg>
  )
}

/**
 * The `+` at the end of a topics cell: clicking it turns it into an input. Its candidate list shows
 * the vault's values this paper does not have yet; clicking a candidate hands it to `onAdd`, and
 * Enter, a press outside the input and its candidates, or focus leaving them hands over the
 * highlighted candidate, or the typed text when there is none. `onAdd` returns whether the write
 * completed. The input closes only then; a rejected write keeps the input and the typed text. Esc,
 * or leaving with nothing typed, closes it and drops the typed text; while a submission is pending,
 * neither an outside press nor focus leaving closes it, and no second add is sent before the first
 * one lands. The `+` button opens it with its own `setOpen(true)` and all closing goes through
 * `useInlineDraft`; Radix only positions and renders the popover and has no say in opening or
 * closing. The styling follows the demo's .tagadd/.tagin/tagSug. The candidates are fetched with
 * papers.facets each time it opens, so they are always the vault's current values.
 */
function TagAdd({ field, values, onAdd, onError }: {
  field: ChipKey
  /** Values this paper already has. */
  values: string[]
  onAdd: (value: string) => Promise<boolean>
  onError: (e: Error) => void
}) {
  const m = useMessages()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [vocab, setVocab] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setQ('')
  }, [])

  useEffect(() => {
    if (!open) return
    void papers.facets(field).then((fs) => setVocab(fs.map((f) => f.value))).catch(onError)
  }, [open, field, onError])

  const typed = q.trim()
  const needle = typed.toLowerCase()
  const hits = open
    ? vocab.filter((v) => !values.includes(v) && (!needle || v.toLowerCase().includes(needle)))
    : []
  const isNew = typed !== '' && !values.includes(typed) && !hits.some((v) => v.toLowerCase() === needle)

  // While closed the input is not rendered and its ref is null, so the outside and focus paths do nothing.
  const draft = useInlineDraft({
    row: input, triggers: NO_TRIGGERS, onCancel: close, isEmpty: () => typed === '',
    onSubmit: () => (typed === '' ? false : onAdd(hits[keys.active] ?? typed)),
  })
  const keys = useCandidateKeys(hits.length, (i) => draft.submit(() => onAdd(hits[i]!)))

  return (
    <PickerPopover
      open={open} anchorRef={input} stopClickPropagation
      anchor={open
        ? (
          <FormInput
            className="tagin" ref={input} value={q} {...draft.inputProps}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { keys.onKeyDown(e); draft.inputProps.onKeyDown(e) }}
          />
        )
        : (
          <AddAction
            variant="icon" className="tagchip tagadd" title={m.papers.tags.add}
            onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          />
        )}
      content={hits.length > 0 || isNew
        ? (
          <>
              {hits.length > 0 ? <div className="rh">{m.papers.tags.existingTopics}</div> : null}
              {hits.map((v, i) => (
                <div
                  className={i === keys.active ? 'rrow on' : 'rrow'} key={v}
                  onClick={() => draft.submit(() => onAdd(v))}
                >{v}</div>
              ))}
              {isNew
                ? (
                  <div className="rrow mk" onClick={() => draft.submit(() => onAdd(typed))}>
                    <IconPlus />
                    <span className="tagchip">{typed}</span>
                  </div>
                )
                : null}
          </>
        )
        : null}
    />
  )
}

/**
 * The reading status in a Status cell: clicking it opens the four statuses, and picking one writes it
 * back to this paper. The styling is the demo's .stchip and the popover it opens; Radix owns opening
 * and closing. The "Reading" status is highlighted in the table, as in the demo.
 */
function ReadStateChip({ current, onPick }: {
  current: ReadState
  onPick: (readState: ReadState) => void
}) {
  return (
    <ActionMenu
      trigger={(
        <button
          type="button" className={current === READING_PAPER ? 'stchip on' : 'stchip'}
          onClick={(e) => e.stopPropagation()}
        >{current}</button>
      )}
      align="start" stopContentClickPropagation
    >
      <MenuRadioGroup value={current}>
        {READ_STATES.map((s) => (
          <MenuRadioItem key={s} value={s} onSelect={() => onPick(s)}>
            <span className="ck">{s === current ? <IconCheck /> : null}</span>
            {s}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ActionMenu>
  )
}

/**
 * The reading status shortcut in the paper library toolbar. It applies the existing readState facet
 * instead of adding a second "unread" area.
 */
function ReadStateFilter({ current, onPick }: {
  current: ReadState | null
  onPick: (readState: ReadState | null) => void
}) {
  const m = useMessages()
  return (
    <ActionMenu
      trigger={(
        <button
          type="button"
          className={current === null ? 'btn plain read-state-filter' : 'btn plain read-state-filter on'}
          aria-label={m.papers.readState.filterAria}
        >{current ?? m.papers.readState.filterLabel}</button>
      )}
    >
      <MenuRadioGroup value={current ?? 'all'}>
        <MenuRadioItem value="all" onSelect={() => onPick(null)}>
          <span className="ck">{current === null ? <IconCheck /> : null}</span>
          {m.papers.readState.allStates}
        </MenuRadioItem>
        <MenuSeparator />
        {READ_STATES.map((state) => (
          <MenuRadioItem key={state} value={state} onSelect={() => onPick(state)}>
            <span className="ck">{state === current ? <IconCheck /> : null}</span>
            {state}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </ActionMenu>
  )
}

/**
 * Double-clicking a row's blank space or text opens the reader; buttons and editors inside a cell
 * keep their own double-click behaviour.
 */
function opensPaperFrom(target: EventTarget | null): boolean {
  return !(target instanceof Element)
    || target.closest('button, input, select, textarea, [contenteditable="true"]') === null
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
 * leaves only that paper in the table.
 */
export function PaperTable() {
  const m = useMessages()
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
  const [rowMenu, setRowMenu] = useState<{ paper: PaperRow; x: number; y: number } | null>(null)
  const drag = useRef<WidthDrag | null>(null)
  const dragged = useRef(false)
  const table = useRef<HTMLTableElement>(null)
  const consumed = useRef(0)
  // Write queue of the cell being edited: each link resolves to the values the previous step settled
  // on, or to null when a step failed, which voids this pick so it is not sent.
  const queue = useRef<{
    cell: { id: string; key: string }
    chain: Promise<string[] | null>
  } | null>(null)

  const banner = useBanner()
  const toast = useToast()
  const paperCount = usePaperCount()
  const screen = useScreen()
  const { jump, open } = useJump()
  // The revision is bumped after a write so the grouping and row-fetch effects run again, like the
  // demo's renderLibRows call after a submit.
  const { revision, bump } = useVaultRevision()
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const closeDetail = useCallback(() => setDetail(null), [])
  const write = useVaultWrite()
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
  // first page, like `go` in the demo's search.
  useEffect(() => {
    if (jump === null || jump.seq === consumed.current) return
    consumed.current = jump.seq
    setQ(jump.target)
    setPage(1)
  }, [jump])

  const backToValues = useCallback(() => { setSel(null); setPage(1) }, [])
  const backToUngrouped = useCallback(() => { setGroup('none'); setSel(null); setPage(1) }, [])

  /** A grouping's name in the UI: a custom column's label, else the built-in group name, else the key. */
  // groupNames is a plain object; without the hasOwn check, keys such as toString would return
  // functions from Object.prototype.
  const labelOf = (key: string) => columns.custom.find((c) => c.key === key)?.label
    ?? (Object.hasOwn(m.papers.groupNames, key) ? m.papers.groupNames[key as keyof typeof m.papers.groupNames] : key)

  useCrumbTail(useMemo(() => {
    if (view === 'research-map') return []
    if (group === 'none') return []
    // Same lookup order as labelOf. labelOf is a new function every render, and as a dependency it
    // would reset the breadcrumbs every frame.
    const label = columns.custom.find((c) => c.key === group)?.label
      ?? (Object.hasOwn(m.papers.groupNames, group)
        ? m.papers.groupNames[group as keyof typeof m.papers.groupNames] : group)
    return sel === null ? [{ text: label }] : [{ text: label, onClick: backToValues }, { text: sel }]
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

  // A drag moves the boundary between two columns: the left column and its right neighbour grow and
  // shrink by the same amount, so the total width stays fixed and columns further right do not move.
  // A drag first freezes the widths the browser actually shows, so the slack left by width:100% is
  // not redistributed across the table.
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      const raw = e.clientX - d.x0
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
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      dragged.current = true
      setWidths({
        ...d.widths,
        [d.left.key]: d.left.width,
        ...(d.right === undefined ? {} : { [d.right.key]: d.right.width }),
      })
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
  }, [])

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
        badge.className = 'morebadge'
        const setExpanded = (expanded: boolean) => {
          ci.dataset['expanded'] = String(expanded)
          ci.classList.toggle('chip-expanded', expanded)
          badge.textContent = expanded ? '−' : `+${real}`
          badge.title = expanded ? m.common.details.collapse : m.papers.tags.showMore(real)
          badge.setAttribute('aria-label', badge.title)
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

  const startDrag = (e: ReactMouseEvent, k: string) => {
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
    const keys = ['t', ...cols.map((column) => column.k), 'x']
    const rightKey = keys[keys.indexOf(k) + 1]
    const leftWidth = measured[k] ?? widthOf(k)
    const rightWidth = rightKey === undefined ? undefined : measured[rightKey] ?? widthOf(rightKey)
    drag.current = {
      x0: e.clientX,
      widths: measured,
      left: { key: k, initial: leftWidth, width: leftWidth },
      ...(rightKey === undefined || rightWidth === undefined
        ? {}
        : { right: { key: rightKey, initial: rightWidth, width: rightWidth } }),
    }
    e.preventDefault()
  }

  const clickHeader = (e: ReactMouseEvent, key: SortKey) => {
    if (dragged.current || (e.target as HTMLElement).closest('.thgrip')) {
      dragged.current = false
      return
    }
    if (sort === key) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setDirection(key === 'year' ? 'desc' : 'asc')
    }
  }
  const ariaSort = (key: SortKey) => (sort !== key ? undefined : direction === 'asc' ? 'ascending' : 'descending')

  const addTopic = (p: PaperRow, value: string): Promise<boolean> =>
    write(papers.update(p.id, { topics: [...p.topics, value] }), { note: m.papers.notices.topicAdded })

  const setReadState = (p: PaperRow, readState: ReadState) => {
    void write(papers.update(p.id, { readState }), { note: m.papers.notices.readStateUpdated })
  }

  const setRating = (p: PaperRow, rating: number) => {
    void write(papers.update(p.id, { rating }), { note: m.papers.notices.rated(rating) })
  }

  const remove = (id: string) => {
    // As in the demo, a delete shortens the list by one item, so the page number clamps back in the
    // same frame instead of drawing an empty list first.
    void write(papers.delete(id).then(() => {
      if (detail?.id === id) setDetail(null)
      setTotal((t) => t - 1)
    }), { note: m.common.trashed })
  }

  /**
   * The browser file picker gives the renderer only a copy of the File the user explicitly chose. Its
   * content goes to Core as a structured-cloned Uint8Array; the paper's vault identity, checksum and
   * disk writes all stay in Core. On success, the new paper shows in the table with its details open.
   */
  const uploadPdf = async (file: File) => {
    if (file.size > MAX_PDF_UPLOAD_BYTES) {
      toast(m.papers.upload.tooLarge)
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
      banner(result.kind === 'added' ? m.papers.upload.addedParsing : m.papers.upload.alreadyInLibrary)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUploading(false)
      if (uploadInput.current !== null) uploadInput.current.value = ''
    }
  }

  const uploadFiles = async (files: File[]) => {
    const pdfs = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) { toast(m.papers.upload.dropPdfOnly); return }
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
      { note: m.papers.notices.updated })
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
   * shows the banner. If any step is rejected, this pick writes nothing further and the cell's column
   * and row are refetched from Core to correct it; the unsent picks queued after it are voided too,
   * and the whole sequence shows one toast. Consecutive picks in the same cell each compute their
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
      }), { note: m.papers.notices.updated })
      if (ok) {
        if (column.type === 'select') closeCell()
        return next
      }
      // Rejected: this cell's assumptions no longer match Core, so refetch it; the rejected step
      // already showed the toast.
      clearIfLatest()
      bump()
      return null
    }).catch((e: Error) => { clearIfLatest(); toast(e.message); return null })
    const entry = { cell: q.cell, chain }
    queue.current = entry
    return chain.then((settled) => settled !== null)
  }

  /**
   * Queues a column set change at the end of the column chain. When its turn comes, `step` receives
   * Core's last confirmed column set, does its own write and returns the written column set, which
   * then takes effect; `onApplied` (if given) is called synchronously at that moment, and the result
   * is true. When `step` throws or rejects, its original message shows as a toast, the column set is
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
        toast((e as Error).message)
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
   * shows its banner, and drops a deleted column's width along with the column. Returns whether it was
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
    if (note !== undefined) banner(note)
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
    const builtinLabels = [m.papers.columns.title, ...COLUMNS.map((c) => m.papers.columns[c.k])]
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
   * is rejected, Core's original message shows as a toast and the columns stay unchanged. Returns
   * whether it was written.
   */
  const writeColumnsAndCells = (op: () => Promise<void>, note: string): Promise<boolean> =>
    writeColumns(async () => {
      await op()
      const live = await papers.columns()
      bump()
      banner(note)
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
      return <span className="ci">{values.map((v) => <span className="tagchip" key={v}>{v}</span>)}</span>
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
          <ReadStateChip
            current={p.readState}
            onPick={(readState) => setReadState(p, readState)}
          />
        </td>
      )
    }
    return (
      <td key={k}>
        <span className="ci">
          {p.topics.map((v) => <span className="tagchip" key={v}>{v}</span>)}
          <TagAdd field={k} values={p.topics} onError={reportError} onAdd={(v) => addTopic(p, v)} />
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
    <div className="tblwrap">
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
            <th data-k="title" aria-sort={ariaSort('title')} onClick={(e) => clickHeader(e, 'title')}>
              <button type="button" className="thsort">
                {m.papers.columns.title}{sort === 'title' ? <> <SortArrow direction={direction} /></> : null}
              </button>
              <span className="thgrip" title={m.papers.columnHeader.resizeHint} onMouseDown={(e) => startDrag(e, 't')} />
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
                onClick={(e) => { if (c.sort) clickHeader(e, c.sort) }}
              >
                <span
                  className="thmove" draggable title={m.papers.columnHeader.reorderHint}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => startColumnMove(event, c.k)}
                  onDragEnd={() => { setMovingColumn(null); setColumnDrop(null) }}
                ><IconGrip /></span>
                {c.sort
                  ? (
                    <button type="button" className="thsort">
                      {shownLabel(m, c)}{sort === c.sort ? <> <SortArrow direction={direction} /></> : null}
                    </button>
                  )
                  : shownLabel(m, c)}
                <span className="thgrip" title={m.papers.columnHeader.resizeHint} onMouseDown={(e) => startDrag(e, c.k)} />
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
                variant="icon" className="colbtn" ref={colAdd} title={m.papers.columnHeader.addColumn}
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
            <tr
              key={p.id} tabIndex={0} className={detail?.id === p.id ? 'selected' : undefined}
              aria-current={detail?.id === p.id ? 'true' : undefined}
              onClick={() => { void papers.get(p.id).then(setDetail).catch(reportError) }}
              onDoubleClick={(event) => {
                if (opensPaperFrom(event.target)) open('reader', p.id)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setRowMenu({ paper: p, x: event.clientX, y: event.clientY })
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.target === event.currentTarget) {
                  void papers.get(p.id).then(setDetail).catch(reportError)
                  return
                }
                if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
                event.preventDefault()
                const bounds = event.currentTarget.getBoundingClientRect()
                setRowMenu({ paper: p, x: bounds.left + 24, y: bounds.top + 24 })
              }}
            >
              <td className="pt-title"><span className="ci"><PaperText text={p.title} /></span></td>
              {cols.map((c) => cell(p, c))}
              {newCol ? <td className="pt-cust" /> : null}
              <td>
                <button
                  className="rowx" title={m.papers.rowActions.delete}
                  onClick={(e) => { e.stopPropagation(); remove(p.id) }}
                >
                  <IconCross />
                </button>
              </td>
            </tr>
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
      <PageHeader>
        <PageTitle>{m.papers.title(titleCount)}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody className={detail ? 'libview withdetail' : 'libview'}>
        <div className="libwide">
          <PageToolbar className="paper-view-toolbar">
            <SegmentedControl
              size="sm" label={m.papers.views.aria} value={view}
              options={[
                { value: 'table', label: m.papers.views.table },
                { value: 'research-map', label: m.papers.views.researchMap },
              ]}
              onChange={(next) => { setView(next); setDetail(null) }}
            />
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
          </PageToolbar>
          <ParseProgress
            onParsed={() => bump()}
          />
          <div className="libbar">
            <ClearableInput
              appearance="field" wrapperClassName="paper-search"
              id="libq" placeholder={m.papers.toolbar.searchPlaceholder} autoComplete="off" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1) }}
              onClear={() => { setQ(''); setPage(1) }} clearLabel={m.papers.toolbar.clearSearch}
            />
            {view === 'table' ? <div className="filters" style={{ margin: 0 }}>
              <span className="pt-dim" style={{ fontSize: 12 }}>{m.papers.toolbar.group}</span>
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
                    <span className="pt-dim" style={{ fontSize: 12 }}>{m.papers.toolbar.filter}</span>
                    <ReadStateFilter
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

          <div id="libList">
            {view === 'research-map'
              ? (
                <ResearchMap
                  rows={mapRows} total={mapTotal} loading={mapLoading}
                  onOpenPaper={(paper) => { void papers.get(paper.id).then(setDetail).catch(reportError) }}
                />
              )
              : !listed
              ? (
                <>
                  {facets.map((f) => (
                    <button
                      type="button" className="gxrow" key={f.value} onClick={() => { setSel(f.value); setPage(1) }}
                    >
                      <span className="gx-t">{f.value}</span>
                      <span className="gx-m">
                        {m.papers.groupIndex.newest(
                          `${plainTitle(f.newestTitle).slice(0, 44)}${plainTitle(f.newestTitle).length > 44 ? '…' : ''}`,
                        )}
                      </span>
                      <span className="n">{f.count}</span>
                    </button>
                  ))}
                  <div className="lmore">{m.papers.groupIndex.pickToView(labelOf(group))}</div>
                </>
              )
              : (
                <>
                  {group !== 'none'
                    ? (
                      <div className="gnav">
                        <button className="btn plain" id="gxBack" onClick={backToValues}>
                          ‹ {labelOf(group)}
                        </button>
                        <SegmentedControl
                          label={m.papers.toolbar.groupValueAria}
                          value={sel ?? ''}
                          options={facets.map((f) => ({ value: f.value, label: `${f.value}(${f.count})` }))}
                          onChange={(value) => { setSel(value); setPage(1) }}
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
            <div className="pdetail">
              <div className="pd-h">
                <span className="pd-t"><PaperText text={detail.title} /></span>
                <button className="icbtn" title={m.papers.rowActions.openReader} onClick={() => open('reader', detail.id)}>
                  <IconRead />
                </button>
                <PanelClose onClose={closeDetail} />
              </div>
              <PaperMetadata paper={detail} onSaved={setDetail} />
              <PaperReadingSummary
                paper={detail}
                onRead={(anchor) => open('reader', detail.id, anchor)}
                onConclusions={() => open('wiki', `${PAPER_PAGE}${detail.id}`)}
              />
            </div>
          )}
      </DetailPanel>

      {rowMenu === null
        ? null
        : (
          <ContextMenu
            point={{ x: rowMenu.x, y: rowMenu.y }} label={m.papers.contextMenu.label(plainTitle(rowMenu.paper.title))}
            className="paper-row-menu" onClose={() => setRowMenu(null)}
          >
          <ContextMenuItem
            onClick={() => {
              const id = rowMenu.paper.id
              setRowMenu(null)
              void papers.get(id).then(setDetail).catch(reportError)
            }}
          >{m.papers.contextMenu.openDetail}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="danger"
            onClick={() => { const id = rowMenu.paper.id; setRowMenu(null); remove(id) }}
          >{m.papers.contextMenu.moveToTrash}</ContextMenuItem>
          </ContextMenu>
        )}
    </PageShell>
  )
}
