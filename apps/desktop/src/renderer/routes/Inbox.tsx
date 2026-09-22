import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DiscoveryFetchResult, DiscoveryProfile, FetchStatus, InboxEntry,
  InboxListParams, Watch,
} from '../../shared/contract.js'
import { discovery, inbox, watch } from '../ipc.js'
import {
  ALL_WATCHES, useCrumbTail, useInboxMode, useInboxScope, useJump, useToast, useVaultRevision,
  useSettingsOpen,
} from '../shell/AppShell.js'
import { useJobs } from '../shell/useJobs.js'
import { useFormat } from '../lib/format.js'
import type { Catalog } from '../messages/catalog.js'
import { useMessages } from '../messages/useMessages.js'
import {
  DownloadRing, Icon, IconCheck, IconCross, IconDownload, IconGear, IconLater, IconRead,
} from '../components/icons.js'
import {
  PaperCard, PaperCardBadge, PaperCardCitations, PaperCardNotice,
} from '../components/paper/PaperCard.js'
import { EmptyState } from '../components/EmptyState.js'
import { SegmentedControl } from '../components/SegmentedControl.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import './shell.css'

/** The `.pcard` swipe-away animation of the demo: The library is actually written after the card slides away for so long. */
const LEAVE_MS = 260

/** A note on the name displayed in the inbox, demo's WATCHES. */
const label = (w: Watch, watchKind: Record<Watch['type'], string>) => `${watchKind[w.type]} · ${w.name}`

/** The stream label shown in the page title and breadcrumb tail: paper delivery or paper discovery. */
const streamLabel = (m: Catalog, stream: 'watch' | 'discovery'): string =>
  (stream === 'watch' ? m.inbox.streamLabel.watch : m.inbox.streamLabel.discovery)

function fetchNote(status: FetchStatus | null, m: Catalog, fmt: ReturnType<typeof useFormat>): string {
  if (status === null) return ''
  if (status.state === 'checking') return m.inbox.check.checking
  if (status.state === 'failed') return m.inbox.check.failed(status.error ?? '')
  if (status.checkedAt === null) return ''
  const at = new Date(status.checkedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const localDate = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  return m.inbox.check.lastChecked(`${fmt.date(localDate)} ${clock}`)
}

function discoveryResultNote(result: DiscoveryFetchResult, m: Catalog): string {
  const parts = [
    result.added === 0 ? m.settings.discovery.noNewPapers : m.settings.discovery.newFound(result.added),
    m.settings.discovery.requested(result.intents),
  ]
  if (result.cachedIntents > 0) parts.push(m.settings.discovery.cooling(result.cachedIntents))
  if (result.failedIntents > 0) parts.push(m.settings.discovery.failed(result.failedIntents))
  if (result.deferredProjects > 0) parts.push(m.settings.discovery.deferred(result.deferredProjects))
  return parts.join(' · ')
}

/**
 * Article push: crawl according to the following and spread out in groups. Each article can be downloaded into the library, saved for later reading, or ignored.
 */
export function Inbox() {
  const m = useMessages()
  const fmt = useFormat()
  const scope = useInboxScope()
  const stream = useInboxMode()
  const [entries, setEntries] = useState<InboxEntry[]>([])
  const [watches, setWatches] = useState<Watch[]>([])
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([])
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  // After bumping into the existing article in the library, this card contains the title of the page in the library and the entrance to it.
  const [collided, setCollided] = useState<ReadonlyMap<string, string>>(new Map())

  const toast = useToast()
  const { openCategory } = useSettingsOpen()
  const { open } = useJump()
  const { revision, bump } = useVaultRevision()
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const write = useVaultWrite()
  const jobs = useJobs()
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState<ReadonlyMap<string, string>>(new Map())
  const [sort, setSort] = useState<NonNullable<InboxListParams['sort']>>('recommended')
  const [discovering, setDiscovering] = useState(false)

  const loadProfiles = useCallback(() => {
    void discovery.profiles().then(setProfiles).catch(reportError)
  }, [reportError])

  useEffect(() => {
    void inbox.list({ kind: stream, sort }).then((rows) => {
      setEntries(rows)
      setLeaving(new Set())
    }).catch(reportError)
    void watch.list().then(setWatches).catch(reportError)
    loadProfiles()
  }, [loadProfiles, revision, reportError, sort, stream])

  const watched = watches.find((w) => w.id === scope)
  const rows = useMemo(() => (
    stream === 'discovery' || scope === ALL_WATCHES
      ? entries : entries.filter((e) => e.watch === scope)
  ), [entries, scope, stream])

  const tail = useMemo(
    () => (scope === ALL_WATCHES
      ? [{ text: streamLabel(m, stream) }]
      : watched ? [{ text: m.shell.watchKind[watched.type] }, { text: watched.name }] : []),
    [scope, stream, watched, m],
  )
  useCrumbTail(tail)

  const leave = (ids: string[]) => setLeaving((prev) => new Set([...prev, ...ids]))

  const dismiss = (ids: string[], text: string) => {
    leave(ids)
    toast(text)
    window.setTimeout(() => { void write(Promise.all(ids.map((id) => inbox.dismiss(id)))) }, LEAVE_MS)
  }

  const queue = (id: string) => {
    leave([id])
    void inbox.readLater(id).then((queued) => {
      toast(queued ? m.inbox.notices.queued : m.inbox.notices.alreadyQueued)
      window.setTimeout(bump, LEAVE_MS)
    }).catch((e: Error) => toast(e.message))
  }

  const ingest = (id: string) => {
    setBusy((held) => new Set([...held, id]))
    setFailed((held) => {
      const next = new Map(held)
      next.delete(id)
      return next
    })
    void inbox.download(id).then((result) => {
      if (result.kind === 'existing') {
        setCollided((seen) => new Map(seen).set(id, result.title))
        toast(m.inbox.notices.duplicateToast)
        return
      }
      bump()
      toast(m.inbox.notices.downloaded)
    }).catch((e: Error) => {
      if (e.message.startsWith('没能下载原文')) {
        setFailed((held) => new Map(held).set(id, e.message))
      } else toast(e.message)
    }).finally(() => {
      setBusy((held) => {
        const next = new Set(held)
        next.delete(id)
        return next
      })
    })
  }

  const refreshDiscovery = () => {
    setDiscovering(true)
    void discovery.fetch().then((result) => {
      toast(discoveryResultNote(result, m))
      bump()
    }).catch((e: Error) => toast(e.message)).finally(() => setDiscovering(false))
  }

  const feedback = (id: string, value: 'more' | 'less' | 'known') => {
    if (value !== 'more') leave([id])
    void discovery.feedback(id, value).then(() => {
      toast(value === 'more' ? m.inbox.notices.moreLike
        : value === 'less' ? m.inbox.notices.lessLike : m.inbox.notices.known)
      window.setTimeout(bump, value === 'more' ? 0 : LEAVE_MS)
    }).catch((e: Error) => toast(e.message))
  }

  const head = scope === ALL_WATCHES
    ? m.inbox.headAll(streamLabel(m, stream), rows.length)
    : m.inbox.headWatch(watched ? label(watched, m.shell.watchKind) : '', rows.length)

  return (
    <PageShell>
      <PageHeader>
        <PageTitle>{head}</PageTitle>
        <span className="fetchnote">{stream === 'watch' ? fetchNote(jobs?.fetch ?? null, m, fmt) : ''}</span>
        {stream === 'watch' ? (
          <button
            className="btn" disabled={jobs?.fetch?.state === 'checking'}
            onClick={() => { void inbox.fetch().catch((e: Error) => toast(e.message)) }}
          >{jobs?.fetch?.state === 'failed' ? m.common.retry : m.inbox.checkNewPapers}</button>
        ) : (
          <button className="btn" disabled={discovering} onClick={refreshDiscovery}>
            {discovering ? m.inbox.discovering : m.inbox.refreshDiscovery}
          </button>
        )}
      </PageHeader>

      <PageError error={error} />

      <PageBody>
        <div className="inbox-toolbar">
          <SegmentedControl
            className="inbox-sort"
            label={m.inbox.sortLabel}
            value={sort}
            options={[
              { value: 'recommended', label: m.inbox.sort.recommended },
              { value: 'latest', label: m.inbox.sort.latest },
              { value: 'published', label: m.inbox.sort.published },
              { value: 'impact', label: m.inbox.sort.impact },
            ]}
            onChange={setSort}
          />
          <button
            className="inbox-settings"
            title={stream === 'discovery' ? m.inbox.discoverySettings : m.inbox.watchSettings}
            aria-label={stream === 'discovery' ? m.inbox.discoverySettings : m.inbox.watchSettings}
            onClick={() => openCategory(stream === 'discovery' ? 'delivery-discovery' : 'delivery-watch')}
          ><IconGear /></button>
        </div>
        {stream === 'discovery' ? (
          <div className="discovery-summary">
            <p className="discovery-note">
              {m.inbox.discoverySummary(
                profiles.filter((profile) => profile.intentCount > 0).length,
                profiles.reduce((total, profile) => total + profile.intentCount, 0),
              )}
            </p>
          </div>
        ) : null}
        {rows.length === 0
          ? (
            <EmptyState
              variant="page"
              icon={(
                <Icon sw={1.4}>
                  <path d="M22 13h-5l-2 3h-6l-2-3H2" />
                  <path d="M5.4 5.6L2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.4-7.4A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.6z" />
                </Icon>
              )}
            >
              {stream === 'discovery'
                ? (profiles.some((profile) => profile.seedCount > 0)
                  ? m.inbox.empty.discoveryNone : m.inbox.empty.discoveryNoSeeds)
                : m.inbox.empty.watch}
            </EmptyState>
          )
          : (
            <>
              {rows.map((p, at) => {
            // All push this file will be segmented according to the following. If a certain item is followed by that file, only a paragraph header of the same style will be set at the front.
            const group = stream === 'discovery' ? p.project : p.watch
            const previous = stream === 'discovery' ? rows[at - 1]?.project : rows[at - 1]?.watch
            const openGroup = scope === ALL_WATCHES ? group !== previous : at === 0
            return (
              <Fragment key={p.id}>
                {openGroup ? (
                  <SectionHeading variant="group" className={at === 0 ? 'flexh' : undefined}>
                    {p.source}
                    {/* The demo only puts "ignore all" on the first paragraph header, and it ignores everything in this file. */}
                    {at === 0 ? (
                      <button
                        className="btn plain"
                        onClick={() => dismiss(rows.map((r) => r.id), m.inbox.notices.dismissedAll)}
                      >{m.inbox.dismissAll}</button>
                    ) : null}
                  </SectionHeading>
                ) : null}
                <PaperCard
                  paperId={p.id} watchId={p.watch} title={p.title} leaving={leaving.has(p.id)}
                  actions={(
                    <>
                    {stream === 'discovery' ? (
                      <>
                        <button
                          className={`icbtn${p.feedback === 'more' ? ' on' : ''}`}
                          title={m.inbox.actions.more} onClick={() => feedback(p.id, 'more')}
                        ><Icon><path d="M7 10v11H3V10h4zM7 19l4 2h6.5a2 2 0 0 0 2-1.7l1.2-7A2 2 0 0 0 18.7 10H14l1-4.2A2.3 2.3 0 0 0 12.8 3L7 10z" /></Icon></button>
                        <button className="icbtn" title={m.inbox.actions.less} onClick={() => feedback(p.id, 'less')}>
                          <Icon><path d="M7 14V3H3v11h4zM7 5l4-2h6.5a2 2 0 0 1 2 1.7l1.2 7a2 2 0 0 1-2 2.3H14l1 4.2a2.3 2.3 0 0 1-2.2 2.8L7 14z" /></Icon>
                        </button>
                        <button className="icbtn" title={m.inbox.actions.known} onClick={() => feedback(p.id, 'known')}>
                          <IconCheck />
                        </button>
                      </>
                    ) : null}
                    {p.downloaded
                      ? (
                        <button
                          className="icbtn" title={m.papers.rowActions.openReader} onClick={() => open('reader', p.paper)}
                        ><IconRead /></button>
                      )
                      : busy.has(p.id)
                        ? (
                          <button className="icbtn busy" title={m.later.actions.downloading} disabled>
                            <DownloadRing progress={jobs?.downloads?.find((item) => item.id === p.id) ?? null} />
                          </button>
                        )
                        : (
                          <button className="icbtn" title={m.inbox.actions.download} onClick={() => ingest(p.id)}>
                            <IconDownload />
                          </button>
                        )}
                    <button className="icbtn" title={m.inbox.actions.readLater} onClick={() => queue(p.id)}>
                      <IconLater />
                    </button>
                    {stream === 'watch' ? (
                      <button
                        className="icbtn" title={m.inbox.actions.dismiss}
                        onClick={() => dismiss([p.id], m.inbox.notices.dismissed)}
                      ><IconCross /></button>
                    ) : null}
                    </>
                  )}
                  notices={(
                    <>
                      {collided.has(p.id) ? (
                        <PaperCardNotice action={(
                          <button className="btn plain" onClick={() => open('reader', p.paper)}>{m.inbox.actions.open}</button>
                        )}>{m.inbox.notices.alreadyInLibrary(collided.get(p.id) ?? '')}</PaperCardNotice>
                      ) : null}
                      {failed.has(p.id) ? (
                        <PaperCardNotice tone="error" action={(
                          <button className="btn plain" onClick={() => ingest(p.id)}>{m.common.retry}</button>
                        )}>{failed.get(p.id)}</PaperCardNotice>
                      ) : null}
                    </>
                  )}
                  metadata={(
                    <>
                      {p.authors}{p.venue ? <PaperCardBadge>{p.venue}</PaperCardBadge> : null}
                      {(p.ranking?.citationCount ?? 0) > 0
                        ? <PaperCardCitations count={p.ranking?.citationCount ?? 0} /> : null}
                    </>
                  )}
                  abstract={p.abstract} {...(
                    stream === 'discovery' && p.reasons.length > 0
                      ? { recommendation: p.reasons.map((reason) => reason.label).join(' · ') }
                      : p.rec === '' ? {} : { recommendation: p.rec }
                  )}
                />
              </Fragment>
              )})}
            </>
          )}
      </PageBody>
    </PageShell>
  )
}
