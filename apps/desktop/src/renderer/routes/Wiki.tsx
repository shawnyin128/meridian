import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type {
  PaperFields, PaperReading, PaperRow, Proposal, WikiAggregation, WikiAggregationCard, WikiBacklink, WikiCell, WikiColumn,
  WikiHome, WikiPaper, WikiProposal, WikiRef, WikiSignal,
} from '../../shared/contract.js'
import { PAPER_PAGE } from '../../shared/vocabulary.js'
import { papers, project, wiki } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import {
  useCrumbTail, useJump, useNotice, useScreenEntry, useVaultRevision, type CrumbSeg, type ScreenKey,
} from '../shell/AppShell.js'
import { AddAction } from '../components/AddAction.js'
import { ActionPopover } from '../components/ActionPopover.js'
import { BackButton } from '../components/BackButton.js'
import { EditActions } from '../components/EditActions.js'
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
import { InlineMetadataField } from '../components/InlineField.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { NewColumnHead } from '../components/paper-table/ColumnAdd.js'
import { headingsOf, MarkdownBox } from '../components/Markdown.js'
import { Pager } from '../components/Pager.js'
import { PickRow, type PickHit } from '../components/PickRow.js'
import { nextKey, slugOf } from '../lib/slug.js'
import { useRowCap } from '../hooks/useRowCap.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { PaperUnderstanding } from '../components/paper/PaperUnderstanding.js'
import { PaperText } from '../components/paper/PaperText.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { RailLinks, type RailLink } from '../components/wiki/RailLinks.js'
import { ReviewQueue } from '../components/wiki/ReviewQueue.js'
import { WikiBacklinks } from '../components/wiki/WikiBacklinks.js'
import { WikiClaims, type ClaimLinks } from '../components/wiki/WikiClaims.js'
import { tidyRows, TidyList } from '../components/wiki/WikiTidy.js'
import { SourceAnchor } from '../components/SourceAnchor.js'
import { CountBadge, Tag, TagButton } from '../components/Tag.js'
import { CardOpen, ResearchObjectCard } from '../components/ResearchObjectCard.js'
import { EMBEDDED_LIST_ROW_LIMIT, RowActions } from '../components/StructuredList.js'
import { Tooltip } from '../components/Tooltip.js'
import { useClipped } from '../hooks/useClipped.js'
import './shell.css'
import './Wiki.css'

/** Papers per page, as in the demo's pagerHTML('wkp', …, [12,24,48]). */
const PAGE_SIZES = [12, 24, 48]

/** The page shown: null is the Wiki home, REVIEW the review queue, TIDY the tidying list, any other value a page id. */
type Place = string | null

/** The review queue's place; it has no `/`, so no page id can be it. */
const REVIEW = 'review'

/** The tidying list's place; like REVIEW it has no `/`. */
const TIDY = 'tidy'

/** The prefix of the page id a Wiki signal gives a project. */
const PROJECT_PAGE = 'projects/'

/** One entry of the Back stack: the previous Wiki page, or the screen that jumped here. */
type Step = { place: Place } | { origin: ScreenKey }

/**
 * The demo's aggCard: kind tag, title, an "N parents" tag when the aggregation has several parents,
 * the first line of its summary, and a last line with its subpage count, paper count and update date.
 * The title is the card's button; a click anywhere else on the card opens it too.
 */
function AggregationCard({ card, onOpen, onRemove, pending }: {
  card: WikiAggregationCard; onOpen: () => void; onRemove?: () => void; pending?: boolean
}) {
  const fmt = useFormat()
  const m = useMessages()
  const summary = useRef<HTMLDivElement>(null)
  const summaryCut = useClipped(summary, card.summary, true)
  return (
    <ResearchObjectCard variant="grid" className="wkcard" data-wk={card.id} onActivate={onOpen}>
      <div className="wt">
        <Tag tone="wiki" className="wkind">{card.kindLabel}</Tag>
        <CardOpen className="tt">{card.title}</CardOpen>
        {card.parentCount > 1 ? <Tag className="wkind">{m.wiki.aggregation.parentCount(card.parentCount)}</Tag> : null}
        <span className="sp" />
      </div>
      <div ref={summary} className={`wm fade-lines${summaryCut ? ' clipped' : ''}`}>{card.summary}</div>
      <div className="wf">
        {m.wiki.aggregation.cardFooter(
          card.childCount > 0 ? card.childCount : null, card.memberCount, fmt.date(card.updated),
        )}
      </div>
      {onRemove === undefined
        ? null
        : (
          <RowActions>
            <IconButton
              label={m.wiki.removeFromPage} size="nested" className="rx" aria-disabled={pending}
              onClick={(e) => { e.stopPropagation(); onRemove() }}
            ><IconCross /></IconButton>
          </RowActions>
        )}
    </ResearchObjectCard>
  )
}

/**
 * The demo's paperCard; a click opens this paper's page, and its title is the card's button. The title
 * takes up to two lines, and the year, venue and topics one.
 */
function PaperCard({ paper, onOpen }: { paper: PaperRow; onOpen: () => void }) {
  const m = useMessages()
  const title = useRef<HTMLSpanElement>(null)
  const titleCut = useClipped(title, paper.title, true)
  const line = [`${paper.year ?? ''} ${paper.venue}`.trim(), paper.topics.join(' / ')]
    .filter((part) => part !== '').join(' · ')
  return (
    <ResearchObjectCard variant="grid" className="wkcard wkcard--paper" data-wk={`${PAPER_PAGE}${paper.id}`} onActivate={onOpen}>
      <div className="wt">
        <Tag tone="paper" className="wkind">{m.wiki.paperKind}</Tag>
        <Tooltip label={plainTitle(paper.title)} whenClipped>
          <CardOpen className="tt"><span ref={title} className={`tt-lines fade-lines${titleCut ? ' clipped' : ''}`}><PaperText text={paper.title} /></span></CardOpen>
        </Tooltip>
        <span className="sp" />
      </div>
      <FadeText className="wm" label={line}>{line}</FadeText>
      <div className="wf">{m.wiki.paperCardFooter(paper.noteCount, paper.conclusionCount)}</div>
    </ResearchObjectCard>
  )
}

/** A cell with an anchor: its value, then the anchor that opens the source at its page through `onAnchor`. */
function Cell({ cell, onAnchor }: { cell: WikiCell; onAnchor: (page: number) => void }) {
  return <>{cell.value} <SourceAnchor page={cell.page} quote={cell.quote} onOpen={() => onAnchor(cell.page)} /></>
}

/** The body rows of the comparison table in `box`, in document order. */
const comparisonRows = (box: HTMLElement) => [...box.querySelectorAll<HTMLElement>('tbody tr')]

/**
 * The paper comparison: rows are member papers, columns come from the aggregation's columns, empty
 * cells show a dash, and derived columns show chips. Every header cell has a body cell under it in
 * every row. An inner node with no columns and no rows takes no papers directly. Like an embedded
 * list, it shows its header and first five rows as rendered, and the rest scroll inside it.
 */
function Table({ agg, onOpen, onAnchor, onRemove, pending, adding, head }: {
  agg: WikiAggregation
  onOpen: (id: string) => void
  /** Opens the source of the paper page `paper` at `page`. */
  onAnchor: (paper: string, page: number) => void
  onRemove?: (paperId: string) => void
  pending?: boolean
  /** The placeholder row for adding a paper: `row` goes on its `<tr>`, `input` sits in its first cell. */
  adding?: { row: RefObject<HTMLTableRowElement | null>; input: ReactNode } | undefined
  /**
   * The cells at the end of the header row: `controls` holds the add-column + and the column-settings
   * gear; `newColumn` is the placeholder header cell for a new column, null while it is closed. While
   * it is open, every body row leaves an empty cell in the same position.
   */
  head?: { controls: ReactNode; newColumn: ReactNode } | undefined
}) {
  const m = useMessages()
  const wrap = useRef<HTMLDivElement | null>(null)
  const wrapFade = useScrollFade('both', wrap)
  const cap = useRowCap(wrap, comparisonRows, EMBEDDED_LIST_ROW_LIMIT)
  if (adding === undefined) {
    if (agg.columns.length === 0 && agg.rows.length === 0) {
      return <EmptyState variant="section">{m.wiki.noDirectPapers}</EmptyState>
    }
    if (agg.rows.length === 0) return <EmptyState variant="section">{m.wiki.noPapers}</EmptyState>
  }
  return (
    <div className="cmpwrap" ref={wrapFade} data-fade-held="top" style={cap === null ? undefined : { maxHeight: cap }}>
      <table className="cmp">
        <thead>
          <tr>
            <th>{m.wiki.paperKind}</th>
            {agg.columns.map((c) => <th key={c.key}>{c.label}</th>)}
            {agg.derivedColumns.map((d) => (
              <th className="dv" key={d.key}>{d.label}<Tag className="wkind">{m.wiki.autoColumn}</Tag></th>
            ))}
            {head?.newColumn}
            {onRemove === undefined ? null : <th className="rx" />}
            {head === undefined ? null : <th className="th-add">{head.controls}</th>}
          </tr>
        </thead>
        <tbody>
          {agg.rows.map((row) => (
            <tr key={row.paper.id} data-row-actions="">
              <td className="rh">
                <EntityLink
                  kind="paper" label={<PaperText text={row.paper.title} />} data-wk={row.paper.id}
                  title={row.paper.fullTitle === undefined ? undefined : plainTitle(row.paper.fullTitle)}
                  onOpen={() => onOpen(row.paper.id)}
                />
              </td>
              {agg.columns.map((c) => {
                const cell = row.cells[c.key]
                return cell === undefined
                  ? <td className="na" key={c.key}>—</td>
                  : <td key={c.key}><Cell cell={cell} onAnchor={(page) => onAnchor(row.paper.id, page)} /></td>
              })}
              {agg.derivedColumns.map((d) => {
                const links = row.derived[d.key] ?? []
                return (
                  <td className="dv" key={d.key}>
                    {links.length === 0 ? '—' : links.map((l) => (
                      <Tooltip key={l.id} label={l.fullTitle}>
                        <TagButton shape="chip" className="tagchip" data-wk={l.id} onClick={() => onOpen(l.id)}>
                          {l.title}
                        </TagButton>
                      </Tooltip>
                    ))}
                  </td>
                )
              })}
              {head === undefined || head.newColumn === null ? null : <td />}
              {onRemove === undefined
                ? null
                : (
                  <td className="rx">
                    <RowActions>
                      <IconButton
                        label={m.wiki.removeFromPage} size="nested" aria-disabled={pending}
                        onClick={() => onRemove(row.paper.id)}
                      ><IconCross /></IconButton>
                    </RowActions>
                  </td>
                )}
              {head === undefined ? null : <td className="td-add" />}
            </tr>
          ))}
          {adding === undefined
            ? null
            : (
              <tr className="newrow" ref={adding.row}>
                <td className="rh">{adding.input}</td>
                {agg.columns.map((c) => <td className="na" key={c.key}>—</td>)}
                {agg.derivedColumns.map((d) => <td className="na dv" key={d.key}>—</td>)}
                {head === undefined || head.newColumn === null ? null : <td />}
                {onRemove === undefined ? null : <td className="rx" />}
                {head === undefined ? null : <td className="td-add" />}
              </tr>
            )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Column settings: rename or delete existing columns one by one. Save hands over the whole set of
 * columns and is disabled while any column name is empty. It renders in the popover of the gear at
 * the end of the header row; adding a column is not here but on the + next to it.
 */
function ColumnsEditor({ columns, onSave, onCancel }: {
  columns: WikiColumn[]; onSave: (columns: WikiColumn[]) => void; onCancel: () => void
}) {
  const m = useMessages()
  const [rows, setRows] = useState(columns)
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
        <button className="btn" onClick={onCancel}>{m.common.cancel}</button>
        <button
          className="btn pri" disabled={rows.some((c) => c.label.trim() === '')}
          onClick={() => onSave(rows.map((c) => ({ key: c.key, label: c.label.trim() })))}
        >{m.common.save}</button>
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

  // The body scrolls inside .desk-body: on every scroll, take the last heading that reached its top.
  useEffect(() => {
    const scroller = main.current?.closest('.desk-body')
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
      <SectionHeading variant="rail">{m.wiki.toc}</SectionHeading>
      <ul className="wktoc">
        {headings.map((h) => (
          <li className={`l${h.depth - base + 1}${h.id === active ? ' on' : ''}`} key={h.id}>
            <button
              type="button"
              onClick={() => main.current?.querySelector<HTMLElement>(`#${h.id}`)?.scrollIntoView({ block: 'start' })}
            ><FadeText label={h.text}>{h.text}</FadeText></button>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Wiki: two kinds of aggregation over a base of papers. The home shows one grid of root cards per
 * kind, then the paginated papers; an aggregation card opens its aggregation page, and a paper card
 * or a paper comparison row title opens that paper's page. An aggregation page has fixed sections
 * (subpages, paper comparison) under its title, then a Markdown body that can be edited in place. A
 * paper page has only the user's reading notes and the body. The contents list in the right rail
 * lists the body's headings. The home, aggregation and paper pages come from wiki.home /
 * wiki.aggregation / wiki.paper, and the home's papers from papers.list.
 * This screen holds no vault data of its own. Back follows history: when another screen jumped here,
 * that screen is on the stack too, and going back past the last page returns to it.
 */
export function Wiki() {
  const fmt = useFormat()
  const m = useMessages()
  const railFade = useScrollFade('y')
  const paperRailFade = useScrollFade('y')
  const entry = useScreenEntry()
  const { jump, open: jumpTo, returnTo } = useJump()
  const { revision } = useVaultRevision()
  const [place, setPlace] = useState<Place>(null)
  const [stack, setStack] = useState<Step[]>([])
  const [home, setHome] = useState<WikiHome | null>(null)
  const [rows, setRows] = useState<PaperRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(PAGE_SIZES[0]!)
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
  const [error, setError] = useState<string | null>(null)
  const consumed = useRef(0)
  const main = useRef<HTMLDivElement>(null)
  const reportError = useCallback((e: unknown) => setError(errorLabel(m, e)), [m])
  const notice = useNotice()
  const write = useVaultWrite()
  const undo = useUndo()
  const box = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(false)
  const [adding, setAdding] = useState<'child' | 'paper' | 'columns' | null>(null)
  const [newCol, setNewCol] = useState(false)
  const addRow = useRef<HTMLElement>(null)
  const newPaperRow = useRef<HTMLTableRowElement>(null)
  const newColCell = useRef<HTMLTableCellElement>(null)
  const childBtn = useRef<HTMLButtonElement>(null)
  const paperBtn = useRef<HTMLButtonElement>(null)
  const colBtn = useRef<HTMLButtonElement>(null)
  const colAdd = useRef<HTMLButtonElement>(null)

  // A page change or vault write discards the source being edited: as with Project notes, anything
  // that re-renders the whole screen discards it.
  useEffect(() => setEditing(false), [place, revision])

  // A page change or vault write also closes whichever add row or column editor is open.
  useEffect(() => {
    setAdding(null)
    setNewCol(false)
  }, [place, revision])

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
    }), { note, action: undoable ? undo.change : undefined }).finally(() => setPending(false))
  }

  /**
   * Opens the add row `what`: if another one is open, switches to it; if this one is already open,
   * moves focus back to its PickRow input. Also closes the placeholder column at the end of the
   * header row, here, rather than relying on a click-outside or focus-loss check.
   */
  const open = (what: 'child' | 'paper') => {
    setNewCol(false)
    if (adding !== what) { setAdding(what); return }
    const held = what === 'paper' ? newPaperRow.current : addRow.current
    held?.querySelector('input')?.focus()
  }

  // An entry from the sidebar lands on the Wiki home; a jump from another screen lands on the page it
  // points to, with the origin screen on the stack for Back.
  useEffect(() => {
    if (jump !== null && jump.seq !== consumed.current) {
      consumed.current = jump.seq
      setPlace(jump.target)
      setStack([{ origin: jump.from }])
      return
    }
    setPlace(null)
    setStack([])
  }, [entry, jump])

  useEffect(() => {
    void wiki.home().then(setHome).catch(reportError)
  }, [revision, reportError])

  useEffect(() => {
    void papers.list({ page, size }).then((r) => {
      setRows(r.rows)
      setTotal(r.total)
    }).catch(reportError)
  }, [page, size, revision, reportError])

  useEffect(() => {
    void wiki.proposals().then(setProposals).catch(reportError)
  }, [revision, reportError])

  useEffect(() => {
    void wiki.signals().then(setSignals).catch(reportError)
  }, [revision, reportError])

  // The tidying list names each row's page: aggregations and projects from their lists, papers one by
  // one; and the claims a conflict is with, from their pages.
  useEffect(() => {
    setTidyTitles(null)
    if (place !== TIDY || signals === null) return
    let live = true
    const rows = tidyRows(signals)
    const pages = rows.map((row) => row.page)
    const paperPages = [...new Set(pages.filter((id) => id.startsWith(PAPER_PAGE)))]
    const claimPages = [...new Set(rows.filter((row) => row.kind === 'open-conflict')
      .flatMap((row) => row.targets.map((ref) => ref.split('#')[0]!)))]
    void Promise.all([
      wiki.cards(), project.list(),
      Promise.all(paperPages.map(async (id) => [id, (await papers.get(id.slice(PAPER_PAGE.length))).title] as const)),
      Promise.all(claimPages.map(async (id) => (await wiki.aggregation(id)).claims.map((c) => [`${id}#${c.id}`, c.text] as const))),
    ]).then(([cards, projects, paperTitles, claimTexts]) => {
      if (live) {
        setTidyTitles(Object.fromEntries([
          ...cards.map((c) => [c.id, c.title] as const),
          ...projects.map((p) => [`${PROJECT_PAGE}${p.id}`, p.name] as const),
          ...paperTitles,
          ...claimTexts.flat(),
        ]))
      }
    }).catch(reportError)
    return () => { live = false }
  }, [place, signals, reportError])

  useEffect(() => {
    setError(null)
    if (place === null || place === REVIEW || place === TIDY) return
    if (place.startsWith(PAPER_PAGE)) void wiki.paper(place).then(setPaper).catch(reportError)
    else void wiki.aggregation(place).then(setAgg).catch(reportError)
  }, [place, revision, reportError])

  useEffect(() => {
    if (place === null || place === REVIEW || place === TIDY) return
    let live = true
    void wiki.backlinks(place)
      .then((links) => { if (live) setBacklinks({ page: place, links }) })
      .catch(reportError)
    return () => { live = false }
  }, [place, revision, reportError])

  useEffect(() => {
    setReading(null)
    if (place === null || !place.startsWith(PAPER_PAGE)) return
    let live = true
    const paperId = place.slice(PAPER_PAGE.length)
    void papers.reading(paperId)
      .then((value) => { if (live) setReading(value) })
      .catch(reportError)
    return () => { live = false }
  }, [place, revision, reportError])

  const goHome = useCallback(() => {
    setPlace(null)
    setStack([])
  }, [])

  const go = useCallback((next: Place) => {
    setPlace((current) => {
      if (next === current) return current
      setStack((s) => [...s, { place: current }])
      return next
    })
  }, [])

  const back = () => {
    const top = stack.at(-1)
    setStack((s) => s.slice(0, -1))
    if (top === undefined) setPlace(null)
    else if ('origin' in top) returnTo(top.origin)
    else setPlace(top.place)
  }

  /** Opens the reader at `page` of the paper whose Wiki page is `paper`. */
  const openSource = (paper: string, page: number) => jumpTo('reader', paper.slice(PAPER_PAGE.length), { page })

  const claimLinks: ClaimLinks = {
    openPage: go,
    openProject: (id) => jumpTo('project', id),
    openReader: (paper, anchor) => jumpTo('reader', paper.slice(PAPER_PAGE.length), anchor),
  }

  const shownAgg = agg !== null && place === agg.id ? agg : null
  const shownPaper = paper !== null && place === paper.id ? paper : null
  const shownReading = shownPaper !== null && reading?.paperId === shownPaper.id.slice(PAPER_PAGE.length)
    ? reading : null
  const shownBacklinks = backlinks !== null && backlinks.page === place ? backlinks.links : []

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
      reportError(e)
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
    )).catch((e: Error) => {
      setPending(false)
      reportError(e)
    })
  }

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
    ?? (place === REVIEW ? m.wiki.queue.title(queued) : null)
    ?? (place === TIDY ? m.wiki.tidy.title(tidy?.length ?? 0) : null)
    ?? (home === null ? 'Wiki' : m.wiki.title(home.aggregationCount))
  const tidyCount = tidy?.length ?? 0

  /** Applies or declines a queued proposal; a proposal Core refuses on apply is reported with its reason. */
  const decide = (proposal: WikiProposal, decision: 'apply' | 'decline', reason?: string) => {
    setPending(true)
    void write(wiki.decide(proposal.id, decision, reason).then((receipt) => {
      if (decision === 'decline') notice.success(m.wiki.queue.declinedNote)
      else if (receipt.status === 'applied') notice.success(m.wiki.queue.appliedNote)
      else notice.refusal(m.wiki.queue.rejectedNote(receipt.reason?.message ?? ''))
    })).finally(() => setPending(false))
  }

  /**
   * Reads the edited source back and writes it; the vault revision bump after the write makes this
   * page fetch again.
   */
  const saveBody = () => {
    if (saving) return
    const next = box.current?.innerText.trim() ?? ''
    setSaving(true)
    void write(wiki.update(place!, next).then(() => {
      setEditing(false)
    }), { note: m.wiki.saved }).finally(() => setSaving(false))
  }

  /** The body's section heading: the page name on the left, its EditActions on the right, like Project notes. */
  const bodyHead = (name: string) => (
    <SectionHeading
      actions={(
        <EditActions
          editing={editing} saving={saving} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)}
          onSave={saveBody}
        />
      )}
    >{name}
    </SectionHeading>
  )

  /**
   * A Wiki paper page's bibliographic fields are the same frontmatter the paper list edits; only
   * papers.update writes them.
   */
  const updateWikiPaper = (
    patch: Partial<PaperFields>, label: string,
  ): Promise<boolean> => {
    if (shownPaper === null) return Promise.resolve(false)
    const paperId = shownPaper.id.startsWith(PAPER_PAGE)
      ? shownPaper.id.slice(PAPER_PAGE.length) : shownPaper.id
    return write(papers.update(paperId, patch), { note: m.project.identity.focusUpdated(label) })
  }

  return (
    <PageShell>
      <PageHeader
        actions={shownPaper !== null
          ? (
            <>
              {/* Papers filters its table down to this paper by title; the user continues from that row's details. */}
              <button className="btn" onClick={() => jumpTo('papers', shownPaper.title)}>{m.wiki.viewInPaperList}</button>
              <button className="btn" onClick={() => jumpTo('reader', shownPaper.id.slice(PAPER_PAGE.length))}>
                {m.papers.understanding.goRead}
              </button>
            </>
          )
          : place === null && (queued > 0 || tidyCount > 0)
            ? (
              <>
                {queued === 0 ? null : (
                  <button type="button" className="btn" onClick={() => go(REVIEW)}>{m.wiki.queue.entry}<CountBadge count={queued} /></button>
                )}
                {tidyCount === 0 ? null : (
                  <button type="button" className="btn" onClick={() => go(TIDY)}>{m.wiki.tidy.entry}<CountBadge count={tidyCount} /></button>
                )}
              </>
            )
            : undefined}
      >
        {place === null ? null : <BackButton onClick={back} />}
        <PageTitle label={shownAgg?.title ?? (shownPaper === null ? undefined : plainTitle(shownPaper.title))}>{title}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody className="wiki-body">
        {error === null && (place === null ? home === null : place !== REVIEW && place !== TIDY && shownAgg === null && shownPaper === null)
          ? <LoadingPlaceholder shape="cards" />
          : null}
        {shownAgg !== null
          ? (
            <div className="wkpage">
              <div className="wkmain" ref={main}>
                <SectionHeading
                  actions={(
                    <AddAction
                      variant="section" ref={childBtn} disabled={pending}
                      label={m.wiki.addKind(shownAgg.kindLabel)} onClick={() => open('child')}
                    >{shownAgg.kindLabel}</AddAction>
                  )}
                >{m.wiki.subdivisionsHeading(shownAgg.kindLabel)}
                </SectionHeading>
                {shownAgg.children.length === 0 && adding !== 'child'
                  ? <EmptyState variant="section">{m.wiki.noChildren}</EmptyState>
                  : (
                    <div className="wkgrid">
                      {shownAgg.children.map((c) => (
                        <AggregationCard
                          key={c.id} card={c} pending={pending}
                          onOpen={() => go(c.id)} onRemove={() => unmount(c)}
                        />
                      ))}
                      {adding === 'child'
                        ? (
                          <ResearchObjectCard variant="grid" className="wkcard newcard" cardRef={addRow}>
                            <div className="wt">
                              <Tag tone="wiki" className="wkind">{shownAgg.kindLabel}</Tag>
                              <PickRow
                                row={addRow} triggers={[childBtn, paperBtn, colBtn]} allowNew
                                placeholder={m.wiki.kindNamePlaceholder(shownAgg.kindLabel)}
                                suggest={suggestChildren} onPick={mount} onNew={create}
                                onCancel={() => setAdding(null)} onError={reportError}
                              />
                            </div>
                            <div className="wf" />
                          </ResearchObjectCard>
                        )
                        : null}
                    </div>
                  )}
                <SectionHeading
                  actions={(
                    <AddAction
                      variant="section" ref={paperBtn} disabled={pending}
                      label={m.wiki.addPaperTitle} onClick={() => open('paper')}
                    >{m.wiki.paperKind}</AddAction>
                  )}
                >{m.wiki.paperComparisonHeading}
                </SectionHeading>
                <Table
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
                          onError={reportError}
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
                            variant="icon" className="colbtn" ref={colAdd} disabled={pending}
                            label={m.wiki.aggregation.addColumn}
                            onClick={() => {
                              if (newCol) { newColCell.current?.querySelector('input')?.focus(); return }
                              setAdding(null)
                              setNewCol(true)
                            }}
                          />
                          <ActionPopover
                            open={adding === 'columns'}
                            onOpenChange={(next) => setAdding(next ? 'columns' : null)}
                            contentClassName="ctxmenu colpop" sticky="always"
                            trigger={(
                              <IconButton
                                label={m.wiki.columnSettings} size="nested" className="colbtn" ref={colBtn} disabled={pending}
                              ><IconGear /></IconButton>
                            )}
                          >
                            {/*
                              * Adding a column widens the table and moves the end of the header row; the
                              * popover stays inside the window, like the paper table's column menu.
                              */}
                                <ColumnsEditor
                                  columns={shownAgg.columns} onCancel={() => setAdding(null)}
                                  onSave={(columns) => {
                                    if (pending) return
                                    propose(
                                      m.wiki.proposals.changeColumns(shownAgg.title),
                                      [{ op: 'setColumns', page: shownAgg.id, columns }],
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
                            onCreate={createColumn} onCancel={() => setNewCol(false)}
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
                    )
                  }}
                />
                <WikiClaims
                  page={shownAgg} pending={pending} links={claimLinks}
                  onApply={(note, ops, options) => propose(note, ops, m.wiki.claims.saved, options?.undoable)}
                  arrival={arrival?.page === shownAgg.id ? arrival.claim : undefined} onArrived={arrived}
                />
                {bodyHead(shownAgg.title)}
                <MarkdownBox
                  text={shownAgg.body} editing={editing} box={box} onCancel={() => setEditing(false)} onSave={saveBody}
                  onOpen={go}
                  titles={shownAgg.titles} empty={<EmptyState variant="section">{m.wiki.noBody}</EmptyState>}
                />
              </div>
              <div className="wkside" ref={railFade} data-fade-paint="">
                <SectionHeading variant="rail">{m.project.identity.heading}</SectionHeading>
                <div className="wkprops">
                  <div className="pk">{m.project.identity.typeLabel}</div><div className="pv">{shownAgg.kindLabel}</div>
                  <div className="pk">{m.project.identity.nameLabel}</div>
                  <InlineMetadataField
                    label={m.wiki.nameFieldLabel} value={shownAgg.title}
                    onSave={(title) => {
                      const next = title.trim()
                      if (next === '') { notice.refusal(m.wiki.nameRequired); return false }
                      return propose(m.wiki.proposals.editMetadata(shownAgg.title), [{
                        op: 'setAggregationMetadata', page: shownAgg.id, title: next,
                        splitOn: shownAgg.splitOn ?? null,
                      }])
                    }}
                  />
                  <div className="pk">{m.wiki.scaleLabel}</div>
                  <div className="pv">
                    {m.wiki.scaleSummary(shownAgg.memberCount, shownAgg.childCount)}
                  </div>
                  <div className="pk">{m.wiki.splitOnLabel}</div>
                  <InlineMetadataField
                    label={m.wiki.splitOnLabel} value={shownAgg.splitOn ?? ''}
                    onSave={(splitOn) => propose(m.wiki.proposals.editMetadata(shownAgg.title), [{
                      op: 'setAggregationMetadata', page: shownAgg.id, title: shownAgg.title,
                      splitOn: splitOn.trim() || null,
                    }])}
                  />
                  <div className="pk">{m.wiki.updatedLabel}</div><div className="pv">{fmt.date(shownAgg.updated)}</div>
                </div>
                <RailLinks
                  heading={m.project.sections.links}
                  rows={[
                    ...shownAgg.parents.length > 0 ? [{ label: m.wiki.belongsTo, links: shownAgg.parents.map(pageLink) }] : [],
                    ...shownAgg.related.map((r) => ({ label: r.label, links: r.links.map(pageLink) })),
                  ]}
                />
                <WikiBacklinks links={shownBacklinks} onOpen={openBacklink} />
                <Toc body={shownAgg.body} main={main} />
              </div>
            </div>
          )
          : null}

        {shownPaper !== null
          ? (
            <div className="wkpage">
              <div className="wkmain" ref={main}>
                <PaperUnderstanding
                  reading={shownReading}
                  onRead={(anchor) => jumpTo(
                    'reader', shownPaper.id.slice(PAPER_PAGE.length), anchor,
                  )}
                />
                {bodyHead(m.wiki.internalizedContent)}
                <MarkdownBox
                  text={shownPaper.body} editing={editing} box={box} onCancel={() => setEditing(false)} onSave={saveBody}
                  onOpen={go} onAnchor={(page) => openSource(shownPaper.id, page)}
                  titles={shownPaper.titles}
                  empty={<EmptyState variant="section">{m.wiki.noInternalizedContent}</EmptyState>}
                />
              </div>
              <div className="wkside" ref={paperRailFade} data-fade-paint="">
                <SectionHeading variant="rail">{m.project.identity.heading}</SectionHeading>
                <div className="wkprops">
                  <div className="pk">{m.project.identity.typeLabel}</div><div className="pv">{m.wiki.paperKind}</div>
                  <div className="pk">{m.wiki.titleLabel}</div>
                  <InlineMetadataField
                    label={m.wiki.titleLabel} value={shownPaper.title}
                    onSave={(title) => {
                      const next = title.trim()
                      if (next === '') { notice.refusal(m.wiki.titleRequired); return false }
                      return updateWikiPaper({ title: next }, m.wiki.titleLabel)
                    }}
                  />
                  <div className="pk">{m.wiki.shortTitleLabel}</div>
                  <InlineMetadataField
                    label={m.wiki.shortTitleLabel} value={shownPaper.short}
                    onSave={(shortTitle) => updateWikiPaper(
                      { shortTitle: shortTitle.trim() || null }, m.wiki.shortTitleLabel,
                    )}
                  />
                  <div className="pk">{m.wiki.authorsLabel}</div>
                  <InlineMetadataField
                    label={m.wiki.authorsLabel} value={shownPaper.authors.join(', ')}
                    onSave={(authors) => updateWikiPaper({
                      authors: authors.split(/[,，;；\n]/).map((item) => item.trim()).filter(Boolean),
                    }, m.wiki.authorsLabel)}
                  />
                  <div className="pk">{m.wiki.yearLabel}</div>
                  <InlineMetadataField
                    label={m.wiki.yearLabel} value={shownPaper.year?.toString() ?? ''} inputMode="numeric"
                    onSave={(year) => {
                      const text = year.trim()
                      if (text === '') return updateWikiPaper({ year: null }, m.wiki.yearLabel)
                      const next = Number(text)
                      if (!Number.isInteger(next) || next < 1000 || next > 3000) {
                        notice.refusal(m.wiki.yearRange)
                        return false
                      }
                      return updateWikiPaper({ year: next }, m.wiki.yearLabel)
                    }}
                  />
                  <div className="pk">{m.wiki.venueLabel}</div>
                  <InlineMetadataField
                    label={m.wiki.venueLabel} value={shownPaper.venue}
                    onSave={(venue) => updateWikiPaper({ venue: venue.trim() }, m.wiki.venueLabel)}
                  />
                  {shownPaper.pdf === ''
                    ? null
                    : (
                      <>
                        <div className="pk">{m.wiki.originalLabel}</div>
                        <div className="pv lm">{shownPaper.pdf}</div>
                      </>
                    )}
                  <div className="pk">{m.wiki.updatedLabel}</div><div className="pv">{fmt.date(shownPaper.updated)}</div>
                </div>
                <SectionHeading variant="rail">{m.wiki.membershipHeading}</SectionHeading>
                {shownPaper.memberships.length === 0
                  ? <EmptyState variant="section">{m.wiki.noMembership}</EmptyState>
                  : shownPaper.memberships.map((ms) => (
                    <div className="memb" key={ms.aggregation.id}>
                      <div className="wkrel">
                        <Tag tone="wiki" className="wkind">{ms.kindLabel}</Tag>
                        <TagButton
                          shape="chip" className="tagchip" data-wk={ms.aggregation.id}
                          onClick={() => go(ms.aggregation.id)}
                        >{ms.aggregation.title}</TagButton>
                      </div>
                      <div className="wkprops">
                        {ms.cells.map((c) => (
                          <Fragment key={c.label}>
                            <div className="pk">{c.label}</div>
                            <div className="pv">
                              <Cell cell={c.cell} onAnchor={(page) => openSource(shownPaper.id, page)} />
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                <WikiBacklinks links={shownBacklinks} onOpen={openBacklink} />
                <Toc body={shownPaper.body} main={main} />
              </div>
            </div>
          )
          : null}

        {place === REVIEW
          ? (
            <ReviewQueue
              proposals={proposals} pending={pending} links={claimLinks}
              onOpenConclusion={(project, conclusion) => jumpTo('project', project, { conclusion })}
              onApply={(proposal) => decide(proposal, 'apply')}
              onDecline={(proposal, reason) => decide(proposal, 'decline', reason === '' ? undefined : reason)}
            />
          )
          : null}

        {place === TIDY
          ? tidy === null ? <LoadingPlaceholder shape="rows" /> : <TidyList rows={tidy} titles={tidyTitles} onOpen={openSignal} />
          : null}

        {place === null && home !== null
          ? (
            <>
              {home.kinds.map((k) => {
                const roots = home.roots.filter((c) => c.kind === k.key)
                return roots.length === 0 ? null : (
                  <Fragment key={k.key}>
                    <SectionHeading>{k.label}</SectionHeading>
                    <div className="wkgrid">
                      {roots.map((c) => <AggregationCard key={c.id} card={c} onOpen={() => go(c.id)} />)}
                    </div>
                  </Fragment>
                )
              })}

              <SectionHeading>{m.project.sections.papers}</SectionHeading>
              <div className="wkgrid">
                {rows.map((p) => <PaperCard key={p.id} paper={p} onOpen={() => go(`${PAPER_PAGE}${p.id}`)} />)}
              </div>
            </>
          )
          : null}
      </PageBody>

      {place === null
        ? (
          <Pager
            total={total} page={page} size={size} sizes={PAGE_SIZES}
            onPage={setPage} onSize={setSize}
          />
        )
        : null}

    </PageShell>
  )
}
