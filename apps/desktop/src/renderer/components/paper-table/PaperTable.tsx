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
import { NO_TRIGGERS } from '../../hooks/useCancelOnOutside.js'
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
import { ResearchMap } from './ResearchMap.js'
import './PaperTable.css'

type ChipKey = 'topics'
/** The title column is rendered separately in the table, and the BodyKey is a built-in column to the right of it. */
export type BodyKey = 'short' | 'authors' | 'y' | 'venue' | 'rating' | 'st' | 'remark' | ChipKey
type ColKey = 't' | BodyKey | 'x'

/** A column drawn on the table at this time. Custom columns come with their type and options, and are not sorted. Labels are not stored here: they come from the catalog for a built-in column, or `column.label` for a custom one. */
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

/** Width of the last column: The delete button at the end of the row shares this column with the column + at the end of the table header and the column setting gear. */
const ROWX_WIDTH = 52

const DEFAULT_WIDTHS: Record<ColKey, number> = {
  t: 300, short: 150, rating: 104, authors: 160, y: 104, venue: 120, topics: 240, st: 78,
  remark: 220,
  x: ROWX_WIDTH,
}

/** The column width of the custom column is the same as the demo: columns that have not been measured will always be this wide. */
const CUSTOM_WIDTH = 140
const MIN_COLUMN_WIDTH = 56

/** Lower limit when manually dragging; window scaling can still be made proportionally narrower by the browser. */
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

/** The values filled in a cell at the moment: the text column and the selection column store one value, the multi-select column stores one column, and the unfilled ones are not in the mapping. */
function cellValues(held: PaperCell | undefined): string[] {
  return held === undefined ? [] : Array.isArray(held) ? held : [held]
}

/**
 * This time the column configuration changes which banner should be reported, and if there is no one to report, it will be undefined. Five levels are selected in order: deleted columns, added columns,
 * The name was changed, the grouping was changed, and only the options were changed.
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

/** The complete order of all columns except the title; the old configuration can only remember part of it, and the missing items are added at the end in the order of declaration. */
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
 * The `+` at the end of the label grid: click to open it and change it to the input box. The association layer lists the values ​​that are not in this article in the entire library. Press Enter or click the association item.
 * Handed to `onAdd`. `onAdd` returns whether the writing is completed: it is closed only after the writing is completed. When the writing is rejected, the input box and the typed words are kept. Esc,
 * Click outside the input box and association layer, and when the focus leaves them, they will be folded, and the typed words will not be retained; when submitting on the way, clicking outside and leaving the focus will not
 * Put it away, and don’t post it a second time before adding it once. Open is the `+` button's own `setOpen(true)`, close all to
 * `useInlineDraft`, Radix only handles floating layer positioning and rendering, and does not participate in opening and closing decisions; the vision is for demo.
 * .tagadd/.tagin/tagSug.
 * The association word list is only fetched by papers.facets when it is opened, so what you see every time is the current value of the entire database.
 */
function TagAdd({ field, values, onAdd, onError }: {
  field: ChipKey
  /** Values already available in this article. */
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

  // When closed, the input box is not rendered, the input is empty, and the out-of-focus and out-of-focus paths are ignored.
  const draft = useInlineDraft({
    row: input, triggers: NO_TRIGGERS, onCancel: close,
    onSubmit: () => (typed === '' ? false : onAdd(typed)),
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
 * Reading status in the status grid: Click to open and list four files, select one to write back to this article. The visual is demo's .stchip with it
 * The one you click on selects the elastic layer, and the opening and closing belongs to Radix. The "Reading" file is marked separately on the table, the same as demo.
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

/** The reading status shortcut in the top column of the paper library; it falls directly into the existing readState facet without creating a second set of "unread areas". */
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

/** Double-click the blank space or text of the row to open the reader; buttons and editors within the grid retain their own double-click semantics. */
function opensPaperFrom(target: EventTarget | null): boolean {
  return !(target instanceof Element)
    || target.closest('button, input, select, textarea, [contenteditable="true"]') === null
}

/**
 * In-place editing of the text column: press Enter to hand over the words in the input box to `onSave`, Esc, click outside the `cell` or leave the focus
 * In this frame, `onCancel` is adjusted, and the typed words are not written. `onSave` returns whether this cell is used up this time.
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
 * Paper library table: filtering and grouping, paging, column width dragging, freezing the first column and table header, hovering over long cells to expand in place,
 * Click on a row to open the details panel, add a label at the end of the label grid, delete the end of the row, manage columns in the column menu at the end of the table header, and customize columns by type
 * To different grid editors. form forever
 * Only holds the current page: papers.list is obtained by page, grouping values and counting are obtained by papers.facets,
 * Which columns are displayed are retrieved from papers.columns.
 * When another screen jumps in, it falls on the title of that article: the title enters the filter box, and it is the only one left in the table.
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
  // The last confirmed column set of core: each step in the column set chain counts it as its own write, and does not count the columns in the closure at the moment of rendering.
  const confirmedColumns = useRef(columns)
  // The tail of the chain of column sets: the writing of retrieving column configurations and changing column sets are arranged behind it. Only when the previous one is settled, it is the turn of the next one.
  const columnChain = useRef<Promise<unknown>>(Promise.resolve())
  const [newCol, setNewCol] = useState(false)
  const colAdd = useRef<HTMLButtonElement>(null)
  const newColCell = useRef<HTMLTableCellElement>(null)
  // The identity of this column creation attempt; if the placeholder is closed in any way (Esc, click outside, focus away, details panel opened), it will be replaced by null
  const columnDraftToken = useRef<object | null>(null)
  // The custom grid being edited in place
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
  // The writing queue of the cell being edited: the value uploaded in the chain is the value settled in the previous step. If it is broken, null will be passed - if it is broken, it will be invalid this time and will not be sent.
  const queue = useRef<{
    cell: { id: string; key: string }
    chain: Promise<string[] | null>
  } | null>(null)

  const banner = useBanner()
  const toast = useToast()
  const paperCount = usePaperCount()
  const screen = useScreen()
  const { jump, open } = useJump()
  // It is incremented after the write operation, so that the two effects of grouping and fetching are run again, corresponding to the renderLibRows adjusted after the demo is submitted.
  const { revision, bump } = useVaultRevision()
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const closeDetail = useCallback(() => setDetail(null), [])
  const write = useVaultWrite()
  const detailId = detail?.id

  // The writing (hanging project) on the details panel only allows the entire library version to be incremented, and the open article must be retrieved from the library.
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
  // The demo's pagerHTML clips the page number back to the last page when rendering, and does not wait for the number to come back before correcting it.
  const shownPage = Math.min(page, pageCount)

  // In ordinary grouping, select a value first. Before selection, there is only the index layer, no rows are taken, and no paging bar is displayed. After filtering, when there is no row left for the selected value.
  // Also returns the index level. The reading status is a direct filter. When a status that is currently 0 is selected, an empty table will be drawn instead of a grouped index.
  const listed = group === 'none'
    || (sel !== null && (group === 'readState' || facets.some((f) => f.value === sel)))

  useEffect(() => {
    // The fetched column configuration is also arranged into the chain of the column set: once it is written on the road, wait until it lands before sending it. The returned configuration is the basis for subsequent write calculation loads.
    columnChain.current = columnChain.current.then(() => papers.columns().then((live) => {
      confirmedColumns.current = live
      setColumns(live)
    }).catch(reportError))
  }, [revision, reportError])

  // When editing a cell, the write queue of the previous cell will be discarded, and the first submission of the next cell will be restarted according to the current column configuration and row.
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

  // When jumped from another screen, the landing point is the title of a paper. Fill in the filter box and return to the first page. It is the same as go in the demo search.
  useEffect(() => {
    if (jump === null || jump.seq === consumed.current) return
    consumed.current = jump.seq
    setQ(jump.target)
    setPage(1)
  }, [jump])

  const backToValues = useCallback(() => { setSel(null); setPage(1) }, [])
  const backToUngrouped = useCallback(() => { setGroup('none'); setSel(null); setPage(1) }, [])

  /** What is this grouping called on the interface: the column name of the custom column takes precedence, and then the built-in field table is checked, it is not the key itself. */
  // groupNames is an ordinary object. If hasOwn is not checked, keys such as toString will get the function on Object.prototype.
  const labelOf = (key: string) => columns.custom.find((c) => c.key === key)?.label
    ?? (Object.hasOwn(m.papers.groupNames, key) ? m.papers.groupNames[key as keyof typeof m.papers.groupNames] : key)

  useCrumbTail(useMemo(() => {
    if (view === 'research-map') return []
    if (group === 'none') return []
    // The order of table lookup is consistent with labelOf; labelOf is a new reference every time it is rendered, and entering the dependency array will cause the breadcrumbs to be reset every frame.
    const label = columns.custom.find((c) => c.key === group)?.label
      ?? (Object.hasOwn(m.papers.groupNames, group)
        ? m.papers.groupNames[group as keyof typeof m.papers.groupNames] : group)
    return sel === null ? [{ text: label }] : [{ text: label, onClick: backToValues }, { text: sel }]
  }, [view, group, sel, columns, backToValues, m]), backToUngrouped)

  // When grouping by a certain column, it is unchecked, deleted, or changed to a text column: return "None" on the spot
  useEffect(() => {
    if (group !== 'none' && !columns.groups.includes(group)) {
      setGroup('none')
      setSel(null)
      setPage(1)
    }
  }, [columns, group])

  useEscapeLayer(detail !== null, closeDetail)

  // What is dragged is the dividing line between the two columns: the left column and the adjacent right column increase and decrease, the total width remains unchanged, and the column further to the right will not follow.
  // When starting to drag, first freeze the width of each column actually displayed by the browser to prevent the space left by width:100% from being re-distributed to the entire table.
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
        // The first label is always retained and is truncated if necessary.
        if (i === 0) return
        if (hidden > 0 || chip.getBoundingClientRect().right > limit) {
          chip.classList.add('hid')
          hidden++
          // The + at the end is not the content, and it will not be counted as +N if it is folded in.
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

  /** How wide is this column now? The dragged columns are dragged out, the built-in columns that have not been dragged are DEFAULT_WIDTHS, and the custom columns are all 140. */
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

  const addTopic = (p: PaperRow, value: string): Promise<boolean> =>
    write(papers.update(p.id, { topics: [...p.topics, value] }), { note: m.papers.notices.topicAdded })

  const setReadState = (p: PaperRow, readState: ReadState) => {
    void write(papers.update(p.id, { readState }), { note: m.papers.notices.readStateUpdated })
  }

  const setRating = (p: PaperRow, rating: number) => {
    void write(papers.update(p.id, { rating }), { note: m.papers.notices.rated(rating) })
  }

  const remove = (id: string) => {
    // After deleting the demo, the length of the list will be reduced by one item. The page numbers will be clipped back in the same frame, and an empty list will not be drawn first.
    void write(papers.delete(id).then(() => {
      if (detail?.id === id) setDetail(null)
      setTotal((t) => t - 1)
    }), { note: m.common.trashed })
  }

  /**
   * The browser file selector only gives the Renderer a copy of the File explicitly selected by the user; the content is cloned in a Uint8Array structure
   * To Core, the warehousing identity, checksums, and disk writes all stay in Core. After success, drop the new paper in the table and open the details.
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

  /** Close the frame you are editing. */
  const closeCell = () => {
    setEditingCell(null)
  }

  /**
   * When the text cell is entered: if the value does not change, just close it, otherwise write back to this cell. Return this time to see if this space has been used up - no change or
   * It is true if it is written, and it is false if it is rejected.
   */
  const saveCell = (p: PaperRow, k: string, value: string): boolean | Promise<boolean> => {
    if (value.trim() === (p.custom[k] ?? '')) return true
    return write(papers.update(p.id, { custom: { [k]: value.trim() === '' ? null : value.trim() } }),
      { note: m.papers.notices.updated })
  }

  /** Edit an essay: Write it into the reading record, which is the same paragraph as the right column of the reader, and do not record recent changes. */
  const saveRemark = (p: PaperRow, value: string): boolean | Promise<boolean> => {
    if (value.trim() === (p.remark ?? '').replace(/[\r\n]/g, '').trim()) return true
    return write(papers.mutateReading(p.id, { kind: 'remark.set', text: value }), {
      note: m.papers.notices.remarkSaved,
    })
  }

  /**
   * Write back the option that moved up this cell: `created` is true, first add it to this column (arrange it into the chain of the column set, click on that moment
   * The confirmed column set is calculated), and then `papers.update` changes this grid - replace the single-select column with it, and move it again. The current value is cleared, and the multi-select column
   * Be added or removed. After writing the single selection, close the editing state, keep the multiple selections and continue to choose; write it as a newspaper banner. If any step is rejected, I will not write further this time.
   * Re-acquire the columns and rows of this grid from core to correct it. The unsent selections behind it are also invalidated. Only one toast is reported in the whole process.
   * When the same grid is submitted consecutively, the next calculation will be done after it is its turn and the previous one is really settled, instead of calculating the value at the moment of submission.
   */
  const savePick = (p: PaperRow, column: PaperColumn, value: string, created: boolean) => {
    const q = queue.current?.cell.id === p.id && queue.current.cell.key === column.key
      ? queue.current
      : {
        cell: { id: p.id, key: column.key },
        chain: Promise.resolve<string[] | null>(cellValues(p.custom[column.key])),
      }
    // The queue will be reset to zero only when the last person in the queue is selected, and the next new selection will start from the current row again.
    // You won't always be stuck in "cancel" - the callback itself must return to zero when it throws an error and reaches the following catch, otherwise all subsequent selections in this cell will be silently canceled.
    const clearIfLatest = () => { if (queue.current === entry) queue.current = null }
    const chain: Promise<string[] | null> = q.chain.then(async (values) => {
      // Whichever step in the previous row is broken will be invalidated this time and will not be issued - that step is already being retaken from core to correct this grid.
      if (values === null) { clearIfLatest(); return null }
      const next = values.includes(value)
        ? values.filter((v) => v !== value)
        : column.type === 'select' ? [value] : [...values, value]
      // Core's write verification takes the column's options and compares the value of the grid. New options must be listed first, and then written into the grid.
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
      // Rejected: The assumption in this box no longer matches the core, so it is better to retake it here; the toast has been reported from the rejected step.
      clearIfLatest()
      bump()
      return null
    }).catch((e: Error) => { clearIfLatest(); toast(e.message); return null })
    const entry = { cell: q.cell, chain }
    queue.current = entry
  }

  /**
   * Arrange a column set change to the end of the chain: when it is its turn, hand over the core's last confirmed column set to `step`, `step` to do its own writing
   * And hand back the written column set. Once it is done, let it take effect, call `onApplied` (if given) synchronously at the same moment, and return true; `step`
   * When throwing or rejecting, report the original message as a toast, retrieve a correction from the core, and return false. The next step always waits for the previous step together with its
   * Start after all corrections are settled.
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
   * A change in the column configuration: queue into the chain of column sets, press `update` when it is your turn to calculate the new configuration from the last confirmed column set and hand it to the core;
   * It will take effect only after it is written (`onApplied` is called synchronously at the same moment), the banner will be displayed, and the deleted column will be lost together with its column width. Return is written as no.
   */
  const changeColumns = (
    update: (base: PaperColumns) => PaperColumns, onApplied?: () => void,
  ): Promise<boolean> => writeColumns(async (base) => {
    const next = update(base)
    await papers.setColumns(next)
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
   * The column name filled in at the end of the table header and the selected type: arranged in a chain of column sets. When it is your turn, write one column at a time. The key is confirmed at that moment.
   * Column aggregation calculation. Return to see if the placeholder is used up: the column name is empty and the same name as the current column on the table is false; otherwise, the column is created this time
   * It was written, and the space was not abandoned before it was written.
   */
  const createColumn = (label: string, type: PaperColumn['type']): boolean | Promise<boolean> => {
    const builtinLabels = [m.papers.columns.title, ...COLUMNS.map((c) => m.papers.columns[c.k])]
    if (label === '' || takenLabel(label, columns, builtinLabels)) return false
    const token = {}
    columnDraftToken.current = token
    return changeColumns(
      (base) => ({ ...base, custom: [...base.custom, { key: columnKey(label, base), label, type, options: [] }] }),
      // Collect the placeholder in the same submission as the new column; if it has been abandoned this time (the token has been replaced), the placeholder is no longer there, and the newly opened one will not be collected.
      () => { if (columnDraftToken.current === token) setNewCol(false) },
    ).then((ok) => ok && columnDraftToken.current === token)
  }

  /**
   * Write the column set that is modified together with the paper at once: arrange the chain into the column set. After `op` is written, retrieve the column set from core, re-fetch the rows on the table and report
   * `note`; When the toast is rejected, the original message of core will be reported, and the column will remain unchanged. Return is written as no.
   */
  const writeColumnsAndCells = (op: () => Promise<void>, note: string): Promise<boolean> =>
    writeColumns(async () => {
      await op()
      const live = await papers.columns()
      bump()
      banner(note)
      return live
    })

  /** Changing the name of an option: All papers filled with it in the database are changed together, which is considered an undoable change. */
  const renameOption = (key: string, from: string, to: string) =>
    writeColumnsAndCells(() => papers.renameOption(key, from, to), m.papers.notices.optionRenamed)

  /** Change the type of a column: All cells in the library are changed together according to the conversion rules, which is considered an undoable change. */
  const setColumnType = (key: string, type: PaperColumn['type']) =>
    writeColumnsAndCells(() => papers.setColumnType(key, type), m.papers.notices.columnTypeChanged)

  /**
   * What is drawn in the custom grid: when not editing, the text column is given to plain text, and the selection and multi-select columns are given to chip (put it into .ci, so
   * If it cannot fit, it will be folded like the theme grid and filled with +N); when editing, press the type to the input box or selector.
   */
  const customCell = (p: PaperRow, column: PaperColumn) => {
    const values = cellValues(p.custom[column.key])
    const editing = editingCell?.id === p.id && editingCell.key === column.key
    if (!editing) {
      if (column.type === 'text') return values[0] ?? ''
      return <span className="ci">{values.map((v) => <span className="tagchip" key={v}>{v}</span>)}</span>
    }
    if (column.type === 'text') {
      return (
        <TextCellEdit
          cell={editingTd} initial={values[0] ?? ''}
          onSave={(value) => saveCell(p, column.key, value)}
          // You may have clicked on other cells before writing back. Only close this cell when it is still the current editing target.
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
          onClick={(e) => { e.stopPropagation(); setEditingCell({ id: p.id, key: c.k }) }}
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
          onClick={(event) => { event.stopPropagation(); setEditingCell({ id: p.id, key: k }) }}
        >
          {editing
            ? (
              <TextCellEdit
                cell={editingTd} initial={p.remark ?? ''}
                onSave={(value) => saveRemark(p, value)}
                onCancel={() => setEditingCell((held) => (
                  held !== null && held.id === p.id && held.key === k ? null : held
                ))}
              />
            )
            : <span className="ci">{p.remark ?? ''}</span>}
        </td>
      )
    }
    // This column describes your relationship with this article, and it is up to you to change it; to what extent the wiki has edited this page is another field.
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
            <th data-k="title" onClick={(e) => clickHeader(e, 'title')}>
              {m.papers.columns.title}{sort === 'title' ? <> <SortArrow direction={direction} /></> : null}
              <span className="thgrip" title={m.papers.columnHeader.resizeHint} onMouseDown={(e) => startDrag(e, 't')} />
            </th>
            {cols.map((c) => (
              <th
                key={c.k} data-k={c.sort}
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
                {shownLabel(m, c)}{c.sort && sort === c.sort ? <> <SortArrow direction={direction} /></> : null}
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
                if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
                event.preventDefault()
                const bounds = event.currentTarget.getBoundingClientRect()
                setRowMenu({ paper: p, x: bounds.left + 24, y: bounds.top + 24 })
              }}
            >
              <td className="pt-title"><span className="ci">{p.title}</span></td>
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

  // The grouping column contains only the keys listed in the gear: when there is an unlisted key in the manually modified configuration,
  // Since it is not in the gear, it cannot be removed. If it is not drawn as a chip, it will not leave a dead button that will be rejected by the core if clicked.
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
      {/* The title of the demo always carries a number; before the count is up, the "·" and the empty space behind it are not displayed. */}
      <PageHeader>
        <PageTitle>{m.papers.title(paperCount)}</PageTitle>
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
              wrapperClassName="mgr-add paper-search"
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
                    <div className="gxrow" key={f.value} onClick={() => { setSel(f.value); setPage(1) }}>
                      <div className="gx-t">{f.value}</div>
                      <div className="gx-m">
                        {m.papers.groupIndex.newest(
                          `${f.newestTitle.slice(0, 44)}${f.newestTitle.length > 44 ? '…' : ''}`,
                        )}
                      </div>
                      <span className="n">{f.count}</span>
                    </div>
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
                <span className="pd-t">{detail.title}</span>
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
            point={{ x: rowMenu.x, y: rowMenu.y }} label={m.papers.contextMenu.label(rowMenu.paper.title)}
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
