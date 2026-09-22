import { Fragment, useCallback, useEffect, useState } from 'react'
import type { LaterEntry } from '../../shared/contract.js'
import { inbox, later } from '../ipc.js'
import { useMessages } from '../messages/useMessages.js'
import { useJump, useToast, useVaultRevision } from '../shell/AppShell.js'
import { useJobs } from '../shell/useJobs.js'
import { DownloadRing, Icon, IconCross, IconRead } from '../components/icons.js'
import { PaperCard, PaperCardBadge, PaperCardNotice } from '../components/paper/PaperCard.js'
import { DayHeading } from '../components/DayHeading.js'
import { EmptyState } from '../components/EmptyState.js'
import { SegmentedControl } from '../components/SegmentedControl.js'
import { useFormat } from '../lib/format.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { PageBody, PageError, PageHeader, PageShell, PageTitle } from '../components/PageShell.js'
import './shell.css'

/** Grouping basis: According to the time of joining the team, or according to the place of origin when joining the team. */
type Grouping = 'time' | 'src'

const MODES: Grouping[] = ['time', 'src']

/** The title in the removal prompt is cut to this length, the same as the demo. */
const TITLE_IN_TOAST = 18

/**
 * Read later: For direct reading that has been stored in the database, only the original text address will be downloaded and stored in the database first, and each item can be moved out of the queue.
 */
export function Later() {
  const m = useMessages()
  const fmt = useFormat()
  const [entries, setEntries] = useState<LaterEntry[]>([])
  const [grouping, setGrouping] = useState<Grouping>('time')
  const [error, setError] = useState<string | null>(null)

  const toast = useToast()
  const { open } = useJump()
  const { revision, bump } = useVaultRevision()
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const write = useVaultWrite()
  const jobs = useJobs()
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState<ReadonlyMap<string, string>>(new Map())

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
      bump()
      open('reader', result.paper)
    }).catch((e: Error) => {
      if (e.message.startsWith('没能下载原文')) {
        setFailed((held) => new Map(held).set(entry.id, e.message))
      } else toast(e.message)
    }).finally(() => {
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

  const remove = (entry: LaterEntry) => {
    void write(later.remove(entry.id),
      { note: m.later.removed(entry.title.slice(0, TITLE_IN_TOAST)), notify: toast })
  }

  // The entries have been sorted from newest to oldest by date of entry into the queue, and the groups are grouped according to the order in which they appear.
  const key = (e: LaterEntry) => (grouping === 'time' ? e.day : e.source)
  const groups = entries.reduce<{ key: string; items: LaterEntry[] }[]>((made, entry) => {
    const seen = made.find((g) => g.key === key(entry))
    if (seen) seen.items.push(entry)
    else made.push({ key: key(entry), items: [entry] })
    return made
  }, [])

  return (
    <PageShell>
      <PageHeader>
        <PageTitle>{m.later.title(entries.length)}</PageTitle>
        {groups.length === 0 ? null : (
          <SegmentedControl
            label={m.later.groupBy}
            value={grouping}
            options={MODES.map((mode) => ({ value: mode, label: m.later.modes[mode] }))}
            onChange={setGrouping}
          />
        )}
      </PageHeader>

      <PageError error={error} />

      <PageBody>
        {groups.length === 0
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
              <DayHeading count={g.items.length}>{g.key}</DayHeading>
              {g.items.map((x) => (
                <PaperCard
                  key={x.id} paperId={x.id} title={x.title}
                  actions={(
                    <>
                    {busy.has(x.id)
                      ? (
                        <button className="icbtn busy" title={m.later.actions.downloading} disabled>
                          <DownloadRing progress={jobs?.downloads?.find((item) => item.id === x.id) ?? null} />
                        </button>
                      )
                      : x.downloaded || x.pdf !== undefined
                        ? (
                          <button className="icbtn" title={m.papers.rowActions.openReader} onClick={() => read(x)}>
                            <IconRead />
                          </button>
                        )
                        : null}
                    <button className="icbtn" title={m.later.actions.removeFrom} onClick={() => remove(x)}>
                      <IconCross />
                    </button>
                    </>
                  )}
                  notices={failed.has(x.id) ? (
                    <PaperCardNotice tone="error" action={(
                      <button className="btn plain" onClick={() => read(x)}>{m.common.retry}</button>
                    )}>{failed.get(x.id)}</PaperCardNotice>
                  ) : null}
                  metadata={(
                    <>
                    {x.authors}{x.venue ? <PaperCardBadge>{x.venue}</PaperCardBadge> : null}
                    <PaperCardBadge>
                      {grouping === 'time' ? x.source : m.common.addedOn(fmt.date(x.added))}
                    </PaperCardBadge>
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
