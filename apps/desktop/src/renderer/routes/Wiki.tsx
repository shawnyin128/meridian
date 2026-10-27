import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type {
  PaperFields, PaperReading, PaperRow, Proposal, WikiAggregation, WikiAggregationCard, WikiBacklink, WikiCell, WikiColumn,
  WikiHome, WikiPaper, WikiProposal, WikiRef, WikiSignal,
} from '../../shared/contract.js'
import { PAPER_PAGE } from '../../shared/vocabulary.js'
import { papers, project, wiki } from '../ipc.js'
import {
  useCrumbTail, useJump, useNotice, useScreenEntry, useVaultRevision, type ScreenKey,
} from '../shell/AppShell.js'
import type { CrumbSeg } from '../components/Breadcrumb.js'
import { AddAction } from '../components/AddAction.js'
import { ActionPopover } from '../components/ActionPopover.js'
import { BackButton } from '../components/BackButton.js'
import { EmptyState } from '../components/EmptyState.js'
import { ENTITY_SCREEN, EntityLink } from '../components/EntityLink.js'
import { FadeText } from '../components/FadeText.js'
import { FormInput } from '../components/FormControls.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { IconButton } from '../components/IconButton.js'
import { IconCross, IconGear, IconTrash } from '../components/icons.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import { InlineField, InlineMetadataField } from '../components/InlineField.js'
import { DotsMenu } from '../components/FieldPickers.js'
import { MenuItem, MenuSeparator } from '../components/ActionMenu.js'
import { Property, PropertyList } from '../components/PropertyList.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { NewColumnHead } from '../components/paper-table/ColumnAdd.js'
import { headingsOf, MarkdownSection } from '../components/Markdown.js'
import { PagedSection } from '../components/PagedSection.js'
import { PickRow, type PickHit } from '../components/PickRow.js'
import { nextKey, slugOf } from '../lib/slug.js'
import { editText, useDraft, useDrafts, usePruneDrafts, type EditDraft } from '../hooks/useDrafts.js'
import { pageItems, useStackPaging } from '../hooks/useListPaging.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { PaperUnderstanding } from '../components/paper/PaperUnderstanding.js'
import { PaperText } from '../components/paper/PaperText.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { RailLinks, type RailLink } from '../components/wiki/RailLinks.js'
import { ReviewQueue } from '../components/wiki/ReviewQueue.js'
import { WikiBacklinks } from '../components/wiki/WikiBacklinks.js'
import { WikiClaims, type ClaimLinks } from '../components/wiki/WikiClaims.js'
import { tidyRows, TidyList } from '../components/wiki/WikiTidy.js'
import { SourceAnchor } from '../components/SourceAnchor.js'
import { SplitColumn, SplitPage, SplitRail } from '../components/SplitPage.js'
import { CountBadge } from '../components/CountBadge.js'
import { Tag, TagButton } from '../components/Tag.js'
import { DraftSlot, focusDraft } from '../components/DraftSlot.js'
import { Item, ItemOpen } from '../components/Item.js'
import { Table, TableCell, TableRow, type TableColumn } from '../components/Table.js'
import { Tooltip } from '../components/Tooltip.js'
import { useClipped } from '../hooks/useClipped.js'
import { land } from '../hooks/useArrival.js'
import { Button } from '../components/Button.js'
import { CommitActions } from '../components/CommitActions.js'
import './shell.css'
import './Wiki.css'

/** Cards a page of a home section holds until the section has measured how many fit. */
const FIRST_PAGE_SIZE = 12
/** The key of the home's papers section, beside the aggregation kinds' keys. */
const PAPERS_SECTION = 'papers'

/** The page shown: null is the Wiki home, REVIEW the review queue, TIDY the tidying list, any other value a page id. */
type Place = string | null

/** The review queue's place; it has no `/`, so no page id can be it. */
const REVIEW = 'review'

/** The tidying list's place; like REVIEW it has no `/`. */
const TIDY = 'tidy'

/** The prefix of the page id a Wiki signal gives a project. */
const PROJECT_PAGE = 'projects/'

/** One entry of the Back stack: the previous Wiki page and how far it was scrolled, or the screen that jumped here. */
type Step = { place: Place; scroll: number } | { origin: ScreenKey }

/** The drafts a card's rename and its merge target pick are kept under, with its page, so they reopen where they were typed. */
const RENAME = 'rename'
const MERGE = 'merge'

/**
 * What a card's … menu does: renames the page to the name typed in place, merges it into the page
 * picked in place from `suggestMerge`'s candidates, or moves it to the trash. `onError` hears a
 * failed candidate lookup.
 */
type CardActions = {
  onRename: (title: string) => boolean | Promise<boolean>
  suggestMerge: (query: string) => Promise<PickHit[]>
  onMerge: (hit: PickHit) => boolean | Promise<boolean>
  onDelete: () => void
  onError: (e: Error) => void
}

/**
 * The demo's aggCard: kind tag, title, an "N parents" tag when the aggregation has several parents,
 * the first line of its summary, and a last line with its subpage count, paper count and update date.
 * The title is the card's button; a click anywhere else on the card opens it too. With `actions` the
 * card has the … menu: Rename turns the title into its inline field, Merge into… into a pick of the
 * page to merge into, both in place, and Delete moves the page to the trash.
 */
function AggregationCard({ card, onOpen, onRemove, pending, actions }: {
  card: WikiAggregationCard; onOpen: () => void; onRemove?: () => void; pending?: boolean; actions?: CardActions
}) {
  const fmt = useFormat()
  const m = useMessages()
  const summary = useRef<HTMLDivElement>(null)
  const summaryCut = useClipped(summary, card.summary, true)
  const kept = useDrafts<string>(['wiki', card.id])
  const element = useRef<HTMLElement>(null)
  // Merge into… opens its pick once the menu has let go of focus, as Rename opens its field.
  const mergeAsked = useRef(false)
  const merging = actions !== undefined && kept.get(MERGE) !== undefined
  const name = <ItemOpen className="tt"><FadeText>{card.title}</FadeText></ItemOpen>
  return (
    <Item
      density="card" className="wkcard" data-wk={card.id} onActivate={onOpen} elementRef={element}
      leading={<Tag className="wkind">{card.kindLabel}</Tag>}
      title={actions === undefined ? name : merging
        ? (
          <PickRow
            row={element} triggers={[]} allowNew={false} placeholder={m.wiki.kindNamePlaceholder(card.kindLabel)}
            suggest={actions.suggestMerge} onPick={actions.onMerge} onNew={() => false}
            onCancel={() => kept.drop(MERGE)} onError={actions.onError} kept={{ drafts: kept, target: MERGE }}
          />
        )
        : (
          <InlineField
            label={m.wiki.nameFieldLabel} value={card.title} keep={{ scope: ['wiki', card.id], target: RENAME }}
            normalize={(next) => next.trim()} validate={(next) => next !== ''} onSave={actions.onRename} rest={name} selectAll
          />
        )}
      tags={card.parentCount > 1 ? <Tag className="wkind">{m.wiki.aggregation.parentCount(card.parentCount)}</Tag> : null}
      menu={actions === undefined ? undefined : (
        <DotsMenu
          stopRowActivation onRename={() => kept.set(RENAME, card.title)}
          onCloseAutoFocus={(event) => {
            if (!mergeAsked.current) return
            mergeAsked.current = false
            event.preventDefault()
            kept.set(MERGE, '')
          }}
        >
          <MenuItem onSelect={() => { mergeAsked.current = true }}>{m.wiki.mergeInto}</MenuItem>
          <MenuSeparator />
          <MenuItem className="mi danger" onSelect={actions.onDelete}>{m.common.delete}</MenuItem>
        </DotsMenu>
      )}
      actions={onRemove === undefined
        ? undefined
        : (
          <IconButton
            label={m.wiki.removeFromPage} size="nested" className="rx" aria-disabled={pending}
            onClick={(e) => { e.stopPropagation(); onRemove() }}
          ><IconCross /></IconButton>
        )}
    >
      <div ref={summary} className={`wm fade-lines${summaryCut ? ' clipped' : ''}`}>{card.summary}</div>
      <FadeText className="wf">
        {m.wiki.aggregation.cardFooter(
          card.childCount > 0 ? card.childCount : null, card.memberCount, fmt.date(card.updated),
        )}
      </FadeText>
    </Item>
  )
}

/**
 * The demo's paperCard; a click opens this paper's page, and its title is the card's button. The title
 * takes up to two lines, and the year, venue and topics one. Its … menu renames the paper, its title
 * turning into its inline field in place, and deletes it through `onDelete`, the paper list's delete.
 */
function PaperCard({ paper, onOpen, onRename, onDelete }: {
  paper: PaperRow; onOpen: () => void; onRename: (title: string) => boolean | Promise<boolean>; onDelete: () => void
}) {
  const m = useMessages()
  const kept = useDrafts<string>(['wiki', `${PAPER_PAGE}${paper.id}`])
  const title = useRef<HTMLSpanElement>(null)
  const titleCut = useClipped(title, paper.title, true)
  const line = [`${paper.year ?? ''} ${paper.venue}`.trim(), paper.topics.join(' / ')]
    .filter((part) => part !== '').join(' · ')
  return (
    <Item
      density="card" className="wkcard wkcard--paper" data-wk={`${PAPER_PAGE}${paper.id}`} onActivate={onOpen}
      leading={<Tag className="wkind">{m.wiki.paperKind}</Tag>}
      title={(
        <InlineField
          label={m.wiki.titleLabel} value={paper.title} keep={{ scope: ['wiki', `${PAPER_PAGE}${paper.id}`], target: RENAME }}
          normalize={(next) => next.trim()} validate={(next) => next !== ''} onSave={onRename} selectAll
          rest={(
            <Tooltip label={plainTitle(paper.title)} whenClipped>
              <ItemOpen className="tt"><span ref={title} className={`tt-lines fade-lines${titleCut ? ' clipped' : ''}`}><PaperText text={paper.title} /></span></ItemOpen>
            </Tooltip>
          )}
        />
      )}
      menu={(
        <DotsMenu stopRowActivation onRename={() => kept.set(RENAME, paper.title)}>
          <MenuSeparator />
          <MenuItem className="mi danger" onSelect={onDelete}>{m.common.delete}</MenuItem>
        </DotsMenu>
      )}
    >
      <FadeText className="wm" label={line}>{line}</FadeText>
      <FadeText className="wf">{m.wiki.paperCardFooter(paper.noteCount, paper.conclusionCount)}</FadeText>
    </Item>
  )
}

/** A cell with an anchor: its value, then the anchor that opens the source at its page through `onAnchor`. */
function Cell({ cell, onAnchor }: { cell: WikiCell; onAnchor: (page: number) => void }) {
  return <>{cell.value}<SourceAnchor page={cell.page} quote={cell.quote} separator=" " onOpen={() => onAnchor(cell.page)} /></>
}

/** The width the comparison's paper column and each of its other columns start at, in px. */
const PAPER_WIDTH = 240
const VALUE_WIDTH = 180

/**
 * The paper comparison: rows are member papers, columns come from the aggregation's columns, empty
 * cells show a dash, and derived columns show chips. Every header cell has a body cell under it in
 * every row. An inner node with no columns and no rows takes no papers directly. Like an embedded
 * list, it shows its header and first five rows, and the rest scroll inside it.
 */
function Comparison({ agg, onOpen, onAnchor, onRemove, pending, adding, head }: {
  agg: WikiAggregation
  onOpen: (id: string) => void
  /** Opens the source of the paper page `paper` at `page`. */
  onAnchor: (paper: string, page: number) => void
  onRemove: (paperId: string) => void
  pending?: boolean
  /** The placeholder row for adding a paper: `row` goes on its `<tr>`, `input` sits in its first cell. */
  adding?: { row: RefObject<HTMLTableRowElement | null>; input: ReactNode } | undefined
  /**
   * The header's ends: `controls` holds the add-column + and the column-settings gear; `newColumn`
   * is the placeholder header cell for a new column, null while it is closed. While it is open, every
   * body row leaves an empty cell in the same position.
   */
  head?: { controls: ReactNode; newColumn: ReactNode } | undefined
}) {
  const m = useMessages()
  if (adding === undefined) {
    if (agg.columns.length === 0 && agg.rows.length === 0) {
      return <EmptyState variant="section" />
    }
    if (agg.rows.length === 0) return <EmptyState variant="section" />
  }
  // Keys by kind, so a column's key never meets the paper column's or a derived column's.
  const columns: TableColumn[] = [
    { key: 'paper', label: m.wiki.paperKind, width: PAPER_WIDTH },
    ...agg.columns.map((c) => ({ key: `column:${c.key}`, label: c.label, width: VALUE_WIDTH })),
    ...agg.derivedColumns.map((d) => ({
      key: `derived:${d.key}`, name: d.label, width: VALUE_WIDTH,
      label: <span className="cmp-derived">{d.label}<Tag className="wkind">{m.wiki.autoColumn}</Tag></span>,
    })),
  ]
  return (
    <Table
      className="cmp" rows="capped" columns={columns} draft={head?.newColumn ?? null}
      actions={head === undefined ? null : head.controls}
    >
      {agg.rows.map((row) => (
        <TableRow
          key={row.paper.id}
          actions={(
            <IconButton
              label={m.wiki.removeFromPage} size="nested" aria-disabled={pending}
              onClick={() => onRemove(row.paper.id)}
            ><IconCross /></IconButton>
          )}
        >
          <TableCell kind="title" className="rh">
            <EntityLink
              kind="paper" label={<PaperText text={row.paper.title} />} data-wk={row.paper.id}
              title={row.paper.fullTitle === undefined ? undefined : plainTitle(row.paper.fullTitle)}
              onOpen={() => onOpen(row.paper.id)}
            />
          </TableCell>
          {agg.columns.map((c) => {
            const cell = row.cells[c.key]
            return cell === undefined
              ? <TableCell kind="meta" className="na" key={c.key}>—</TableCell>
              : <TableCell key={c.key}><Cell cell={cell} onAnchor={(page) => onAnchor(row.paper.id, page)} /></TableCell>
          })}
          {agg.derivedColumns.map((d) => {
            const links = row.derived[d.key] ?? []
            return links.length === 0 ? <TableCell kind="meta" className="na dv" key={d.key}>—</TableCell> : (
              <TableCell content="chips" className="dv" key={d.key}>
                {links.map((l) => (
                  <Tooltip key={l.id} label={l.fullTitle}>
                    <TagButton shape="chip" className="tagchip" data-wk={l.id} onClick={() => onOpen(l.id)}>
                      {l.title}
                    </TagButton>
                  </Tooltip>
                ))}
              </TableCell>
            )
          })}
        </TableRow>
      ))}
      {adding === undefined
        ? null
        : (
          <TableRow className="newrow" ref={adding.row}>
            <TableCell content="controls" kind="title" className="rh">{adding.input}</TableCell>
            {agg.columns.map((c) => <TableCell kind="meta" className="na" key={c.key}>—</TableCell>)}
            {agg.derivedColumns.map((d) => <TableCell kind="meta" className="na dv" key={d.key}>—</TableCell>)}
          </TableRow>
        )}
    </Table>
  )
}

/**
 * Column settings: rename or delete existing columns one by one, as a view of `rows`, which each
 * change replaces through `onRows`. Save hands over the whole set of columns and is disabled while
 * any column name is empty or while `stale`. It renders in the popover of the gear at the end of the
 * header row; adding a column is not here but on the + next to it.
 */
function ColumnsEditor({ rows, stale, onRows, onSave, onCancel }: {
  rows: WikiColumn[]; stale: boolean; onRows: (rows: WikiColumn[]) => void; onSave: (columns: WikiColumn[]) => void; onCancel: () => void
}) {
  const m = useMessages()
  const setRows = onRows
  return (
    <div className="coledit">
      <div className="ch">{m.wiki.columnSettings}</div>
      {rows.map((c, i) => (
        <div className="row" key={c.key}>
          <FormInput
            className="inedit" value={c.label}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
          />
          <IconButton
            label={m.wiki.aggregation.deleteColumn} size="nested" tone="danger"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          ><IconTrash /></IconButton>
        </div>
      ))}
      <div className="acts">
        <CommitActions
          place="foot" onCancel={onCancel} canSave={!stale && rows.every((c) => c.label.trim() !== '')}
          onSave={() => onSave(rows.map((c) => ({ key: c.key, label: c.label.trim() })))}
        />
      </div>
    </div>
  )
}

/**
 * The contents list in the right rail: the body's headings, the shallowest level flush left and each
 * deeper level indented one more step. The entry of the section scrolled to is highlighted, and a
 * click scrolls that heading into view. Nothing renders when the body has no headings.
 */
function Toc({ body, main }: { body: string; main: RefObject<HTMLDivElement | null> }) {
  const m = useMessages()
  const headings = useMemo(() => headingsOf(body), [body])
  const [active, setActive] = useState<string | null>(null)

  // The body scrolls inside its column: on every scroll, take the last heading that reached its top.
  useEffect(() => {
    const scroller = main.current
    if (!scroller || headings.length === 0) return
    const pick = () => {
      const top = scroller.getBoundingClientRect().top + 8
      let current = headings[0]!.id
      for (const h of headings) {
        const el = main.current?.querySelector<HTMLElement>(`#${h.id}`)
        if (el !== null && el !== undefined && el.getBoundingClientRect().top <= top + 1) current = h.id
      }
      setActive(current)
    }
    pick()
    scroller.addEventListener('scroll', pick, { passive: true })
    return () => scroller.removeEventListener('scroll', pick)
  }, [headings, main])

  if (headings.length === 0) return null
  const base = Math.min(...headings.map((h) => h.depth))
  return (
    <>
      <SectionHeading level="group">{m.wiki.toc}</SectionHeading>
      <ul className="wktoc">
        {headings.map((h) => (
          <li className={`l${h.depth - base + 1}${h.id === active ? ' on' : ''}`} key={h.id}>
            <button
              type="button"
              onClick={() => {
                const heading = main.current?.querySelector(`#${h.id}`)
                if (heading) land(heading, 'start')
              }}
            ><FadeText label={h.text}>{h.text}</FadeText></button>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Wiki: two kinds of aggregation over a base of papers. The home shows one grid of root cards per
 * kind, then the papers, each section paging on its own and all of them sized together to fill the
 * window; an aggregation card opens its aggregation page, and a paper card
 * or a paper comparison row title opens that paper's page. An aggregation page has fixed sections
 * (subpages, paper comparison) under its title, then a Markdown body that can be edited in place. A
 * paper page has only the user's reading notes and the body. The contents list in the right rail
 * lists the body's headings. The home, aggregation and paper pages come from wiki.home /
 * wiki.aggregation / wiki.paper, and the home's papers from papers.list.
 * This screen holds no vault data of its own. Back follows history: when another screen jumped here,
 * that screen is on the stack too, and going back past the last page returns to it.
 */
/** The id of every Wiki page: each aggregation's, and each paper's page. */
async function wikiPageIds(): Promise<string[]> {
  const [cards, paperIds] = await Promise.all([wiki.cards(), papers.allIds()])
  return [...cards.map((card) => card.id), ...paperIds.map((id) => `${PAPER_PAGE}${id}`)]
}

export function Wiki() {
  const fmt = useFormat()
  const m = useMessages()
  const entry = useScreenEntry()
  const { jump, open: jumpTo, returnTo } = useJump()
  const { revision } = useVaultRevision()
  const [place, setPlace] = useState<Place>(null)
  const [stack, setStack] = useState<Step[]>([])
  const [home, setHome] = useState<WikiHome | null>(null)
  const [rows, setRows] = useState<PaperRow[]>([])
  const [total, setTotal] = useState(0)
  const [agg, setAgg] = useState<WikiAggregation | null>(null)
  const [paper, setPaper] = useState<WikiPaper | null>(null)
  const [reading, setReading] = useState<PaperReading | null>(null)
  const [proposals, setProposals] = useState<WikiProposal[] | null>(null)
  const [backlinks, setBacklinks] = useState<{ page: string; links: WikiBacklink[] } | null>(null)
  const [signals, setSignals] = useState<WikiSignal[] | null>(null)
  const [tidyTitles, setTidyTitles] = useState<Record<string, string> | null>(null)
  /** The claim a tidying row opens its page at, until the page has brought it into view. */
  const [arrival, setArrival] = useState<{ page: string; claim: string } | null>(null)
  const arrived = useCallback(() => setArrival(null), [])
  const consumed = useRef(0)
  const main = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const homeKinds = home?.kinds.flatMap((k) => {
    const count = home.roots.filter((c) => c.kind === k.key).length
    return count === 0 ? [] : [{ key: k.key, total: count }]
  }) ?? []
  const section = useStackPaging(body, [...homeKinds, { key: PAPERS_SECTION, total }], FIRST_PAGE_SIZE)
  const { page, size } = section(PAPERS_SECTION)
  /** The step a Back returned to, until its page shows its content and gets its scroll offset back. */
  const returning = useRef<{ place: Place; scroll: number } | null>(null)
  const { error, failure, load, report } = useScreenLoad(['reading'])
  const notice = useNotice()
  const write = useVaultWrite()
  const undo = useUndo()
  const bodies = useDrafts<EditDraft>(['wiki', place ?? ''])
  usePruneDrafts(['wiki'], wikiPageIds)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(false)
  // A page keeps its open add row, the new column's name and the column settings being typed as drafts.
  const adds = useDrafts<string>(['wiki', place ?? ''])
  const [columnsDraft, setColumnsDraft] = useDraft<{ rows: WikiColumn[]; base: WikiColumn[] }>(['wiki', place ?? ''], 'columns')
  const adding = adds.get('add-child') !== undefined ? 'child'
    : adds.get('add-paper') !== undefined ? 'paper' : columnsDraft !== null ? 'columns' : null
  const setAdding = (what: 'child' | 'paper' | null) => {
    if (what !== 'child') adds.drop('add-child')
    if (what !== 'paper') adds.drop('add-paper')
    setColumnsDraft(null)
    if (what !== null && adds.get(`add-${what}`) === undefined) adds.set(`add-${what}`, '')
  }
  const newCol = adds.get('new-column') !== undefined
  const setNewCol = (open: boolean) => {
    if (!open) adds.drop('new-column')
    else if (!newCol) adds.set('new-column', '')
  }
  const addRow = useRef<HTMLElement>(null)
  const newPaperRow = useRef<HTMLTableRowElement>(null)
  const newColCell = useRef<HTMLTableCellElement>(null)
  const childBtn = useRef<HTMLButtonElement>(null)
  const paperBtn = useRef<HTMLButtonElement>(null)
  const colBtn = useRef<HTMLButtonElement>(null)
  const colAdd = useRef<HTMLButtonElement>(null)

  /**
   * A management operation is a proposal: once it is written, close the input row, bump the vault
   * revision, show `title` as a success notice, and return whether it was written. `pending` is true
   * while the proposal is in flight. `note` replaces `title` in the notice; an `undoable` write's
   * notice offers Undo, which undoes the change entry it recorded.
   */
  const propose = (title: string, ops: Proposal['ops'], note = title, undoable = false): Promise<boolean> => {
    setPending(true)
    return write(wiki.apply({ source: 'user', title, ops }).then((recorded) => {
      // The gear's popover is open while adding === 'columns'; a successful save closes it here.
      setAdding(null)
      return recorded
    }), undoable ? { note, action: undo.change } : {}).finally(() => setPending(false))
  }

  /**
   * Opens the add row `what`: if another one is open, switches to it; if this one is already open,
   * moves focus back to its PickRow input. Also closes the placeholder column at the end of the
   * header row, here, rather than relying on a click-outside or focus-loss check.
   */
  const open = (what: 'child' | 'paper') => {
    setNewCol(false)
    if (adding !== what) { setAdding(what); return }
    focusDraft(what === 'paper' ? newPaperRow.current : addRow.current)
  }

  // An entry from the sidebar lands on the Wiki home; a jump from another screen lands on the page it
  // points to, with the origin screen on the stack for Back.
  useEffect(() => {
    returning.current = null
    if (jump !== null && jump.seq !== consumed.current) {
      consumed.current = jump.seq
      setPlace(jump.target)
      setStack([{ origin: jump.from }])
      return
    }
    setPlace(null)
    setStack([])
  }, [entry, jump])

  useEffect(() => load('home', wiki.home(), setHome), [revision, load])

  useEffect(() => load('papers', papers.list({ page, size }), (r) => {
    setRows(r.rows)
    setTotal(r.total)
  }), [page, size, revision, load])

  useEffect(() => load('proposals', wiki.proposals(), setProposals), [revision, load])

  useEffect(() => load('signals', wiki.signals(), setSignals), [revision, load])

  // The tidying list names each row's page: aggregations and projects from their lists, papers one by
  // one; and the claims a conflict is with, from their pages.
  useEffect(() => {
    setTidyTitles(null)
    if (place !== TIDY || signals === null) return
    const rows = tidyRows(signals)
    const pages = rows.map((row) => row.page)
    const paperPages = [...new Set(pages.filter((id) => id.startsWith(PAPER_PAGE)))]
    const claimPages = [...new Set(rows.filter((row) => row.kind === 'open-conflict')
      .flatMap((row) => row.targets.map((ref) => ref.split('#')[0]!)))]
    return load('tidy', Promise.all([
      wiki.cards(), project.list(),
      Promise.all(paperPages.map(async (id) => [id, (await papers.get(id.slice(PAPER_PAGE.length))).title] as const)),
      Promise.all(claimPages.map(async (id) => (await wiki.aggregation(id)).claims.map((c) => [`${id}#${c.id}`, c.text] as const))),
    ]), ([cards, projects, paperTitles, claimTexts]) => {
      setTidyTitles(Object.fromEntries([
        ...cards.map((c) => [c.id, c.title] as const),
        ...projects.map((p) => [`${PROJECT_PAGE}${p.id}`, p.name] as const),
        ...paperTitles,
        ...claimTexts.flat(),
      ]))
    })
  }, [place, signals, load])

  useEffect(() => {
    if (place === null || place === REVIEW || place === TIDY) return
    return place.startsWith(PAPER_PAGE)
      ? load('page', wiki.paper(place), setPaper)
      : load('page', wiki.aggregation(place), setAgg)
  }, [place, revision, load])

  useEffect(() => {
    if (place === null || place === REVIEW || place === TIDY) return
    return load('backlinks', wiki.backlinks(place), (links) => setBacklinks({ page: place, links }))
  }, [place, revision, load])

  useEffect(() => {
    setReading(null)
    if (place === null || !place.startsWith(PAPER_PAGE)) return
    return load('reading', papers.reading(place.slice(PAPER_PAGE.length)), setReading)
  }, [place, revision, load])

  const goHome = useCallback(() => {
    setPlace(null)
    setStack([])
  }, [])

  const go = useCallback((next: Place) => {
    // A page's main column scrolls inside itself; the home, review and tidy views scroll the page body.
    const scroll = (main.current ?? body.current)?.scrollTop ?? 0
    returning.current = null
    setPlace((current) => {
      if (next === current) return current
      setStack((s) => [...s, { place: current, scroll }])
      return next
    })
  }, [])

  const back = () => {
    const top = stack.at(-1)
    setStack((s) => s.slice(0, -1))
    if (top === undefined) setPlace(null)
    else if ('origin' in top) returnTo(top.origin)
    else {
      returning.current = top
      setPlace(top.place)
    }
  }

  /** Opens the reader at `page` of the paper whose Wiki page is `paper`. */
  const openSource = (paper: string, page: number) => jumpTo('reader', paper.slice(PAPER_PAGE.length), { page })

  const claimLinks: ClaimLinks = {
    openPage: go,
    openProject: (id) => jumpTo('project', id),
    openReader: (paper, anchor) => jumpTo('reader', paper.slice(PAPER_PAGE.length), anchor),
  }

  const shownAgg = agg !== null && place === agg.id ? agg : null
  // Each aggregation page pages its subdivisions on its own, from its first page.
  const childrenKey = `children:${shownAgg?.id ?? ''}`
  const childSection = useStackPaging(
    main, shownAgg === null ? [] : [{ key: childrenKey, total: shownAgg.children.length }], FIRST_PAGE_SIZE,
  )
  const shownPaper = paper !== null && place === paper.id ? paper : null
  const shownReading = shownPaper !== null && reading?.paperId === shownPaper.id.slice(PAPER_PAGE.length)
    ? reading : null
  const shownBacklinks = backlinks !== null && backlinks.page === place ? backlinks.links : []
  const bodyEdit = editText(bodies, 'body', shownAgg?.body ?? shownPaper?.body ?? '')
  // Until the place shows its content it is a placeholder, which cannot be scrolled that far.
  const shown = place === null ? home !== null
    : place === REVIEW ? proposals !== null
      : place === TIDY ? signals !== null
        : shownAgg !== null || (shownPaper !== null && shownReading !== null)
  useLayoutEffect(() => {
    const held = returning.current
    const scroller = main.current ?? body.current
    if (held === null || held.place !== place || !shown || scroller === null) return
    returning.current = null
    scroller.scrollTop = held.scroll
  }, [place, shown])

  /** The rail link to Wiki page `ref`, which opens it here. */
  const pageLink = (ref: WikiRef): RailLink => ({
    key: ref.id, title: ref.title, fullTitle: ref.fullTitle, page: ref.id, onOpen: () => go(ref.id),
  })

  /** Opens what a backlink names: a Wiki page here, a project, an idea or a chat on its own screen. */
  const openBacklink = (link: WikiBacklink) => {
    if (link.kind === 'page') go(link.id)
    else jumpTo(ENTITY_SCREEN[link.kind], link.id)
  }

  /**
   * Opens the page a tidying row is about: a Wiki page here, at `claim` (a `page#claim` ref) when it
   * names one, and a project on its own screen.
   */
  const openSignal = (page: string, claim?: string) => {
    if (page.startsWith(PROJECT_PAGE)) {
      jumpTo('project', page.slice(PROJECT_PAGE.length))
      return
    }
    setArrival(claim === undefined ? null : { page, claim: claim.slice(page.length + 1) })
    go(page)
  }

  /**
   * Subpage candidates: aggregations of the same kind, other than this page and not yet under it,
   * matched by title; none while the input is empty.
   */
  const suggestChildren = useCallback(async (query: string): Promise<PickHit[]> => {
    if (shownAgg === null || query === '') return []
    const taken = new Set(shownAgg.children.map((c) => c.id))
    const q = query.toLowerCase()
    return (await wiki.cards())
      .filter((c) => c.kind === shownAgg.kind && c.id !== shownAgg.id && !taken.has(c.id))
      .filter((c) => c.title.toLowerCase().includes(q))
      .map((c) => ({ id: c.id, title: c.title, meta: m.project.identity.paperCount(c.memberCount) }))
  }, [shownAgg, m])

  /** Paper candidates: papers matching the query that are not on this page; none while the input is empty. */
  const suggestPapers = useCallback(async (query: string): Promise<PickHit[]> => {
    if (shownAgg === null || query === '') return []
    const members = new Set(shownAgg.rows.map((r) => r.paper.id))
    return (await papers.list({ page: 1, size: 12, filter: query })).rows
      .filter((r) => !members.has(`${PAPER_PAGE}${r.id}`))
      .map((r) => ({ id: `${PAPER_PAGE}${r.id}`, title: r.title, meta: `${r.year ?? ''} ${r.venue}`.trim(), paper: true }))
  }, [shownAgg])

  const mount = (hit: PickHit): Promise<boolean> => {
    if (shownAgg === null) return Promise.resolve(false)
    return wiki.aggregation(hit.id).then((child) => propose(
      m.wiki.proposals.placeUnder(child.title, shownAgg.title),
      [{ op: 'setParents', page: child.id, parents: [...child.parents.map((p) => p.id), shownAgg.id] }],
    ), (e: Error) => {
      report(e)
      return false
    })
  }

  const unmount = (card: WikiAggregationCard) => {
    if (shownAgg === null || pending) return
    // Fetch that page before sending the proposal; the fetch already counts as the proposal in flight.
    setPending(true)
    void wiki.aggregation(card.id).then((child) => propose(
      m.wiki.proposals.moveOut(child.title, shownAgg.title),
      [{ op: 'setParents', page: child.id, parents: child.parents.map((p) => p.id).filter((id) => id !== shownAgg.id) }],
      undefined, true,
    )).catch((e: Error) => {
      setPending(false)
      report(e)
    })
  }

  /** The cards Merge into… last offered, by page id, so a pick hands Core the card it showed. */
  const offered = useRef(new Map<string, WikiAggregationCard>())

  /**
   * The … menu of `card`: Rename writes the new title, keeping how the page is split; Merge into…
   * offers the other pages of its kind whose title holds what is typed, every one of them while
   * nothing is, and merges into the one picked at once, with the two cards as they showed; Delete
   * moves the page to the trash. Merge and Delete offer Undo on their notice.
   */
  const cardActions = (card: WikiAggregationCard): CardActions => ({
    onRename: (title) => wiki.aggregation(card.id).then((held) => propose(
      m.wiki.proposals.rename(card.title, title),
      [{ op: 'setAggregationMetadata', page: card.id, title, splitOn: held.splitOn ?? null }],
    ), (e: Error) => {
      report(e)
      return false
    }),
    suggestMerge: async (query) => {
      const q = query.toLowerCase()
      const found = (await wiki.cards())
        .filter((c) => c.kind === card.kind && c.id !== card.id && c.title.toLowerCase().includes(q))
      offered.current = new Map(found.map((c) => [c.id, c]))
      return found.map((c) => ({ id: c.id, title: c.title, meta: m.project.identity.paperCount(c.memberCount) }))
    },
    onMerge: (hit) => write(
      wiki.merge(card.id, hit.id, { from: card, into: offered.current.get(hit.id)! }),
      { note: m.wiki.merge.done, action: undo.change },
    ),
    onDelete: () => { void write(wiki.delete(card.id), { note: m.common.trashed, action: undo.change }) },
    onError: report,
  })

  /**
   * Adds a column, named at the end of the header row, to this page. A column here is only a name;
   * nothing else about it can be configured after it is created.
   */
  const createColumn = (label: string): boolean | Promise<boolean> => {
    if (shownAgg === null || label === '' || shownAgg.columns.some((c) => c.label === label)) return false
    return propose(m.wiki.proposals.changeColumns(shownAgg.title), [{
      op: 'setColumns',
      page: shownAgg.id,
      columns: [...shownAgg.columns, { key: nextKey(label, shownAgg.columns.map((c) => c.key)), label }],
    }])
  }

  const create = (title: string): boolean | Promise<boolean> => {
    if (shownAgg === null) return false
    const slug = slugOf(title)
    if (slug === '') {
      notice.refusal(m.wiki.nameNeedsChar)
      return false
    }
    return propose(m.wiki.proposals.createUnder(title, shownAgg.title), [{
      op: 'createAggregation', kind: shownAgg.kind, id: `${shownAgg.id.split('/')[0]}/${slug}`,
      title, parents: [shownAgg.id], columns: [], describe: '',
    }])
  }

  // An aggregation page's middle breadcrumb is its first parent, which opens that page; a paper page
  // shows only itself, as in the demo's syncCrumb.
  const tail = useMemo<CrumbSeg[]>(() => {
    if (shownAgg !== null) {
      const parent = shownAgg.parents[0]
      return [
        ...(parent === undefined ? [] : [{ text: parent.title, onClick: () => go(parent.id) }]),
        { text: shownAgg.title },
      ]
    }
    if (shownPaper !== null) return [{ text: plainTitle(shownPaper.title) }]
    if (place === REVIEW) return [{ text: m.wiki.queue.entry }]
    if (place === TIDY) return [{ text: m.wiki.tidy.entry }]
    return []
  }, [shownAgg, shownPaper, go, place, m])
  useCrumbTail(tail, place === null ? undefined : goHome)

  const queued = (proposals ?? []).filter((p) => p.status === 'queued').length
  const tidy = signals === null ? null : tidyRows(signals)
  const title = shownAgg?.title ?? (shownPaper === null ? null : <PaperText text={shownPaper.title} />)
    ?? (place === REVIEW ? m.wiki.queue.entry : null)
    ?? (place === TIDY ? m.wiki.tidy.entry : null)
    ?? m.wiki.title
  const tidyCount = tidy?.length ?? 0
  const titleCount = shownAgg !== null || shownPaper !== null ? undefined
    : place === REVIEW ? queued : place === TIDY ? tidyCount : home?.aggregationCount

  /** Applies or declines a queued proposal; a proposal Core refuses on apply is reported with its reason. */
  const decide = (proposal: WikiProposal, decision: 'apply' | 'decline', reason?: string) => {
    setPending(true)
    void write(wiki.decide(proposal.id, decision, reason).then((receipt) => {
      if (decision === 'apply' && receipt.status !== 'applied') notice.refusal(m.wiki.queue.rejectedNote(receipt.reason?.message ?? ''))
    })).finally(() => setPending(false))
  }

  /** Writes the edited body `next`; the vault revision bump after the write makes this page fetch again. */
  const saveBody = (next: string) => {
    setSaving(true)
    void write(wiki.update(place!, next).then(() => {
      bodyEdit.drop()
    })).finally(() => setSaving(false))
  }

  /**
   * A Wiki paper page's bibliographic fields are the same frontmatter the paper list edits; only
   * papers.update writes them.
   */
  const updateWikiPaper = (patch: Partial<PaperFields>): Promise<boolean> => {
    if (shownPaper === null) return Promise.resolve(false)
    const paperId = shownPaper.id.startsWith(PAPER_PAGE)
      ? shownPaper.id.slice(PAPER_PAGE.length) : shownPaper.id
    return write(papers.update(paperId, patch))
  }

  return (
    <PageShell>
      <PageHeader
        actions={shownPaper !== null
          ? (
            <>
              {/* Papers filters its table down to this paper by title; the user continues from that row's details. */}
              <Button size="regular" onClick={() => jumpTo('papers', shownPaper.title)}>{m.wiki.viewInPaperList}</Button>
              <Button size="regular" onClick={() => jumpTo('reader', shownPaper.id.slice(PAPER_PAGE.length))}>
                {m.papers.understanding.goRead}
              </Button>
            </>
          )
          : place === null && (queued > 0 || tidyCount > 0)
            ? (
              <>
                {queued === 0 ? null : (
                  <Button size="regular" onClick={() => go(REVIEW)}>{m.wiki.queue.entry}<CountBadge count={queued} /></Button>
                )}
                {tidyCount === 0 ? null : (
                  <Button size="regular" onClick={() => go(TIDY)}>{m.wiki.tidy.entry}<CountBadge count={tidyCount} /></Button>
                )}
              </>
            )
            : undefined}
      >
        {place === null ? null : <BackButton onClick={back} />}
        <PageTitle label={shownAgg?.title ?? (shownPaper === null ? undefined : plainTitle(shownPaper.title))} count={titleCount}>{title}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody className="wiki-body" column={place === null || place === REVIEW || place === TIDY ? 'page' : 'prose'} ref={body}>
        {error === null && (place === null ? home === null : place !== REVIEW && place !== TIDY && shownAgg === null && shownPaper === null)
          ? <LoadingPlaceholder shape="cards" />
          : null}
        {shownAgg !== null
          ? (
            <SplitPage columns="rail" className="wkpage">
              <SplitColumn className="wkmain" ref={main}>
                <PagedSection
                  heading={m.wiki.subdivisionsHeading(shownAgg.kindLabel)}
                  actions={(
                    <AddAction
                      size="compact" ref={childBtn} disabled={pending}
                      label={m.wiki.addKind(shownAgg.kindLabel)} onClick={() => open('child')}
                    >{shownAgg.kindLabel}</AddAction>
                  )}
                  total={shownAgg.children.length} paging={childSection(childrenKey)} className="wkgrid"
                  empty={shownAgg.children.length === 0 && adding !== 'child' ? <EmptyState variant="section" /> : undefined}
                >
                  {pageItems(shownAgg.children, childSection(childrenKey)).map((c) => (
                    <AggregationCard
                      key={c.id} card={c} pending={pending} actions={cardActions(c)}
                      onOpen={() => go(c.id)} onRemove={() => unmount(c)}
                    />
                  ))}
                  {adding === 'child'
                    ? (
                      <DraftSlot
                        as="card" className="wkcard newcard" slot={addRow}
                        leading={<Tag className="wkind">{shownAgg.kindLabel}</Tag>}
                        title={(
                          <PickRow
                            row={addRow} triggers={[childBtn, paperBtn, colBtn]} allowNew
                            placeholder={m.wiki.kindNamePlaceholder(shownAgg.kindLabel)}
                            suggest={suggestChildren} onPick={mount} onNew={create}
                            onCancel={() => setAdding(null)} onError={report}
                            kept={{ drafts: adds, target: 'add-child' }}
                          />
                        )}
                      >
                        <div className="wf" />
                      </DraftSlot>
                    )
                    : null}
                </PagedSection>
                <SectionHeading
                  actions={(
                    <AddAction
                      size="compact" ref={paperBtn} disabled={pending}
                      label={m.wiki.addPaperTitle} onClick={() => open('paper')}
                    >{m.wiki.paperKind}</AddAction>
                  )}
                >{m.wiki.paperComparisonHeading}
                </SectionHeading>
                <Comparison
                  agg={shownAgg} onOpen={go} onAnchor={openSource} pending={pending}
                  adding={adding !== 'paper'
                    ? undefined
                    : {
                      row: newPaperRow,
                      input: (
                        <PickRow
                          row={newPaperRow} triggers={[childBtn, paperBtn, colBtn]} allowNew={false}
                          placeholder={m.project.links.paperPlaceholder}
                          suggest={suggestPapers} onNew={() => false} onCancel={() => setAdding(null)}
                          onError={report} kept={{ drafts: adds, target: 'add-paper' }}
                          onPick={(hit) => propose(m.wiki.proposals.addPaper(hit.title, shownAgg.title), [
                            { op: 'setMembership', paper: hit.id, in: shownAgg.id, cells: {} },
                          ])}
                        />
                      ),
                    }}
                  head={shownAgg.rows.length === 0
                    ? undefined
                    : {
                      controls: (
                        <>
                          {/* If the placeholder column is already open, only refocus it, keeping the half-typed name. */}
                          <AddAction
                            size="compact" ref={colAdd} disabled={pending}
                            label={m.wiki.aggregation.addColumn}
                            onClick={() => {
                              if (newCol) { focusDraft(newColCell.current); return }
                              setAdding(null)
                              setNewCol(true)
                            }}
                          />
                          <ActionPopover
                            open={adding === 'columns'}
                            onOpenChange={(next) => {
                              setAdding(null)
                              if (next) setColumnsDraft({ rows: shownAgg.columns, base: shownAgg.columns })
                            }}
                            surface="form" contentClassName="colpop" sticky="always"
                            trigger={(
                              <IconButton
                                label={m.wiki.columnSettings} size="nested" ref={colBtn} disabled={pending}
                              ><IconGear /></IconButton>
                            )}
                          >
                            {/*
                              * Adding a column widens the table and moves the end of the header row; the
                              * popover stays inside the window, like the paper table's column menu.
                              */}
                                <ColumnsEditor
                                  rows={columnsDraft?.rows ?? shownAgg.columns}
                                  stale={columnsDraft !== null && JSON.stringify(columnsDraft.base) !== JSON.stringify(shownAgg.columns)}
                                  onRows={(rows) => { if (columnsDraft !== null) setColumnsDraft({ ...columnsDraft, rows }) }}
                                  onCancel={() => setAdding(null)}
                                  onSave={(columns) => {
                                    if (pending) return
                                    propose(
                                      m.wiki.proposals.changeColumns(shownAgg.title),
                                      [{ op: 'setColumns', page: shownAgg.id, columns }],
                                      undefined,
                                      shownAgg.columns.some((held) => !columns.some((kept) => kept.key === held.key)),
                                    )
                                  }}
                                />
                          </ActionPopover>
                        </>
                      ),
                      newColumn: !newCol
                        ? null
                        : (
                          <NewColumnHead
                            cell={newColCell} triggers={[colAdd]}
                            onCreate={createColumn} onCancel={() => setNewCol(false)} kept={{ drafts: adds, target: 'new-column' }}
                          />
                        ),
                    }}
                  onRemove={(paperId) => {
                    // An aria-disabled cell still receives clicks; this ignores them while a proposal is in flight.
                    if (pending) return
                    const row = shownAgg.rows.find((r) => r.paper.id === paperId)!
                    propose(
                      m.wiki.proposals.moveOutPaper(row.paper.title, shownAgg.title),
                      [{ op: 'removeMembership', paper: paperId, in: shownAgg.id }],
                      undefined, true,
                    )
                  }}
                />
                <WikiClaims
                  page={shownAgg} pending={pending} links={claimLinks}
                  onApply={(title, ops, undoNote) => propose(title, ops, undoNote, undoNote !== undefined)}
                  arrival={arrival?.page === shownAgg.id ? arrival.claim : undefined} onArrived={arrived}
                />
                <MarkdownSection
                  key={shownAgg.id} title={shownAgg.title} edit={bodyEdit} saving={saving} onSave={saveBody} onOpen={go} titles={shownAgg.titles}
                />
              </SplitColumn>
              <SplitRail>
                <SectionHeading level="group">{m.project.identity.heading}</SectionHeading>
                <PropertyList>
                  <Property label={m.project.identity.typeLabel}>{shownAgg.kindLabel}</Property>
                  <Property label={m.project.identity.nameLabel}>
                    <InlineMetadataField
                      label={m.wiki.nameFieldLabel} value={shownAgg.title} keep={{ scope: ['wiki', shownAgg.id], target: 'title' }}
                      onSave={(title) => {
                        const next = title.trim()
                        if (next === '') { notice.refusal(m.wiki.nameRequired); return false }
                        return propose(m.wiki.proposals.editMetadata(shownAgg.title), [{
                          op: 'setAggregationMetadata', page: shownAgg.id, title: next,
                          splitOn: shownAgg.splitOn ?? null,
                        }])
                      }}
                    />
                  </Property>
                  <Property label={m.wiki.scaleLabel}>{m.wiki.scaleSummary(shownAgg.memberCount, shownAgg.childCount)}</Property>
                  <Property label={m.wiki.splitOnLabel}>
                    <InlineMetadataField
                      label={m.wiki.splitOnLabel} value={shownAgg.splitOn ?? ''} keep={{ scope: ['wiki', shownAgg.id], target: 'splitOn' }}
                      onSave={(splitOn) => propose(m.wiki.proposals.editMetadata(shownAgg.title), [{
                        op: 'setAggregationMetadata', page: shownAgg.id, title: shownAgg.title,
                        splitOn: splitOn.trim() || null,
                      }])}
                    />
                  </Property>
                  <Property label={m.wiki.updatedLabel}>{fmt.date(shownAgg.updated)}</Property>
                </PropertyList>
                <RailLinks
                  heading={m.project.sections.links}
                  rows={[
                    ...shownAgg.parents.length > 0 ? [{ label: m.wiki.belongsTo, links: shownAgg.parents.map(pageLink) }] : [],
                    ...shownAgg.related.map((r) => ({ label: r.label, links: r.links.map(pageLink) })),
                  ]}
                />
                <WikiBacklinks links={shownBacklinks} onOpen={openBacklink} />
                <Toc body={shownAgg.body} main={main} />
              </SplitRail>
            </SplitPage>
          )
          : null}

        {shownPaper !== null
          ? (
            <SplitPage columns="rail" className="wkpage">
              <SplitColumn className="wkmain" ref={main}>
                <PaperUnderstanding
                  reading={shownReading} error={failure('reading')}
                  onRead={(anchor) => jumpTo(
                    'reader', shownPaper.id.slice(PAPER_PAGE.length), anchor,
                  )}
                />
                <MarkdownSection
                  key={shownPaper.id} title={m.wiki.internalizedContent} edit={bodyEdit} saving={saving} onSave={saveBody} onOpen={go}
                  onAnchor={(page) => openSource(shownPaper.id, page)} titles={shownPaper.titles}
                />
              </SplitColumn>
              <SplitRail>
                <SectionHeading level="group">{m.project.identity.heading}</SectionHeading>
                <PropertyList>
                  <Property label={m.project.identity.typeLabel}>{m.wiki.paperKind}</Property>
                  <Property label={m.wiki.titleLabel}>
                    <InlineMetadataField
                      label={m.wiki.titleLabel} value={shownPaper.title} keep={{ scope: ['wiki', shownPaper.id], target: 'title' }}
                      onSave={(title) => {
                        const next = title.trim()
                        if (next === '') { notice.refusal(m.wiki.titleRequired); return false }
                        return updateWikiPaper({ title: next })
                      }}
                    />
                  </Property>
                  <Property label={m.wiki.shortTitleLabel}>
                    <InlineMetadataField
                      label={m.wiki.shortTitleLabel} value={shownPaper.short} keep={{ scope: ['wiki', shownPaper.id], target: 'short' }}
                      onSave={(shortTitle) => updateWikiPaper({ shortTitle: shortTitle.trim() || null })}
                    />
                  </Property>
                  <Property label={m.wiki.authorsLabel}>
                    <InlineMetadataField
                      label={m.wiki.authorsLabel} value={fmt.authors(shownPaper.authors)} keep={{ scope: ['wiki', shownPaper.id], target: 'authors' }}
                      onSave={(authors) => updateWikiPaper({
                        authors: authors.split(/[,，;；\n]/).map((item) => item.trim()).filter(Boolean),
                      })}
                    />
                  </Property>
                  <Property label={m.wiki.yearLabel}>
                    <InlineMetadataField
                      label={m.wiki.yearLabel} value={shownPaper.year?.toString() ?? ''} inputMode="numeric"
                      keep={{ scope: ['wiki', shownPaper.id], target: 'year' }}
                      onSave={(year) => {
                        const text = year.trim()
                        if (text === '') return updateWikiPaper({ year: null })
                        const next = Number(text)
                        if (!Number.isInteger(next) || next < 1000 || next > 3000) {
                          notice.refusal(m.wiki.yearRange)
                          return false
                        }
                        return updateWikiPaper({ year: next })
                      }}
                    />
                  </Property>
                  <Property label={m.wiki.venueLabel}>
                    <InlineMetadataField
                      label={m.wiki.venueLabel} value={shownPaper.venue} keep={{ scope: ['wiki', shownPaper.id], target: 'venue' }}
                      onSave={(venue) => updateWikiPaper({ venue: venue.trim() })}
                    />
                  </Property>
                  {shownPaper.pdf === ''
                    ? null
                    : <Property label={m.wiki.originalLabel}>{shownPaper.pdf}</Property>}
                  <Property label={m.wiki.updatedLabel}>{fmt.date(shownPaper.updated)}</Property>
                </PropertyList>
                <SectionHeading level="group">{m.wiki.membershipHeading}</SectionHeading>
                {shownPaper.memberships.length === 0
                  ? <EmptyState variant="section" />
                  : shownPaper.memberships.map((ms) => (
                    <div className="memb" key={ms.aggregation.id}>
                      <div className="wkrel">
                        <Tag className="wkind">{ms.kindLabel}</Tag>
                        <TagButton
                          shape="chip" className="tagchip" data-wk={ms.aggregation.id}
                          onClick={() => go(ms.aggregation.id)}
                        >{ms.aggregation.title}</TagButton>
                      </div>
                      <PropertyList>
                        {ms.cells.map((c) => (
                          <Property key={c.label} label={c.label}>
                            <Cell cell={c.cell} onAnchor={(page) => openSource(shownPaper.id, page)} />
                          </Property>
                        ))}
                      </PropertyList>
                    </div>
                  ))}
                <WikiBacklinks links={shownBacklinks} onOpen={openBacklink} />
                <Toc body={shownPaper.body} main={main} />
              </SplitRail>
            </SplitPage>
          )
          : null}

        {place === REVIEW
          ? (
            <ReviewQueue
              proposals={proposals} failed={error !== null} pending={pending} links={claimLinks}
              onOpenConclusion={(project, conclusion) => jumpTo('project', project, { conclusion })}
              onApply={(proposal) => decide(proposal, 'apply')}
              onDecline={(proposal, reason) => decide(proposal, 'decline', reason === '' ? undefined : reason)}
            />
          )
          : null}

        {place === TIDY
          ? tidy === null
            ? (error === null ? <LoadingPlaceholder shape="rows" /> : null)
            : <TidyList rows={tidy} titles={tidyTitles} failed={error !== null} onOpen={openSignal} />
          : null}

        {place === null && home !== null
          ? (
            <>
              {home.kinds.map((k) => {
                const roots = home.roots.filter((c) => c.kind === k.key)
                const paging = section(k.key)
                return roots.length === 0 ? null : (
                  <PagedSection key={k.key} heading={k.label} total={roots.length} paging={paging} className="wkgrid">
                    {pageItems(roots, paging).map((c) => <AggregationCard key={c.id} card={c} actions={cardActions(c)} onOpen={() => go(c.id)} />)}
                  </PagedSection>
                )
              })}
              <PagedSection heading={m.project.sections.papers} total={total} paging={section(PAPERS_SECTION)} className="wkgrid">
                {rows.map((p) => (
                  <PaperCard
                    key={p.id} paper={p} onOpen={() => go(`${PAPER_PAGE}${p.id}`)}
                    onRename={(title) => write(papers.update(p.id, { title }))}
                    onDelete={() => { void write(papers.delete(p.id), { note: m.common.trashed, action: undo.change }) }}
                  />
                ))}
              </PagedSection>
            </>
          )
          : null}
      </PageBody>

    </PageShell>
  )
}
