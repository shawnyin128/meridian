import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type {
  PaperFields, PaperReading, PaperRow, Proposal, WikiAggregation, WikiAggregationCard, WikiCell, WikiColumn, WikiHome,
  WikiPaper,
} from '../../shared/contract.js'
import { PAPER_PAGE } from '../../shared/vocabulary.js'
import { papers, wiki } from '../ipc.js'
import {
  useCrumbTail, useJump, useScreenEntry, useToast, useVaultRevision, type CrumbSeg, type ScreenKey,
} from '../shell/AppShell.js'
import { AddAction } from '../components/AddAction.js'
import { ActionPopover } from '../components/ActionPopover.js'
import { BackButton } from '../components/BackButton.js'
import { EmptyState } from '../components/EmptyState.js'
import { FormInput } from '../components/FormControls.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { IconCross, IconGear } from '../components/icons.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import { InlineMetadataField } from '../components/InlineField.js'
import { NewColumnHead } from '../components/paper-table/ColumnAdd.js'
import { headingsOf, MarkdownBox } from '../components/Markdown.js'
import { Pager } from '../components/Pager.js'
import { shortTitle } from '../lib/paper-title.js'
import { PickRow, type PickHit } from '../components/PickRow.js'
import { nextKey, slugOf } from '../lib/slug.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { PaperUnderstanding } from '../components/paper/PaperUnderstanding.js'
import './shell.css'
import './Wiki.css'

/** demo's pagerHTML('wkp', …, [12,24,48]): each page of the paper. */
const PAGE_SIZES = [12, 24, 48]

/** Which page are you currently looking at: null is the home page, and the rest are the ids of aggregate or paper pages. */
type Place = string | null

/** Return to one space on the stack: the previous page in the wiki, or the screen that jumped us in. */
type Step = { place: Place } | { origin: ScreenKey }

/** The original text of the hovered grid and where the prompt box should be. */
type Tip = { page: number; quote: string; left: number; top: number }

/**
 * demo's aggCard: category label, title, "N superiors" label when multiple parent aggregation, the first line of the description, the last line is the subdivision number,
 * Number of members and update date.
 */
function AggregationCard({ card, onOpen, onRemove, pending }: {
  card: WikiAggregationCard; onOpen: () => void; onRemove?: () => void; pending?: boolean
}) {
  const fmt = useFormat()
  const m = useMessages()
  return (
    <div className="wkcard" data-wk={card.id} title={card.summary} onClick={onOpen}>
      {onRemove === undefined
        ? null
        : (
          <button
            className="rx" title={m.wiki.removeFromPage} aria-disabled={pending}
            onClick={(e) => { e.stopPropagation(); onRemove() }}
          ><IconCross sw={2.5} /></button>
        )}
      <div className="wt">
        <span className="wkind k-wiki">{card.kindLabel}</span>
        <span className="tt">{card.title}</span>
        {card.parentCount > 1 ? <span className="wkind">{m.wiki.aggregation.parentCount(card.parentCount)}</span> : null}
        <span className="sp" />
      </div>
      <div className="wm">{card.summary}</div>
      <div className="wf">
        {m.wiki.aggregation.cardFooter(
          card.childCount > 0 ? card.childCount : null, card.memberCount, fmt.date(card.updated),
        )}
      </div>
    </div>
  )
}

/** Demo's paperCard: Take only the part before the colon for the title, and click on the paper page of this article. */
function PaperCard({ paper, onOpen }: { paper: PaperRow; onOpen: () => void }) {
  const m = useMessages()
  const line = [`${paper.year ?? ''} ${paper.venue}`.trim(), paper.topics.join(' / ')]
    .filter((part) => part !== '').join(' · ')
  return (
    <div className="wkcard" data-wk={`${PAPER_PAGE}${paper.id}`} title={paper.title} onClick={onOpen}>
      <div className="wt">
        <span className="wkind k-paper">{m.wiki.paperKind}</span>
        <span className="tt">{shortTitle(paper.title)}</span><span className="sp" />
      </div>
      <div className="wm">{line}</div>
      <div className="wf">{m.wiki.paperCardFooter(paper.noteCount, paper.conclusionCount)}</div>
    </div>
  )
}

/** Grid with anchor points: The value is superscripted with the page number, and the original text it refers to is revealed when hovering. */
function Cell({ cell, onTip }: { cell: WikiCell; onTip: (tip: Tip | null) => void }) {
  return (
    <span
      className="anc"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onTip({ page: cell.page, quote: cell.quote, left: r.left, top: r.bottom + 8 })
      }}
      onMouseLeave={() => onTip(null)}
    >
      {cell.value}<sup>p{cell.page}</sup>
    </span>
  )
}

/**
 * Comparison of papers: rows are member papers, columns are from aggregated columns, unfilled cells are a dash, and derived columns are chips.
 * The internal node has no columns or rows, which means it does not directly accept papers.
 */
function Table({ agg, onOpen, onTip, onRemove, pending, adding, head }: {
  agg: WikiAggregation
  onOpen: (id: string) => void
  onTip: (tip: Tip | null) => void
  onRemove?: (paperId: string) => void
  pending?: boolean
  /** Add a placeholder line for the paper: `row` is hung on `<tr>`, and `input` is the input box in the line header. */
  adding?: { row: RefObject<HTMLTableRowElement | null>; input: ReactNode } | undefined
  /**
   * The cell at the end of the header: `controls` is the column + and column setting gear, `newColumn` is the open placeholder header cell,
   * It is null when it is not turned on - when it is turned on, each row of the table body also leaves an empty space at the same position.
   */
  head?: { controls: ReactNode; newColumn: ReactNode } | undefined
}) {
  const m = useMessages()
  if (adding === undefined) {
    if (agg.columns.length === 0 && agg.rows.length === 0) {
      return <p className="lm">{m.wiki.noDirectPapers}</p>
    }
    if (agg.rows.length === 0) return <EmptyState variant="section">{m.wiki.noPapers}</EmptyState>
  }
  return (
    <div className="cmpwrap">
      <table className="cmp">
        <thead>
          <tr>
            <th>{m.wiki.paperKind}</th>
            {agg.columns.map((c) => <th key={c.key}>{c.label}</th>)}
            {agg.derivedColumns.map((d) => (
              <th className="dv" key={d.key}>{d.label}<span className="wkind">{m.wiki.autoColumn}</span></th>
            ))}
            {head?.newColumn}
            {onRemove === undefined ? null : <th className="rx" />}
            {head === undefined ? null : <th className="th-add">{head.controls}</th>}
          </tr>
        </thead>
        <tbody>
          {agg.rows.map((row) => (
            <tr key={row.paper.id}>
              <td className="rh">
                <span className="wl" data-wk={row.paper.id} onClick={() => onOpen(row.paper.id)}>
                  {row.paper.title}
                </span>
              </td>
              {agg.columns.map((c) => {
                const cell = row.cells[c.key]
                return cell === undefined
                  ? <td className="na" key={c.key}>—</td>
                  : <td key={c.key}><Cell cell={cell} onTip={onTip} /></td>
              })}
              {agg.derivedColumns.map((d) => {
                const links = row.derived[d.key] ?? []
                return (
                  <td className="dv" key={d.key}>
                    {links.length === 0 ? '—' : links.map((l) => (
                      <span className="tagchip" data-wk={l.id} key={l.id} onClick={() => onOpen(l.id)}>
                        {l.title}
                      </span>
                    ))}
                  </td>
                )
              })}
              {head === undefined || head.newColumn === null ? null : <td />}
              {onRemove === undefined
                ? null
                : (
                  <td
                    className="rx" title={m.wiki.removeFromPage} aria-disabled={pending}
                    onClick={() => onRemove(row.paper.id)}
                  ><IconCross sw={2.5} /></td>
                )}
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
              </tr>
            )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Column Editor: Existing columns can be renamed and deleted one by one. Save and hand over the entire set of columns. Save cannot be clicked if any column name is empty.
 * It is rendered in the elastic layer of the gear at the end of the header; the new column is not here, but belongs to the + at the end of the header.
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
          <button
            className="btn plain" title={m.wiki.aggregation.deleteColumn}
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          ><IconCross sw={2.5} /></button>
        </div>
      ))}
      <div className="acts">
        <button className="btn plain" onClick={onCancel}>{m.common.cancel}</button>
        <button
          className="btn pri" disabled={rows.some((c) => c.label.trim() === '')}
          onClick={() => onSave(rows.map((c) => ({ key: c.key, label: c.label.trim() })))}
        >{m.common.save}</button>
      </div>
    </div>
  )
}

/**
 * Table of contents in the right column: titles in the text, the shallowest one-level top grid, and deeper level-by-level indents; wherever the text is scrolled, the entries in that section are highlighted;
 * Click on one to scroll that title into the viewport. The text will not be published if there is no title.
 */
function Toc({ body, main }: { body: string; main: RefObject<HTMLDivElement | null> }) {
  const m = useMessages()
  const headings = useMemo(() => headingsOf(body), [body])
  const [active, setActive] = useState<string | null>(null)

  // The scrolling container of the text is .desk-body: each time you scroll, take the title closest to the top of the viewport.
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
          <li
            className={`l${h.depth - base + 1}${h.id === active ? ' on' : ''}`} key={h.id}
            onClick={() => main.current?.querySelector<HTMLElement>(`#${h.id}`)?.scrollIntoView({ block: 'start' })}
          >{h.text}</li>
        ))}
      </ul>
    </>
  )
}

/**
 * Wiki: two kinds of aggregation plus thesis base. On the home page, only the root node is placed in one grid for each aggregation, and the paginated paper is at the end; the aggregation card enters the aggregation page.
 * The thesis card and thesis comparison headings are entered on the thesis page. The aggregation page is a fixed area (segmentation, paper comparison) with a page title, header, and
 * The text is rendered by markdown and can be edited in place. The paper page only has the text; the table of contents in the right column lists the titles in the text. Home page, aggregate page
 * Take the paper page from wiki.home / wiki.aggregation / wiki.paper, and go to papers.list for the paper page.
 * This screen does not hold libraries. Return is a historical return: when you are jumped in by another screen, the source is also on the stack. If you retreat to the bottom, you will return to that screen.
 */
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
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(PAGE_SIZES[0]!)
  const [agg, setAgg] = useState<WikiAggregation | null>(null)
  const [paper, setPaper] = useState<WikiPaper | null>(null)
  const [reading, setReading] = useState<PaperReading | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const [error, setError] = useState<string | null>(null)
  const consumed = useRef(0)
  const main = useRef<HTMLDivElement>(null)
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const toast = useToast()
  const write = useVaultWrite()
  const box = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(false)
  const [adding, setAdding] = useState<'child' | 'paper' | 'columns' | null>(null)
  const [newCol, setNewCol] = useState(false)
  const addRow = useRef<HTMLDivElement>(null)
  const newPaperRow = useRef<HTMLTableRowElement>(null)
  const newColCell = useRef<HTMLTableCellElement>(null)
  const childBtn = useRef<HTMLButtonElement>(null)
  const paperBtn = useRef<HTMLButtonElement>(null)
  const colBtn = useRef<HTMLButtonElement>(null)
  const colAdd = useRef<HTMLButtonElement>(null)

  // When the page is changed or the library is changed, the original text being edited is discarded: just like the essay, the action of re-rendering the entire screen will also discard it.
  useEffect(() => setEditing(false), [place, revision])

  // When the page is changed or the library is changed, the open management portal will be closed together.
  useEffect(() => {
    setAdding(null)
    setNewCol(false)
  }, [place, revision])

  /**
   * A management operation is a proposal: after the writing is successful, close the input line, increment the entire database version, display this sentence in the banner, and return the written
   * No. `pending` is true when the proposal is on the way.
   */
  const propose = (title: string, ops: Proposal['ops']): Promise<boolean> => {
    setPending(true)
    return write(wiki.apply({ source: 'user', title, ops }).then(() => {
      // The open of the elastic layer of the gear is adding === 'columns'. Successful saving depends on this sentence layer.
      setAdding(null)
    }), { note: title }).finally(() => setPending(false))
  }

  /**
   * Open the management portal `what`: If something else is open, switch to it; when it is open, PickRow returns the focus to the input box.
   * At the same time, remove the placeholder column at the end of the table header, and take it along without relying on the judgment of out-of-point or focus departure.
   */
  const open = (what: 'child' | 'paper') => {
    setNewCol(false)
    if (adding !== what) { setAdding(what); return }
    const held = what === 'paper' ? newPaperRow.current : addRow.current
    held?.querySelector('input')?.focus()
  }

  // Enter from the sidebar and land on the homepage; when jumped from another screen, land on the page pointed to by the jump, and the source is added to the stack for return.
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
    setError(null)
    if (place === null) return
    setTip(null)
    if (place.startsWith(PAPER_PAGE)) void wiki.paper(place).then(setPaper).catch(reportError)
    else void wiki.aggregation(place).then(setAgg).catch(reportError)
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

  const shownAgg = agg !== null && place === agg.id ? agg : null
  const shownPaper = paper !== null && place === paper.id ? paper : null
  const shownReading = shownPaper !== null && reading?.paperId === shownPaper.id.slice(PAPER_PAGE.length)
    ? reading : null

  /** Candidates for subdivision: aggregates of the same category, not on this page, and not yet linked to this page, matched by title, not listed when the input is empty. */
  const suggestChildren = useCallback(async (query: string): Promise<PickHit[]> => {
    if (shownAgg === null || query === '') return []
    const taken = new Set(shownAgg.children.map((c) => c.id))
    const q = query.toLowerCase()
    return (await wiki.cards())
      .filter((c) => c.kind === shownAgg.kind && c.id !== shownAgg.id && !taken.has(c.id))
      .filter((c) => c.title.toLowerCase().includes(q))
      .map((c) => ({ id: c.id, title: c.title, meta: m.project.identity.paperCount(c.memberCount) }))
  }, [shownAgg, m])

  /** Candidates for papers: Those whose titles or topics match the paper list and are not members of this page. If the input is empty, they will not be listed. */
  const suggestPapers = useCallback(async (query: string): Promise<PickHit[]> => {
    if (shownAgg === null || query === '') return []
    const members = new Set(shownAgg.rows.map((r) => r.paper.id))
    return (await papers.list({ page: 1, size: 12, filter: query })).rows
      .filter((r) => !members.has(`${PAPER_PAGE}${r.id}`))
      .map((r) => ({ id: `${PAPER_PAGE}${r.id}`, title: shortTitle(r.title), meta: `${r.year ?? ''} ${r.venue}`.trim() }))
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
    // Fetch that page first before sending out the proposal. The paragraph you fetch is also considered a proposal on the way.
    setPending(true)
    void wiki.aggregation(card.id).then((child) => propose(
      m.wiki.proposals.moveOut(child.title, shownAgg.title),
      [{ op: 'setParents', page: child.id, parents: child.parents.map((p) => p.id).filter((id) => id !== shownAgg.id) }],
    )).catch((e: Error) => {
      setPending(false)
      reportError(e)
    })
  }

  /** Fill in the column names at the end of the header: Add a column to this page. The columns on this page only have names, and there is nothing else configurable after they are created. */
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
      toast(m.wiki.nameNeedsChar)
      return false
    }
    return propose(m.wiki.proposals.createUnder(title, shownAgg.title), [{
      op: 'createAggregation', kind: shownAgg.kind, id: `${shownAgg.id.split('/')[0]}/${slug}`,
      title, parents: [shownAgg.id], columns: [], describe: '',
    }])
  }

  // The middle section of the breadcrumbs of the aggregation page is its first parent, click on that page; the paper page has only itself, the same as the syncCrumb of the demo
  const tail = useMemo<CrumbSeg[]>(() => {
    if (shownAgg !== null) {
      const parent = shownAgg.parents[0]
      return [
        ...(parent === undefined ? [] : [{ text: parent.title, onClick: () => go(parent.id) }]),
        { text: shownAgg.title },
      ]
    }
    if (shownPaper !== null) return [{ text: shownPaper.short }]
    return []
  }, [shownAgg, shownPaper, go])
  useCrumbTail(tail, place === null ? undefined : goHome)

  const title = shownAgg?.title ?? shownPaper?.short
    ?? (home === null ? 'Wiki' : m.wiki.title(home.aggregationCount))

  /** "Edit" to enter the original text state; "Save" to read the original text and write it back, write the complete library version and increment it so that this page can be retrieved again. */
  const toggleEdit = () => {
    if (!editing) {
      setEditing(true)
      return
    }
    if (saving) return
    const next = box.current?.innerText.trim() ?? ''
    setSaving(true)
    void write(wiki.update(place!, next).then(() => {
      setEditing(false)
    }), { note: m.wiki.saved }).finally(() => setSaving(false))
  }

  /** The header of the text section: the page name is on the left, "Edit"/"Save" is on the right, the same shape as the project essay. */
  const bodyHead = (name: string) => (
    <SectionHeading variant="content" className="flexh">{name}
      <button className="btn plain acts" disabled={saving} onClick={toggleEdit}>
        {editing ? m.common.save : m.common.edit}
      </button>
    </SectionHeading>
  )

  /** The bibliographic field of the Wiki paper page is the same frontmatter as the paper library; it is still written single-point by papers.update. */
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
      <PageHeader>
        {place === null ? null : <BackButton onClick={back} />}
        <PageTitle>{title}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody>
        {shownAgg !== null
          ? (
            <div className="wkpage">
              <div className="wkmain" ref={main}>
                <SectionHeading variant="content" className="flexh">
                  {m.wiki.subdivisionsHeading(shownAgg.kindLabel)}
                  <AddAction
                    variant="section" ref={childBtn} disabled={pending}
                    title={m.wiki.addKind(shownAgg.kindLabel)} onClick={() => open('child')}
                  >{shownAgg.kindLabel}</AddAction>
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
                          <div className="wkcard newcard" ref={addRow}>
                            <div className="wt">
                              <span className="wkind k-wiki">{shownAgg.kindLabel}</span>
                              <PickRow
                                row={addRow} triggers={[childBtn, paperBtn, colBtn]} allowNew
                                placeholder={m.wiki.kindNamePlaceholder(shownAgg.kindLabel)}
                                suggest={suggestChildren} onPick={mount} onNew={create}
                                onCancel={() => setAdding(null)} onError={reportError}
                              />
                            </div>
                            <div className="wf" />
                          </div>
                        )
                        : null}
                    </div>
                  )}
                <SectionHeading variant="content" className="flexh">{m.wiki.paperComparisonHeading}
                  <AddAction
                    variant="section" ref={paperBtn} disabled={pending}
                    title={m.wiki.addPaperTitle} onClick={() => open('paper')}
                  >{m.wiki.paperKind}</AddAction>
                </SectionHeading>
                <Table
                  agg={shownAgg} onOpen={go} onTip={setTip} pending={pending}
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
                          {/* If the placeholder column is already open, just return the focus to it, and keep the half-filled column name. */}
                          <AddAction
                            variant="icon" className="colbtn" ref={colAdd} disabled={pending}
                            title={m.wiki.aggregation.addColumn}
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
                              <button className="colbtn" ref={colBtn} disabled={pending} title={m.wiki.columnSettings}>
                                <IconGear />
                              </button>
                            )}
                          >
                            {/* Creating a column will expand the table, and the header and end of the table will slide accordingly; the pop-up layer should remain in the window, the same as the column menu of the paper table */}
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
                    // The box with aria-disabled can still receive clicks, but it will not be posted here when the proposal is on the way.
                    if (pending) return
                    const row = shownAgg.rows.find((r) => r.paper.id === paperId)!
                    propose(
                      m.wiki.proposals.moveOutPaper(row.paper.title, shownAgg.title),
                      [{ op: 'removeMembership', paper: paperId, in: shownAgg.id }],
                    )
                  }}
                />
                {bodyHead(shownAgg.title)}
                <MarkdownBox
                  text={shownAgg.body} editing={editing} box={box} onCancel={() => setEditing(false)} onOpen={go}
                  titles={shownAgg.titles} empty={<EmptyState variant="section">{m.wiki.noBody}</EmptyState>}
                />
              </div>
              <div className="wkside">
                <SectionHeading variant="rail">{m.project.identity.heading}</SectionHeading>
                <div className="wkprops">
                  <div className="pk">{m.project.identity.typeLabel}</div><div className="pv">{shownAgg.kindLabel}</div>
                  <div className="pk">{m.project.identity.nameLabel}</div>
                  <InlineMetadataField
                    label={m.wiki.nameFieldLabel} value={shownAgg.title}
                    onSave={(title) => {
                      const next = title.trim()
                      if (next === '') { toast(m.wiki.nameRequired); return false }
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
                {shownAgg.parents.length > 0 || shownAgg.related.length > 0
                  ? <SectionHeading variant="rail">{m.project.sections.links}</SectionHeading>
                  : null}
                {shownAgg.parents.length > 0
                  ? (
                    <div className="wkrel">
                      <span className="rl">{m.wiki.belongsTo}</span>
                      {shownAgg.parents.map((p) => (
                        <span className="tagchip" data-wk={p.id} key={p.id} onClick={() => go(p.id)}>{p.title}</span>
                      ))}
                    </div>
                  )
                  : null}
                {shownAgg.related.map((r) => (
                  <div className="wkrel" key={r.label}>
                    <span className="rl">{r.label}</span>
                    {r.links.map((l) => (
                      <span className="tagchip" data-wk={l.id} key={l.id} onClick={() => go(l.id)}>{l.title}</span>
                    ))}
                  </div>
                ))}
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
                  text={shownPaper.body} editing={editing} box={box} onCancel={() => setEditing(false)} onOpen={go}
                  titles={shownPaper.titles}
                  empty={<EmptyState variant="section">{m.wiki.noInternalizedContent}</EmptyState>}
                />
              </div>
              <div className="wkside">
                <SectionHeading variant="rail">{m.project.identity.heading}</SectionHeading>
                <div className="wkprops">
                  <div className="pk">{m.project.identity.typeLabel}</div><div className="pv">{m.wiki.paperKind}</div>
                  <div className="pk">{m.wiki.titleLabel}</div>
                  <InlineMetadataField
                    label={m.wiki.titleLabel} value={shownPaper.title}
                    onSave={(title) => {
                      const next = title.trim()
                      if (next === '') { toast(m.wiki.titleRequired); return false }
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
                        toast(m.wiki.yearRange)
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
                {/* What the application gets here is the row it was filtered out from the paper database; the browser proceeds from the details of that row. */}
                <div className="macts">
                  <button className="btn pri" onClick={() => jumpTo('papers', shownPaper.title)}>
                    {m.wiki.viewInPaperList}
                  </button>
                </div>
                <SectionHeading variant="rail">{m.wiki.membershipHeading}</SectionHeading>
                {shownPaper.memberships.length === 0
                  ? <EmptyState variant="section">{m.wiki.noMembership}</EmptyState>
                  : shownPaper.memberships.map((ms) => (
                    <div className="memb" key={ms.aggregation.id}>
                      <div className="wkrel">
                        <span className="wkind k-wiki">{ms.kindLabel}</span>
                        <span
                          className="tagchip" data-wk={ms.aggregation.id}
                          onClick={() => go(ms.aggregation.id)}
                        >{ms.aggregation.title}</span>
                      </div>
                      <div className="wkprops">
                        {ms.cells.map((c) => (
                          <Fragment key={c.label}>
                            <div className="pk">{c.label}</div>
                            <div className="pv"><Cell cell={c.cell} onTip={setTip} /></div>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                <Toc body={shownPaper.body} main={main} />
              </div>
            </div>
          )
          : null}

        {place === null && home !== null
          ? (
            <>
              {home.kinds.map((k) => (
                <Fragment key={k.key}>
                  <SectionHeading>{k.label}</SectionHeading>
                  <div className="wkgrid">
                    {home.roots.filter((c) => c.kind === k.key).map((c) => (
                      <AggregationCard key={c.id} card={c} onOpen={() => go(c.id)} />
                    ))}
                  </div>
                </Fragment>
              ))}

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

      {tip === null
        ? null
        : (
          <div id="wktip" style={{ left: tip.left, top: tip.top }}>
            <b>{m.wiki.tipSource(tip.page)}</b>“{tip.quote}”
          </div>
        )}
    </PageShell>
  )
}
