import { Fragment, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { FeedEntry, FeedSource } from '../../shared/contract.js'
import { feed } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { useJump, useVaultRevision } from '../shell/AppShell.js'
import { CONFLICT_THREAD } from '../lib/chat.js'
import { DayHeading } from '../components/DayHeading.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle,
} from '../components/PageShell.js'
import { SegmentedControl } from '../components/SegmentedControl.js'
import { useFormat } from '../lib/format.js'
import './shell.css'
import './Feed.css'

/** Dynamic source family: The icon is the source, and the color is only on the icon. Moved item by item from the demo's FSRC. Names come from the catalog. */
const FSRC: Record<FeedSource, { color: string; icon: ReactNode }> = {
  steward: {
    color: 'var(--sec)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 3l1.8 4.6 4.6 1.8-4.6 1.8L12 16l-1.8-4.8L5.6 9.4l4.6-1.8z" />
        <path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
      </svg>
    ),
  },
  me: {
    color: 'var(--warn)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21c1.5-4 4.8-6 7.5-6s6 2 7.5 6" />
      </svg>
    ),
  },
  lab: {
    color: 'var(--good)',
    icon: (
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M10 2v7.5L4.7 19a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 9.5V2" />
        <path d="M8.5 2h7" /><path d="M7 16h10" />
      </svg>
    ),
  },
  inbox: {
    color: 'var(--ter)',
    icon: (
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M22 13h-5l-2 3h-6l-2-3H2" />
        <path d="M5.4 5.6L2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.4-7.4A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.6z" />
      </svg>
    ),
  },
}

/** The order of the five buttons on the filter bar is taken from the demo; "all" does not filter, and the others filter one source each. Labels come from the catalog. */
const FILTERS: (FeedSource | null)[] = [null, 'steward', 'me', 'lab', 'inbox']

/** A dynamic text: a formatted paragraph, or a briefing. */
function Body({ body, onOpenConflict }: {
  body: FeedEntry['body']; onOpenConflict: () => void
}) {
  if (body.kind === 'brief') {
    return (
      <div className="brief">
        <div className="bh">{body.heading}</div>
        {body.items.map((item) => (
          <div className="bitem" key={item.id}>
            <span className="tag conf">{item.tag}</span>
            <span className="t">{item.text}</span>
            {/* demo's briefConf: This button opens a dialogue line with conflicting conclusions. */}
            <span className="go">
              <button className="btn" onClick={onOpenConflict}>{item.action}</button>
            </span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <>
      {body.runs.map((run, at) => (
        run.kind === 'strong' ? <b key={at}>{run.text}</b>
          : run.kind === 'cite' ? <span className="cite" key={at}>{run.text}</span>
            : <Fragment key={at}>{run.text}</Fragment>
      ))}
    </>
  )
}

/** A piece of news: source icon and name, moment in the upper right corner, and text. */
function Item({ entry, nowMs, onOpenConflict }: {
  entry: FeedEntry; nowMs: number; onOpenConflict: () => void
}) {
  const m = useMessages()
  const fmt = useFormat()
  const src = FSRC[entry.source]
  const time = entry.createdAt === undefined ? entry.time : fmt.activityTime(entry.createdAt, nowMs)
  return (
    <div className="mwrap">
      <div className="msg">
        <div className="fitem" data-src={entry.source}>
          <div className="fsrc">
            <span className="fic" style={{ color: src.color }}>{src.icon}</span>
            {m.feed.sources[entry.source]}<span className="ftime">{time}</span>
          </div>
          <div className="fbody"><Body body={entry.body} onOpenConflict={onOpenConflict} /></div>
        </div>
      </div>
    </div>
  )
}

/** Feed rows with each date heading constrained to the same centered column as its cards. */
export function FeedRows({ rows, showDays, nowMs, onOpenConflict }: {
  rows: FeedEntry[]
  showDays: boolean
  nowMs: number
  onOpenConflict: () => void
}) {
  return rows.map((entry, index) => (
    <Fragment key={entry.id}>
      {showDays && entry.day !== rows[index - 1]?.day ? (
        <div className="mwrap feed-day"><DayHeading>{entry.day}</DayHeading></div>
      ) : null}
      <Item entry={entry} nowMs={nowMs} onOpenConflict={onOpenConflict} />
    </Fragment>
  ))
}

/**
 * Dynamic: Every new development in the library is spread out by time, filtered by source, and segmented by date. Entries are retrieved from feed.list,
 * This screen does not hold libraries. Research ideas have their own editable list and no longer masquerade as an update.
 */
export function Feed() {
  const m = useMessages()
  const { revision } = useVaultRevision()
  const { open } = useJump()
  const [entries, setEntries] = useState<FeedEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<FeedSource | null>(null)
  const [nowMs, setNowMs] = useState(Date.now)

  const reportError = useCallback((e: Error) => setError(e.message), [])

  useEffect(() => {
    void feed.list().then(setEntries).catch(reportError)
  }, [revision, reportError])

  // Relative labels must age while the feed remains mounted; otherwise an entry written as
  // "just now" stays frozen until a navigation or vault write happens to rerender the screen.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const rows = source === null ? entries : entries.filter((e) => e.source === source)

  return (
    <PageShell className="feedcol">
      <PageHeader><PageTitle>{m.feed.title}</PageTitle></PageHeader>
      <PageError error={error} />
      <PageBody>
        <div className="feedbar">
          <SegmentedControl
            label={m.feed.sourceFieldLabel}
            value={source ?? 'all'}
            options={FILTERS.map((f) => ({ value: f ?? 'all', label: f === null ? m.feed.filters.all : m.feed.sources[f] }))}
            onChange={(value) => setSource(value === 'all' ? null : value as FeedSource)}
          />
        </div>

        <div className="msgs">
          {/* A source-filtered stream omits date headings because the heading itself has no source. */}
          <FeedRows
            rows={rows} showDays={source === null} nowMs={nowMs}
            onOpenConflict={() => open('chat', CONFLICT_THREAD)}
          />
        </div>
      </PageBody>
    </PageShell>
  )
}
