import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '../../shared/contract.js'
import { search } from '../ipc.js'
import { PickerPopover, PickOption } from '../components/PickerPopover.js'
import { ClearableInput } from '../components/ClearableInput.js'
import { EmptyState } from '../components/EmptyState.js'
import { ENTITY_SCREEN } from '../components/EntityLink.js'
import { FadeText } from '../components/FadeText.js'
import { IconSearch } from '../components/icons.js'
import { PaperText } from '../components/paper/PaperText.js'
import { useCandidateKeys, type CandidateKeys } from '../hooks/useCandidateKeys.js'
import { useMessages } from '../messages/useMessages.js'
import type { JumpAnchor, ScreenKey } from './AppShell.js'

/**
 * The screen a chosen hit opens, an entity's the one its link opens; a task opens in its project, and a
 * paper without a PDF opens in the Papers screen instead.
 */
const SCREEN: Record<SearchHit['kind'], ScreenKey> = {
  aggregation: ENTITY_SCREEN.page, project: ENTITY_SCREEN.project, chat: ENTITY_SCREEN.chat, paper: ENTITY_SCREEN.paper,
  idea: ENTITY_SCREEN.idea, task: ENTITY_SCREEN.project, later: 'later',
}

/**
 * Opens `hit` through `open`, the shell's cross-screen jump: a paper in the reader at the page,
 * highlight or note it matched, or in its detail view when the vault has no PDF of it; a task in
 * its project's plan; anything else on its own screen.
 */
export function openHit(hit: SearchHit, open: (screen: ScreenKey, target: string, anchor?: JumpAnchor) => void): void {
  if (hit.kind === 'paper' && hit.pdf !== true) {
    open('papers', hit.target, { detail: true })
    return
  }
  const at = hit.anchor
  open(SCREEN[hit.kind], hit.target, at === undefined ? undefined : {
    ...(at.page === undefined ? {} : { page: at.page }),
    ...(at.highlight === undefined ? {} : { highlight: at.highlight }),
    ...(at.note === undefined ? {} : { note: at.note, panel: 'notes' }),
    ...(at.task === undefined ? {} : { task: at.task }),
  })
}

/**
 * Hit `index` of a candidate list driven by `keys`, as a two-line row: its title, then the text it
 * matched in place of its secondary line when it matched outside its title.
 */
function HitOption({ hit, keys, index, onChoose }: {
  hit: SearchHit
  keys: Pick<CandidateKeys, 'active' | 'pointAt'>
  index: number
  onChoose: () => void
}) {
  return (
    <PickOption keys={keys} index={index} className="two-line" onClick={onChoose}>
      <div className="rt">{hit.kind === 'paper' || hit.kind === 'chat' ? <PaperText text={hit.title} /> : hit.title}</div>
      {hit.snippet === undefined
        ? <div className="rm">{hit.meta}</div>
        : <FadeText className="rm">{hit.snippet}</FadeText>}
    </PickOption>
  )
}

/**
 * The global search at the top of the sidebar: results appear as you type, and clicking one opens
 * that item as `openHit` says. Indexing, matching, ranking and the result limit live in Core; this
 * component only sends the query and shows the few hits search.query returns, holding no vault data.
 * While the query is not empty the results stay open, saying so when nothing matched, until a pick,
 * Escape or a press outside closes them; typing opens them again. `onJump` is the shell's
 * cross-screen jump, and every hit reaches its screen through it.
 */
export function SearchBox({ onJump }: { onJump: (screen: ScreenKey, target: string, anchor?: JumpAnchor) => void }) {
  const m = useMessages()
  const [q, setQ] = useState('')
  // null until the first hits of a query arrive; later queries keep the shown hits until theirs do.
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [shut, setShut] = useState(false)
  const field = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setShut(false)
    if (q.trim() === '') {
      setHits(null)
      return
    }
    let live = true
    void search.query(q).then((found) => { if (live) setHits(found) })
    return () => { live = false }
  }, [q])

  // The demo's h.go(): close the results, then jump; the typed query stays.
  const go = (hit: SearchHit) => {
    setShut(true)
    openHit(hit, onJump)
  }
  const open = hits !== null && !shut
  const shown = open ? hits : []
  const keys = useCandidateKeys(shown.length, (i) => go(shown[i]!))

  return (
    <>
      <ClearableInput
        wrapperClassName="sfield" wrapperId="searchBox" wrapperRef={field}
        id="sSearch" placeholder={m.shell.search.placeholder} autoComplete="off" value={q}
        onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')}
        onKeyDown={keys.onKeyDown}
        clearLabel={m.shell.search.clear} keycap="/" aria-keyshortcuts="/"
        leading={<IconSearch />}
      />
      {/* The results line up with the whole field, its icon included, not with the input inside it. */}
      <PickerPopover
        open={open} onOpenChange={(next) => { if (!next) setShut(true) }}
        size="wide" contentClassName="sres" contentId="sRes" sideOffset={0} anchorBox={field}
        content={(
          <>
            <div className="rh">{m.shell.search.results}</div>
            {/* Tasks of one project share its id as their target: kind plus target would collide. */}
            {shown.length === 0
              ? <div className="sres-empty"><EmptyState variant="section">{m.shell.search.noHits}</EmptyState></div>
              : null}
            {shown.map((hit, at) => (
              <HitOption hit={hit} keys={keys} index={at} key={`${at}${hit.kind}${hit.target}`} onChoose={() => go(hit)} />
            ))}
          </>
        )}
      />
    </>
  )
}
