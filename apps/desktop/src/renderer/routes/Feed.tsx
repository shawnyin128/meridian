import { Fragment, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { FeedEntry, FeedSource } from '../../shared/contract.js'
import { feed } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import { useMessages } from '../messages/useMessages.js'
import { useJump, useVaultRevision } from '../shell/AppShell.js'
import { CONFLICT_THREAD } from '../lib/chat.js'
import { DateChip, DateTimeDisplay } from '../components/DateTimeDisplay.js'
import { DayHeading, daySectionName } from '../components/DayHeading.js'
import { ENTITY_SCREEN, EntityLink } from '../components/EntityLink.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, PageToolbar,
} from '../components/PageShell.js'
import { SegmentedControl } from '../components/SegmentedControl.js'
import { PaperText } from '../components/paper/PaperText.js'
import { SourceLabel } from '../components/SourceLabel.js'
import { Tag } from '../components/Tag.js'
import './shell.css'
import './Feed.css'

/**
 * Feed source icons, drawn in the source label's colour. Copied entry by entry from the demo's FSRC;
 * names come from the catalog.
 */
const FSRC: Record<FeedSource, { icon: ReactNode }> = {
  steward: {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 3l1.8 4.6 4.6 1.8-4.6 1.8L12 16l-1.8-4.8L5.6 9.4l4.6-1.8z" />
        <path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
      </svg>
    ),
  },
  me: {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21c1.5-4 4.8-6 7.5-6s6 2 7.5 6" />
      </svg>
    ),
  },
  lab: {
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

type FeedRun = Extract<FeedEntry['body'], { kind: 'runs' }>['runs'][number]

/** Whether a feed run's target names an entity this version opens. */
const opensHere = (kind: string): kind is keyof typeof ENTITY_SCREEN => Object.hasOwn(ENTITY_SCREEN, kind)

/** One run of a feed paragraph in its kind's look; one that names a paper, project or Wiki page is a link that opens it. */
function Run({ run }: { run: FeedRun }) {
  const { open } = useJump()
  const text = run.kind === 'strong' ? <PaperText text={run.text} /> : run.text
  const target = run.target !== undefined && opensHere(run.target.kind) ? { kind: run.target.kind, id: run.target.id } : undefined
  const named = target === undefined
    ? text
    : (
      <EntityLink
        kind={target.kind} label={text} href={`#${ENTITY_SCREEN[target.kind]}:${target.id}`}
        onOpen={() => open(ENTITY_SCREEN[target.kind], target.id)}
      />
    )
  return run.kind === 'strong' ? <b>{named}</b> : named
}

/** A feed entry's body: a formatted paragraph, or a brief. */
function Body({ body, onOpenConflict }: {
  body: FeedEntry['body']; onOpenConflict: () => void
}) {
  if (body.kind === 'brief') {
    return (
      <div className="brief">
        <div className="bh">{body.heading}</div>
        {body.items.map((item) => (
          <div className="bitem" key={item.id}>
            <Tag tone="bad">{item.tag}</Tag>
            <span className="t">{item.text}</span>
            {/* The demo's briefConf: this button opens a chat about the conflicting conclusions. */}
            <span className="go">
              <button className="btn ghost sm" onClick={onOpenConflict}>{item.action}</button>
            </span>
          </div>
        ))}
      </div>
    )
  }
  return <>{body.runs.map((run, at) => <Run key={at} run={run} />)}</>
}

/**
 * One feed entry: its source label with the source icon, the time at the top right, and the body. An
 * entry written before entries kept their timestamp shows the time it was stored with.
 */
function Item({ entry, onOpenConflict }: { entry: FeedEntry; onOpenConflict: () => void }) {
  const m = useMessages()
  const time = entry.createdAt === undefined ? <DateChip>{entry.time}</DateChip> : <DateTimeDisplay at={entry.createdAt} />
  return (
    <div className="mwrap">
      <div className="msg">
        <div className="fitem" data-src={entry.source}>
          <div className="fsrc">
            <SourceLabel lead={<span className="fic">{FSRC[entry.source].icon}</span>}>{m.feed.sources[entry.source]}</SourceLabel>
            <span className="ftime">{time}</span>
          </div>
          <div className="fbody"><Body body={entry.body} onOpenConflict={onOpenConflict} /></div>
        </div>
      </div>
    </div>
  )
}

/** Feed rows under their day headings, each heading constrained to the same centered column as its cards. */
export function FeedRows({ rows, onOpenConflict }: { rows: FeedEntry[]; onOpenConflict: () => void }) {
  const m = useMessages()
  return rows.map((entry, index) => (
    <Fragment key={entry.id}>
      {entry.day !== rows[index - 1]?.day ? (
        <div className="mwrap feed-day"><DayHeading>{daySectionName(entry.day, m.common.daySections)}</DayHeading></div>
      ) : null}
      <Item entry={entry} onOpenConflict={onOpenConflict} />
    </Fragment>
  ))
}

/**
 * Feed: everything new in the vault in time order, filterable by source and grouped by date.
 * Entries come from feed.list; this screen never touches the vault itself. Research ideas have
 * their own editable list and no longer appear as feed entries.
 */
export function Feed() {
  const m = useMessages()
  const { revision } = useVaultRevision()
  const { open } = useJump()
  const [entries, setEntries] = useState<FeedEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<FeedSource | null>(null)

  const reportError = useCallback((e: unknown) => setError(errorLabel(m, e)), [m])

  useEffect(() => {
    void feed.list().then(setEntries).catch(reportError)
  }, [revision, reportError])

  const rows = source === null ? entries ?? [] : (entries ?? []).filter((e) => e.source === source)

  return (
    <PageShell className="feedcol">
      <PageHeader><PageTitle>{m.feed.title}</PageTitle></PageHeader>
      <PageError error={error} />
      <PageBody>
        <div className="msgs">
          {/* The switch sits in the stream, so it lines up with the entries' column. */}
          <PageToolbar className="mwrap">
            <SegmentedControl
              label={m.feed.sourceFieldLabel}
              value={source ?? 'all'}
              options={FILTERS.map((f) => ({ value: f ?? 'all', label: f === null ? m.feed.filters.all : m.feed.sources[f] }))}
              onChange={(value) => setSource(value === 'all' ? null : value as FeedSource)}
            />
          </PageToolbar>
          {entries === null && error === null ? <LoadingPlaceholder shape="cards" /> : null}
          <FeedRows rows={rows} onOpenConflict={() => open('chat', CONFLICT_THREAD)} />
        </div>
      </PageBody>
    </PageShell>
  )
}
