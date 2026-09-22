import { useEffect, useState } from 'react'
import type { SearchHit } from '../../shared/contract.js'
import { search } from '../ipc.js'
import { PickerPopover } from '../components/PickerPopover.js'
import { ClearableInput } from '../components/ClearableInput.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { useMessages } from '../messages/useMessages.js'
import type { ScreenKey } from './AppShell.js'

/** Which screen to enter after clicking on a hit is the same as the go of each item in the demo searchIndex. */
const SCREEN: Record<SearchHit['kind'], ScreenKey> = {
  aggregation: 'wiki', project: 'project', chat: 'chat', paper: 'papers',
}

/**
 * Global search at the top of the sidebar: Instant results will appear as you type, click on an item to access the item on that screen. Indexing, matching, sorting and number of items
 * The upper limit is on the core side. This component only sends query words and receives the few returned by search.query. It does not hold a library.
 * `onJump` is the cross-screen jump entrance of the shell, and every hit falls to the target screen through it.
 */
export function SearchBox({ onJump }: { onJump: (screen: ScreenKey, target: string) => void }) {
  const m = useMessages()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])

  useEffect(() => {
    if (q.trim() === '') {
      setHits([])
      return
    }
    let live = true
    void search.query(q).then((found) => { if (live) setHits(found) })
    return () => { live = false }
  }, [q])

  // Demo's h.go(): close the panel and jump again, and the typed words will be retained.
  const go = (hit: SearchHit) => {
    setHits([])
    onJump(SCREEN[hit.kind], hit.target)
  }
  const keys = useCandidateKeys(hits.length, (i) => go(hits[i]!))

  return (
    <PickerPopover
      open={hits.length > 0} onOpenChange={(open) => { if (!open) setHits([]) }}
      contentClassName="pickhits sres" contentId="sRes" sideOffset={0}
      anchor={(
        <ClearableInput
          wrapperClassName="sfield" wrapperId="searchBox"
          id="sSearch" placeholder={m.shell.search.placeholder} autoComplete="off" value={q}
          onChange={(e) => setQ(e.target.value)} onClear={() => { setQ(''); setHits([]) }}
          onKeyDown={keys.onKeyDown}
          clearLabel={m.shell.search.clear}
          leading={<span className="ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
          </span>}
        />
      )}
      content={(
        <>
          <div className="rh">{m.shell.search.results}</div>
          {/* The placement point of the paper is the title. The placement point of the two articles with the same name is the same. When adding the category and placement point, the key will collide. */}
          {hits.map((hit, at) => (
            <div
              className={at === keys.active ? 'rrow on' : 'rrow'} key={`${at}${hit.kind}${hit.target}`}
              onClick={() => go(hit)}
            >
              <div className="rt">{hit.title}</div>
              <div className="rm">{hit.meta}</div>
            </div>
          ))}
        </>
      )}
    />
  )
}
