import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '../../shared/contract.js'
import { search } from '../ipc.js'
import { PickerPopover, PickOption } from '../components/PickerPopover.js'
import { ClearableInput } from '../components/ClearableInput.js'
import { PaperText } from '../components/paper/PaperText.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { useMessages } from '../messages/useMessages.js'
import type { ScreenKey } from './AppShell.js'

/** The screen a clicked hit opens, like each entry's `go` in the demo's searchIndex. */
const SCREEN: Record<SearchHit['kind'], ScreenKey> = {
  aggregation: 'wiki', project: 'project', chat: 'chat', paper: 'papers',
}

/**
 * The global search at the top of the sidebar: results appear as you type, and clicking one opens
 * that item on its screen. Indexing, matching, ranking and the result limit live in Core; this
 * component only sends the query and shows the few hits search.query returns, holding no vault data.
 * `onJump` is the shell's cross-screen jump, and every hit reaches its screen through it.
 */
export function SearchBox({ onJump }: { onJump: (screen: ScreenKey, target: string) => void }) {
  const m = useMessages()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const field = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (q.trim() === '') {
      setHits([])
      return
    }
    let live = true
    void search.query(q).then((found) => { if (live) setHits(found) })
    return () => { live = false }
  }, [q])

  // The demo's h.go(): close the results, then jump; the typed query stays.
  const go = (hit: SearchHit) => {
    setHits([])
    onJump(SCREEN[hit.kind], hit.target)
  }
  const keys = useCandidateKeys(hits.length, (i) => go(hits[i]!))

  return (
    <>
      <ClearableInput
        wrapperClassName="sfield" wrapperId="searchBox" wrapperRef={field}
        id="sSearch" placeholder={m.shell.search.placeholder} autoComplete="off" value={q}
        onChange={(e) => setQ(e.target.value)} onClear={() => { setQ(''); setHits([]) }}
        onKeyDown={keys.onKeyDown}
        clearLabel={m.shell.search.clear} keycap="/" aria-keyshortcuts="/"
        leading={(
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
        )}
      />
      {/* The results line up with the whole field, its icon included, not with the input inside it. */}
      <PickerPopover
        open={hits.length > 0} onOpenChange={(open) => { if (!open) setHits([]) }}
        contentClassName="pickhits sres" contentId="sRes" sideOffset={0} anchorBox={field}
        content={(
          <>
            <div className="rh">{m.shell.search.results}</div>
            {/* A paper's target is its title, so same-titled papers share one: kind plus target would collide. */}
            {hits.map((hit, at) => (
              <PickOption
                keys={keys} index={at} className="two-line" key={`${at}${hit.kind}${hit.target}`}
                onClick={() => go(hit)}
              >
                <div className="rt">{hit.kind === 'paper' || hit.kind === 'chat' ? <PaperText text={hit.title} /> : hit.title}</div>
                <div className="rm">{hit.meta}</div>
              </PickOption>
            ))}
          </>
        )}
      />
    </>
  )
}
