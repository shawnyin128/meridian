import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { InboxDownloadFailure, LaterEntry } from '../../shared/contract.js'
import { inbox, later } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { useJump, useNotice, useVaultRevision } from '../shell/AppShell.js'
import { BackButton } from '../components/BackButton.js'
import { useJumpOrigin } from '../hooks/useJumpOrigin.js'
import { useJobs } from '../shell/useJobs.js'
import { DownloadRing, Icon, IconRead, IconTrash } from '../components/icons.js'
import { IconButton } from '../components/IconButton.js'
import { PaperCard, PaperCardBadge, PaperCardNotice } from '../components/paper/PaperCard.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { DayHeading, daySectionName } from '../components/DayHeading.js'
import { EmptyState } from '../components/EmptyState.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { SegmentedControl } from '../components/SegmentedControl.js'
import { errorLabel, failureLabel } from '../lib/failure-label.js'
import { TitleNote } from '../components/TitleNote.js'
import { useFormat } from '../lib/format.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { PageBody, PageError, PageHeader, PageShell, PageTitle, PageToolbar } from '../components/PageShell.js'
import { SourceLabel } from '../components/SourceLabel.js'
import { shownSource } from '../lib/watch-source.js'
import './shell.css'

/** How entries are grouped: by the day they joined the queue, or by where they came from. */
type Grouping = 'time' | 'src'

const MODES: Grouping[] = ['time', 'src']

/**
 * Read Later: a paper already in the vault opens straight in the reader; one with only its source
 * address is downloaded into the vault first. Each entry can be removed from the queue. A jump from
 * another screen brings the entry it names into view.
 */
export function Later() {
  const m = useMessages()
  const fmt = useFormat()
  const [entries, setEntries] = useState<LaterEntry[] | null>(null)
  const [grouping, setGrouping] = useState<Grouping>('time')
  const [error, setError] = useState<string | null>(null)

  const notice = useNotice()
  const { jump, open } = useJump()
  const { origin, back } = useJumpOrigin()
  const body = useRef<HTMLDivElement>(null)
  const consumed = useRef(0)
  const { revision, bump } = useVaultRevision()
  const reportError = useCallback((e: unknown) => setError(errorLabel(m, e)), [m])
  const write = useVaultWrite()
  const undo = useUndo()
  const jobs = useJobs()
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState<ReadonlyMap<string, InboxDownloadFailure>>(new Map())

  const read = (entry: LaterEntry) => {
    if (entry.downloaded) {
      open('reader', entry.paper)
      return
    }
    setBusy((held) => new Set([...held, entry.id]))
    setFailed((held) => {
      const next = new Map(held)
      next.delete(entry.id)
      return next
    })
    void inbox.download(entry.id).then((result) => {
      if (result.kind === 'failed') {
        setFailed((held) => new Map(held).set(entry.id, result.reason))
        return
      }
      bump()
      open('reader', result.paper)
    }).catch((e: unknown) => notice.refusal(errorLabel(m, e))).finally(() => {
      setBusy((held) => {
        const next = new Set(held)
        next.delete(entry.id)
        return next
      })
    })
  }

  useEffect(() => {
    void later.list().then(setEntries).catch(reportError)
  }, [revision, reportError])

  // The entry can be scrolled to only once the queue has arrived.
  useEffect(() => {
    if (jump === null || jump.seq === consumed.current || entries === null) return
    consumed.current = jump.seq
    body.current?.querySelector(`[data-pid="${CSS.escape(jump.target)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [jump, entries])

  const remove = (entry: LaterEntry) => {
    void write(later.remove(entry.id).then((trashed) => [trashed]), {
      note: <TitleNote message={m.later.removed} title={plainTitle(entry.title)} />, action: undo.restore,
    })
  }

  // Entries arrive newest first by the day they were queued; groups follow the order keys first appear in.
  const key = (e: LaterEntry) => (grouping === 'time' ? e.day : shownSource(e.source))
  const groups = (entries ?? []).reduce<{ key: string; items: LaterEntry[] }[]>((made, entry) => {
    const seen = made.find((g) => g.key === key(entry))
    if (seen) seen.items.push(entry)
    else made.push({ key: key(entry), items: [entry] })
    return made
  }, [])

  return (
    <PageShell>
      <PageHeader>
        {origin === null ? null : <BackButton onClick={back} />}
        <PageTitle>{m.later.title(entries?.length ?? 0)}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody ref={body}>
        {groups.length === 0 ? null : (
          <PageToolbar>
            <SegmentedControl
              label={m.later.groupBy}
              value={grouping}
              options={MODES.map((mode) => ({ value: mode, label: m.later.modes[mode] }))}
              onChange={setGrouping}
            />
          </PageToolbar>
        )}
        {entries === null
          ? (error === null ? <LoadingPlaceholder shape="cards" /> : null)
          : groups.length === 0
          ? (
            <EmptyState
              variant="page"
              icon={<Icon sw={1.4}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>}
            >
              {m.later.empty}
            </EmptyState>
          )
          : groups.map((g) => (
            <Fragment key={g.key}>
              <DayHeading count={g.items.length}>
                {grouping === 'time' ? daySectionName(g.key, m.common.daySections) : g.key}
              </DayHeading>
              {g.items.map((x) => (
                <PaperCard
                  key={x.id} paperId={x.id} title={x.title}
                  actions={(
                    <>
                    {busy.has(x.id)
                      ? (
                        <IconButton label={m.later.actions.downloading} size="nested" className="busy" disabled>
                          <DownloadRing progress={jobs?.downloads?.find((item) => item.id === x.id) ?? null} />
                        </IconButton>
                      )
                      : x.downloaded || x.pdf !== undefined
                        ? (
                          <IconButton label={m.papers.rowActions.openReader} size="nested" onClick={() => read(x)}>
                            <IconRead />
                          </IconButton>
                        )
                        : null}
                    <IconButton label={m.later.actions.removeFrom} size="nested" onClick={() => remove(x)}>
                      <IconTrash />
                    </IconButton>
                    </>
                  )}
                  notices={failed.has(x.id) ? (
                    <PaperCardNotice tone="error" action={(
                      <button className="btn ghost sm" onClick={() => read(x)}>{m.common.retry}</button>
                    )}>{failureLabel(m, m.inbox.notices.downloadFailed, failed.get(x.id)!)}</PaperCardNotice>
                  ) : null}
                  metadata={(
                    <>
                    {x.authors}{x.venue ? <PaperCardBadge>{x.venue}</PaperCardBadge> : null}
                    {grouping === 'time'
                      ? <SourceLabel>{shownSource(x.source)}</SourceLabel>
                      : <PaperCardBadge>{m.common.addedOn(fmt.date(x.added))}</PaperCardBadge>}
                    </>
                  )}
                  {...(x.abstract ? { abstract: x.abstract } : {})}
                />
              ))}
            </Fragment>
          ))}
      </PageBody>
    </PageShell>
  )
}
