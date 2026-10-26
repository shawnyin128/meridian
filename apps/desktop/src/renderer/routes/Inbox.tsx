import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  DiscoveryProfile, FetchStatus, InboxDownloadFailure, InboxEntry,
  InboxListParams, Watch,
} from '../../shared/contract.js'
import { listingsOf } from '../../shared/inbox-streams.js'
import { discovery, inbox, watch } from '../ipc.js'
import {
  ALL_WATCHES, useCrumbTail, useInboxMode, useInboxScope, useJump, useNotice, useSettingsOpen, useVaultRevision,
} from '../shell/AppShell.js'
import { useJobs } from '../shell/useJobs.js'
import { errorLabel, failureLabel } from '../lib/failure-label.js'
import type { Catalog } from '../messages/catalog.js'
import { useMessages } from '../messages/useMessages.js'
import {
  DownloadRing, Icon, IconDownload, IconGear, IconLater, IconSeen, IconTrash,
} from '../components/icons.js'
import { IconButton } from '../components/IconButton.js'
import {
  PaperCard, PaperCardBadge, PaperCardCitations, PaperCardNotice,
} from '../components/paper/PaperCard.js'
import { EmptyState } from '../components/EmptyState.js'
import { InlineMessage } from '../components/InlineMessage.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { Group, GroupedList } from '../components/GroupedList.js'
import { DateTimeDisplay } from '../components/DateTimeDisplay.js'
import { SortMenu } from '../components/SortMenu.js'
import { Tag } from '../components/Tag.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { shownSource } from '../lib/watch-source.js'
import {
  PageBody, PageError, PageHeader, PageNote, PageShell, PageTitle,
} from '../components/PageShell.js'
import { Button } from '../components/Button.js'
import './shell.css'

/** The demo's `.pcard` slide-away: the vault is written only after the card has slid away this long. */
const LEAVE_MS = 260

const SORTS = ['recommended', 'latest', 'published', 'impact'] as const

/** A watch's label in the Inbox, kind · name, as in the demo's WATCHES. */
const label = (w: Watch, watchKind: Record<Watch['type'], string>) => `${watchKind[w.type]} · ${w.name}`

/** The stream label shown in the page title and breadcrumb tail: paper delivery or paper discovery. */
const streamLabel = (m: Catalog, stream: 'watch' | 'discovery'): string =>
  (stream === 'watch' ? m.inbox.streamLabel.watch : m.inbox.streamLabel.discovery)

/**
 * The watch fetch's status line for `scope`: the time of the last finished run when it fetched that
 * scope, saying first when it brought nothing new, or else the time of the last full fetch.
 */
function fetchNote(status: FetchStatus | null, scope: string, m: Catalog): ReactNode {
  if (status === null) return ''
  if (status.state === 'checking') return ''
  if (status.state === 'failed') {
    return <InlineMessage tone="error" variant="line">{failureLabel(m, m.inbox.check.failed, status.reason ?? 'unknown')}</InlineMessage>
  }
  const last = status.last
  const fetched = last?.watches === null ? scope === ALL_WATCHES : last?.watches.length === 1 && last.watches[0] === scope
  const at = last !== undefined && fetched ? last.at : status.checkedAt
  if (at === null) return ''
  return (
    <>
      {last !== undefined && fetched && last.added === 0 ? `${m.inbox.check.noneNew} · ` : null}
      {m.inbox.check.lastChecked}{' '}<DateTimeDisplay at={at} />
    </>
  )
}

/**
 * Inbox: papers fetched for your watches (Inmail) or recommended for your projects (Discovery),
 * shown in groups. Each paper can be downloaded into the vault, saved to Read Later or dismissed.
 */
export function Inbox() {
  const m = useMessages()
  const scope = useInboxScope()
  const stream = useInboxMode()
  const [entries, setEntries] = useState<InboxEntry[] | null>(null)
  const [watches, setWatches] = useState<Watch[]>([])
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([])
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set())

  const notice = useNotice()
  const { openCategory } = useSettingsOpen()
  const { open, enter } = useJump()
  const { revision, bump } = useVaultRevision()
  const { error, load } = useScreenLoad()
  const write = useVaultWrite()
  const undo = useUndo()
  const jobs = useJobs()
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [failed, setFailed] = useState<ReadonlyMap<string, InboxDownloadFailure>>(new Map())
  const [sort, setSort] = useState<NonNullable<InboxListParams['sort']>>('recommended')
  const [discovering, setDiscovering] = useState(false)

  // Discovery is scoped by project and paper delivery by watch; the sidebar sets the scope for either stream.
  useEffect(() => {
    const scoped = scope === ALL_WATCHES ? {} : stream === 'discovery' ? { project: scope } : { watch: scope }
    return load('entries', inbox.list({ kind: stream, sort, ...scoped }), (rows) => {
      setEntries(rows)
      setLeaving(new Set())
    })
  }, [load, revision, scope, sort, stream])
  useEffect(() => load('watches', watch.list(), setWatches), [load, revision])
  useEffect(() => load('profiles', discovery.profiles(), setProfiles), [load, revision])

  const watched = watches.find((w) => w.id === scope)
  // Until the list for a new stream or scope arrives, the one held may name entries it does not list.
  const rows = useMemo(() => (entries ?? []).filter((entry) => (
    listingsOf(entry, stream).some((listing) => scope === ALL_WATCHES || listing.id === scope)
  )), [entries, scope, stream])
  // A card shows under the scope in view, or else under the first stream of this kind that lists it.
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; title: string; rows: InboxEntry[] }>()
    for (const row of rows) {
      const listings = listingsOf(row, stream)
      const listing = listings.find((held) => held.id === scope) ?? listings[0]!
      const group = byKey.get(listing.id) ?? { key: listing.id, title: shownSource(listing.source), rows: [] }
      group.rows.push(row)
      byKey.set(listing.id, group)
    }
    return [...byKey.values()]
  }, [rows, scope, stream])
  const scopedProject = stream === 'discovery' && scope !== ALL_WATCHES ? groups[0]?.title ?? '' : null
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const toggleGroup = (key: string) => setFolded((held) => {
    const next = new Set(held)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const tail = useMemo(
    () => (scope === ALL_WATCHES
      ? [{ text: streamLabel(m, stream) }]
      : scopedProject !== null
        ? [{ text: streamLabel(m, stream) }, { text: scopedProject }]
        : watched ? [{ text: m.shell.watchKind[watched.type] }, { text: watched.name }] : []),
    [scope, scopedProject, stream, watched, m],
  )
  useCrumbTail(tail)

  const leave = (ids: string[]) => setLeaving((prev) => new Set([...prev, ...ids]))

  const dismiss = (ids: string[], text: string) => {
    leave(ids)
    window.setTimeout(() => {
      void write(Promise.all(ids.map((id) => inbox.dismiss(id))), { note: text, action: undo.restore })
    }, LEAVE_MS)
  }

  const queue = (id: string) => {
    leave([id])
    void inbox.readLater(id).then(() => {
      window.setTimeout(bump, LEAVE_MS)
    }).catch((e: unknown) => notice.refusal(errorLabel(m, e)))
  }

  const ingest = (id: string) => {
    setBusy((held) => new Set([...held, id]))
    setFailed((held) => {
      const next = new Map(held)
      next.delete(id)
      return next
    })
    void inbox.download(id).then((result) => {
      if (result.kind === 'failed') {
        setFailed((held) => new Map(held).set(id, result.reason))
        return
      }
      leave([id])
      notice.success(
        result.kind === 'added' ? m.inbox.notices.downloaded : m.inbox.notices.duplicateToast,
        { label: m.papers.rowActions.openReader, onAction: () => open('reader', result.paper) },
      )
      window.setTimeout(bump, LEAVE_MS)
    }).catch((e: unknown) => notice.refusal(errorLabel(m, e))).finally(() => {
      setBusy((held) => {
        const next = new Set(held)
        next.delete(id)
        return next
      })
    })
  }

  const refreshDiscovery = () => {
    setDiscovering(true)
    void (scope === ALL_WATCHES ? discovery.fetch() : discovery.fetch(scope, true)).then((result) => {
      if (result.failedIntents > 0) notice.refusal(m.settings.discovery.failed(result.failedIntents))
      bump()
    }).catch((e: unknown) => notice.refusal(errorLabel(m, e))).finally(() => setDiscovering(false))
  }

  const feedback = (id: string, value: 'more' | 'less' | 'known') => {
    if (value === 'more') {
      void discovery.feedback(id, value).then(() => {
        bump()
      }).catch((e: unknown) => notice.refusal(errorLabel(m, e)))
      return
    }
    leave([id])
    window.setTimeout(() => {
      void write(
        discovery.feedback(id, value).then((trashed) => (trashed === null ? [] : [trashed])),
        { note: value === 'known' ? m.inbox.notices.known : m.inbox.notices.remembered, action: undo.restore },
      )
    }, LEAVE_MS)
  }

  const card = (p: InboxEntry) => (
    <PaperCard
      key={p.id} paperId={p.id} watchId={p.watch} title={p.title} authors={p.authors} leaving={leaving.has(p.id)}
      actions={(
        <>
        {stream === 'discovery' ? (
          <>
            <IconButton
              label={m.inbox.actions.more} size="nested" pressed={p.feedback === 'more'} onClick={() => feedback(p.id, 'more')}
            ><Icon><path d="M7 10v11H3V10h4zM7 19l4 2h6.5a2 2 0 0 0 2-1.7l1.2-7A2 2 0 0 0 18.7 10H14l1-4.2A2.3 2.3 0 0 0 12.8 3L7 10z" /></Icon></IconButton>
            <IconButton label={m.inbox.actions.less} size="nested" onClick={() => feedback(p.id, 'less')}>
              <Icon><path d="M7 14V3H3v11h4zM7 5l4-2h6.5a2 2 0 0 1 2 1.7l1.2 7a2 2 0 0 1-2 2.3H14l1 4.2a2.3 2.3 0 0 1-2.2 2.8L7 14z" /></Icon>
            </IconButton>
            <IconButton label={m.inbox.actions.known} size="nested" onClick={() => feedback(p.id, 'known')}>
              <IconSeen />
            </IconButton>
          </>
        ) : null}
        {busy.has(p.id)
          ? (
            <IconButton label={m.inbox.actions.download} size="nested" className="busy" disabled aria-busy>
              <DownloadRing progress={jobs?.downloads?.find((item) => item.id === p.id) ?? null} />
            </IconButton>
          )
          : (
            <IconButton label={m.inbox.actions.download} size="nested" onClick={() => ingest(p.id)}>
              <IconDownload />
            </IconButton>
          )}
        <IconButton label={m.inbox.actions.readLater} size="nested" onClick={() => queue(p.id)}>
          <IconLater />
        </IconButton>
        <IconButton label={m.inbox.actions.dismiss} size="nested" onClick={() => dismiss([p.id], m.inbox.notices.dismissed)}>
          <IconTrash />
        </IconButton>
        </>
      )}
      notices={failed.has(p.id) ? (
        <PaperCardNotice action={(
          <Button size="compact" variant="ghost" onClick={() => ingest(p.id)}>{m.common.retry}</Button>
        )}>{failureLabel(m, m.inbox.notices.downloadFailed, failed.get(p.id)!)}</PaperCardNotice>
      ) : null}
      metadata={(
        <>
          {p.venue ? <PaperCardBadge>{p.venue}</PaperCardBadge> : null}
          {(p.ranking?.citationCount ?? 0) > 0
            ? <PaperCardCitations count={p.ranking?.citationCount ?? 0} /> : null}
        </>
      )}
      abstract={p.abstract} {...(
        (stream === 'discovery' || p.also !== undefined) && p.reasons.length > 0
          ? { recommendation: p.reasons.map((reason) => reason.label).join(' · ') }
          : p.rec === '' ? {} : { recommendation: p.rec }
      )}
    />
  )

  const head = scope === ALL_WATCHES
    ? streamLabel(m, stream)
    : scopedProject ?? (watched ? label(watched, m.shell.watchKind) : '')

  return (
    <PageShell>
      <PageHeader
        actions={(
          <>
            {stream === 'watch' && watched !== undefined && !watched.active ? (
              <>
                <Tag>{m.watches.paused}</Tag>
                <Button
                  size="regular"
                  onClick={() => { void write(watch.setActive(watched.id, true)) }}
                >{m.watches.resume}</Button>
              </>
            ) : null}
            <PageNote>{stream === 'watch' ? fetchNote(jobs?.fetch ?? null, scope, m) : ''}</PageNote>
            {rows.length === 0 ? null : (
              <SortMenu
                label={m.inbox.sortLabel} current={m.inbox.sort[sort]}
                options={SORTS.map((order) => ({ label: m.inbox.sort[order], onSelect: () => setSort(order) }))}
              />
            )}
            <IconButton
              label={stream === 'discovery' ? m.inbox.discoverySettings : m.inbox.watchSettings}
              onClick={() => openCategory(stream === 'discovery' ? 'delivery-discovery' : 'delivery-watch')}
            ><IconGear /></IconButton>
            {stream === 'watch' ? (
              <Button
                size="regular" busy={jobs?.fetch?.state === 'checking'} busyLabel={m.inbox.check.checking}
                onClick={() => {
                  void inbox.fetch(scope === ALL_WATCHES ? undefined : scope).catch((e: unknown) => notice.refusal(errorLabel(m, e)))
                }}
              >{jobs?.fetch?.state === 'failed' ? m.common.retry : m.inbox.checkNewPapers}</Button>
            ) : (
              <Button size="regular" busy={discovering} busyLabel={m.inbox.discovering} onClick={refreshDiscovery}>
                {m.inbox.refreshDiscovery}
              </Button>
            )}
          </>
        )}
      >
        <PageTitle count={rows.length}>{head}</PageTitle>
      </PageHeader>

      <PageError error={error} />

      <PageBody>
        {entries === null
          ? (error === null ? <LoadingPlaceholder shape="cards" /> : null)
          : rows.length === 0
          ? (
            <EmptyState
              variant="page"
              action={stream === 'discovery' && scope === ALL_WATCHES && !profiles.some((profile) => profile.seedCount > 0)
                ? <Button size="regular" onClick={() => enter('project')}>{m.inbox.empty.openProjects}</Button>
                : undefined}
              icon={(
                <Icon sw={1.4}>
                  <path d="M22 13h-5l-2 3h-6l-2-3H2" />
                  <path d="M5.4 5.6L2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.4-7.4A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.6z" />
                </Icon>
              )}
            />
          )
          : (
            <GroupedList>
              {groups.map((group) => (
                <Group
                  key={group.key} data-group={group.key} title={group.title} count={group.rows.length} sticky
                  fold={{ open: !folded.has(group.key), onToggle: () => toggleGroup(group.key) }}
                  actions={(
                    <Button
                      size="compact"
                      onClick={() => dismiss(group.rows.map((r) => r.id), m.inbox.notices.dismissedAll)}
                    >{m.inbox.dismissAll}</Button>
                  )}
                >
                  {group.rows.map(card)}
                </Group>
              ))}
            </GroupedList>
          )}
      </PageBody>
    </PageShell>
  )
}
