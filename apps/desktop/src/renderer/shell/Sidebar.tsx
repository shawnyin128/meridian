import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ChatSession, Watch } from '../../shared/contract.js'
import { MenuItem } from '../components/ActionMenu.js'
import { DotsMenu } from '../components/FieldPickers.js'
import { Grip, type GripProps } from '../components/Grip.js'
import { IconButton } from '../components/IconButton.js'
import { Icon, IconNorthStar, IconPlus } from '../components/icons.js'
import { NavRow } from '../components/NavRow.js'
import { CountBadge } from '../components/Tag.js'
import { useMessages } from '../messages/useMessages.js'
import { useAppUpdate } from '../hooks/useAppUpdate.js'
import { appUpdates } from '../ipc.js'
import { ALL_WATCHES, type DiscoveryProjectCount, type InboxMode, type ScreenKey } from './AppShell.js'
import { SearchBox } from './SearchBox.js'
import { PaperText } from '../components/paper/PaperText.js'
import { plainTitle } from '../components/paper/paper-text.js'

const CARET = <Icon sw={2.4}><path d="M6 9l6 6 6-6" /></Icon>

const Caret = () => <span className="sh-caret">{CARET}</span>

/** The caret that folds the groups under a row; its click never reaches the row. */
function CaretToggle({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  const m = useMessages()
  return (
    <button
      type="button" className="sh-caret" aria-label={m.shell.sidebar.toggleGroup(label)} aria-expanded={open}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
    >{CARET}</button>
  )
}

/**
 * A watch's row in the sidebar. When `count` is 0 there is no badge; a paused watch is greyed out and
 * shows no badge, as in the demo's applyWatchUI.
 */
function WatchRow({ watch, count, on, onOpen }: {
  watch: Watch; count: number; on: boolean; onOpen: () => void
}) {
  return (
    <NavRow
      className={watch.active ? 'srow sub watch-row' : 'srow sub dim watch-row'} selected={on}
      data-watchrow={watch.id} data-inbox={watch.id}
      onActivate={onOpen}
    >
      <span className="ic" />
      <span className="watch-name">{watch.name}</span>
      {watch.active && count > 0 ? <CountBadge className="n" count={count} strong /> : null}
    </NavRow>
  )
}

/**
 * A chat's row in the sidebar. The "More" button at its end opens a menu with Archive only: the
 * demo's menu also had pin, rename and delete, which this app does not. Archived chats are not in
 * this list; unarchiving is in Settings.
 */
function ChatRow({ session, on, onOpen, onArchive }: {
  session: ChatSession; on: boolean; onOpen: () => void; onArchive: () => void
}) {
  const m = useMessages()
  return (
    <NavRow
      className="srow chat-row" selected={on} data-chat={session.id} data-dots-row="" onActivate={onOpen}
      label={(
        <>
          <span className="ic">
            <Icon><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>
          </span>
          <span className="ct-t"><PaperText text={session.title} /></span>
        </>
      )}
    >
      <DotsMenu label={m.shell.sidebar.manageChat(plainTitle(session.title))} stopRowActivation>
        <MenuItem onSelect={onArchive}>{m.shell.sidebar.archive}</MenuItem>
      </DotsMenu>
    </NavRow>
  )
}

/** A section heading that folds its section. `extra` is a button of the heading's own, which never folds it. */
function SectHead({ sect, label, closed, onToggle, extra }: {
  sect: string; label: string; closed: boolean; onToggle: () => void; extra?: ReactNode
}) {
  const cls = ['sb-h', extra ? 'chats-h' : null, 'sect-h', closed ? 'closed' : null]
  const className = cls.filter(Boolean).join(' ')
  if (extra === undefined) {
    return (
      <NavRow className={className} data-sect={sect} expanded={!closed} onActivate={onToggle}>
        {label}<Caret />
      </NavRow>
    )
  }
  return (
    <NavRow
      className={className} data-sect={sect} expanded={!closed} onActivate={onToggle}
      label={<>{label}<Caret /></>}
    >{extra}</NavRow>
  )
}

/**
 * Pinned above the trash row once a new version is downloaded, with a button that relaunches into it, or,
 * where the app cannot install in place, once one is found, with a button to its download page.
 */
function UpdateRow() {
  const m = useMessages()
  const update = useAppUpdate()
  if (update?.phase !== 'ready' && update?.phase !== 'available') return null
  const ready = update.phase === 'ready'
  return (
    <div className="update-row" data-desk="update">
      <span className="ic"><Icon><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></Icon></span>
      <span className="update-row-text">
        {ready ? m.shell.update.ready(update.version) : m.shell.update.available(update.version)}
      </span>
      <button
        type="button" className="btn pri sm update-row-action"
        onClick={() => { if (ready) appUpdates.install(); else window.open(update.url) }}
      >{ready ? m.shell.update.relaunch : m.shell.update.download}</button>
    </div>
  )
}

/**
 * The sidebar: global search, updates, Inbox, Chats, My library, Research, and Trash.
 * Clicking the Chats heading does not switch screens; every other item opens one. `onJump` goes to
 * the global search, and clicking a result opens that item on its screen.
 * While `paperCount`, `changeCount`, `projectCount` or `wikiCount` is null, its badge is not rendered;
 * when `trashCount` or `laterCount` is 0 its row has no badge, like the demo's `TRASH.length||''`.
 * `watches` fills the Watched topics and Watched authors groups under the Inbox; `inboxCounts` gives
 * each watch's number of delivered papers by watch id, and a watch missing from it counts as 0.
 * `inboxMode` tells the Discovery stream from the watch stream and `inboxScope` is the scope shown in
 * it; together they decide which row is selected.
 * `chats` fills the list under Chats; archived chats are not here but in Settings. `chatId` is the
 * chat the Chats screen shows; null means none is selected.
 * `grip` is the props of the grip on the sidebar's edge: the shell owns the sidebar's width and the
 * grip's hover tooltip. A `collapsed` sidebar is inert: nothing in it takes focus.
 */
export function Sidebar({
  screen, onNavigate, onJump, paperCount, changeCount, projectCount, trashCount, wikiCount, ideaCount,
  inboxScope, inboxMode, onOpenInbox, watches, inboxCounts, discoveryCount, discoveryProjects, laterCount,
  chats, chatId, onOpenChat, onNewChat, onArchiveChat, grip, collapsed,
}: {
  screen: ScreenKey
  onNavigate: (next: ScreenKey) => void
  onJump: (next: ScreenKey, target: string) => void
  paperCount: number | null
  changeCount: number | null
  projectCount: number | null
  trashCount: number
  wikiCount: number | null
  ideaCount: number | null
  inboxScope: string
  inboxMode: InboxMode
  onOpenInbox: (scope: string, mode?: InboxMode) => void
  watches: Watch[]
  inboxCounts: Record<string, number>
  discoveryCount: number
  discoveryProjects: DiscoveryProjectCount[]
  laterCount: number
  chats: ChatSession[]
  chatId: string | null
  onOpenChat: (id: string) => void
  onNewChat: () => void
  onArchiveChat: (id: string) => void
  grip: GripProps
  collapsed: boolean
}) {
  const m = useMessages()
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const toggle = (name: string) => setClosed((c) => ({ ...c, [name]: !c[name] }))
  const sect = (name: string) => (closed[name] ? 'sect closed' : 'sect')
  const wgroup = (name: string) => (closed[name] ? 'wgroup closed' : 'wgroup')

  const topics = watches.filter((w) => w.type === 'topic')
  const authors = watches.filter((w) => w.type === 'author')
  const active = chats.filter((s) => !s.archived)
  // The Inmail row counts the papers every watch delivered, the demo's allN = unread.spec + unread.dao.
  const pushed = Object.values(inboxCounts).reduce((sum, n) => sum + n, 0)
  const onWatch = (id: string) => screen === 'inbox' && inboxMode === 'watch' && inboxScope === id
  const onDiscovery = (id: string) => screen === 'inbox' && inboxMode === 'discovery' && inboxScope === id

  return (
    <div className="sidebar" id="sidebar" inert={collapsed}>
      <SearchBox onJump={onJump} />

      <div className="sb-top">
        <NavRow
          className="srow" selected={screen === 'feed'} id="rowFeed" data-desk="feed"
          style={{ marginTop: 8 }} onActivate={() => onNavigate('feed')}
        >
          <span className="ic"><Icon><path d="M22 12h-4l-3 8L9 4l-3 8H2" /></Icon></span>{m.shell.nav.feed}
        </NavRow>

        <SectHead sect="inbox" label={m.shell.nav.inbox} closed={!!closed['inbox']} onToggle={() => toggle('inbox')} />
        <div className={sect('inbox')} id="sect-inbox">
          {/* As in the demo, only this row's caret collapses its subgroups; the rest of the row opens the Inbox. */}
          <NavRow
            className={closed['inboxsub'] ? 'srow closed' : 'srow'} selected={onWatch(ALL_WATCHES)}
            id="rowInboxAll" data-inbox={ALL_WATCHES} onActivate={() => onOpenInbox(ALL_WATCHES)}
            label={(
              <>
                <span className="ic">
                  <Icon>
                    <path d="M22 13h-5l-2 3h-6l-2-3H2" />
                    <path d="M5.4 5.6L2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.4-7.4A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.6z" />
                  </Icon>
                </span>{m.shell.nav.delivery}
              </>
            )}
          >
            <CaretToggle label={m.shell.nav.delivery} open={!closed['inboxsub']} onToggle={() => toggle('inboxsub')} />
            {pushed > 0 ? <CountBadge className="n" count={pushed} strong /> : null}
          </NavRow>
          <div className={wgroup('inboxsub')} id="g-inboxsub">
            <NavRow
              className={closed['discoverysub'] ? 'srow discovery closed' : 'srow discovery'}
              selected={onDiscovery(ALL_WATCHES)} data-inbox="discovery"
              onActivate={() => onOpenInbox(ALL_WATCHES, 'discovery')}
              label={<><span className="ic"><IconNorthStar /></span>{m.shell.nav.discovery}</>}
            >
              {discoveryProjects.length > 0 ? (
                <CaretToggle
                  label={m.shell.nav.discovery} open={!closed['discoverysub']} onToggle={() => toggle('discoverysub')}
                />
              ) : null}
              {discoveryCount > 0 ? <CountBadge className="n" count={discoveryCount} strong /> : null}
            </NavRow>
            <div className={wgroup('discoverysub')} id="g-discoverysub">
              {discoveryProjects.map((held) => (
                <NavRow
                  key={held.id} className="srow sub watch-row" selected={onDiscovery(held.id)}
                  data-discovery-project={held.id} onActivate={() => onOpenInbox(held.id, 'discovery')}
                >
                  <span className="ic" />
                  <span className="watch-name">{held.name}</span>
                  <CountBadge className="n" count={held.count} strong />
                </NavRow>
              ))}
            </div>
            <NavRow
              className={closed['topics'] ? 'srow disc closed' : 'srow disc'} data-disc="topics"
              expanded={!closed['topics']} onActivate={() => toggle('topics')}
            >
              <span className="ic">
                <Icon>
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </Icon>
              </span>{m.shell.nav.watchTopics}<Caret /><CountBadge className="n" count={topics.length} />
            </NavRow>
            <div className={wgroup('topics')} id="g-topics">
              {topics.map((w) => (
                <WatchRow
                  key={w.id} watch={w} count={inboxCounts[w.id] ?? 0} on={onWatch(w.id)}
                  onOpen={() => onOpenInbox(w.id)}
                />
              ))}
            </div>
            <NavRow
              className={closed['authors'] ? 'srow disc closed' : 'srow disc'} data-disc="authors"
              expanded={!closed['authors']} onActivate={() => toggle('authors')}
            >
              <span className="ic">
                <Icon><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>
              </span>{m.shell.nav.watchAuthors}<Caret /><CountBadge className="n" count={authors.length} />
            </NavRow>
            <div className={wgroup('authors')} id="g-authors">
              {authors.map((w) => (
                <WatchRow
                  key={w.id} watch={w} count={inboxCounts[w.id] ?? 0} on={onWatch(w.id)}
                  onOpen={() => onOpenInbox(w.id)}
                />
              ))}
            </div>
          </div>
          <NavRow
            className="srow" selected={screen === 'later'} id="rowLater" data-desk="later"
            onActivate={() => onNavigate('later')}
          >
            <span className="ic"><Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon></span>
            {m.shell.nav.later}{laterCount > 0 ? <CountBadge className="n" count={laterCount} /> : null}
          </NavRow>
        </div>

        <SectHead
          sect="chats" label={m.shell.nav.chats} closed={!!closed['chats']} onToggle={() => toggle('chats')}
          extra={(
            <IconButton
              label={m.shell.nav.newChat} size="inline" className="sb-add"
              onClick={(e) => { e.stopPropagation(); onNewChat() }}
            ><IconPlus /></IconButton>
          )}
        />
        <div className={sect('chats')} id="sect-chats">
          <div id="chatList">
            {active.map((s) => (
              <ChatRow
                key={s.id} session={s} on={s.id === chatId} onOpen={() => onOpenChat(s.id)}
                onArchive={() => onArchiveChat(s.id)}
              />
            ))}
          </div>
        </div>

        <SectHead sect="lib" label={m.shell.nav.myLibrary} closed={!!closed['lib']} onToggle={() => toggle('lib')} />
        <div className={sect('lib')} id="sect-lib">
          <NavRow
            className="srow" selected={screen === 'wiki'} data-desk="wiki"
            onActivate={() => onNavigate('wiki')}
          >
            <span className="ic">
              <Icon>
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5" /><path d="M2 17l10 5 10-5" />
              </Icon>
            </span>{m.shell.nav.wiki}{wikiCount === null ? null : <CountBadge className="n" count={wikiCount} />}
          </NavRow>
          <NavRow
            className="srow" selected={screen === 'papers'} data-desk="papers"
            onActivate={() => onNavigate('papers')}
          >
            <span className="ic">
              <Icon>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </Icon>
            </span>{m.shell.nav.papers}{paperCount === null ? null : <CountBadge className="n" count={paperCount} />}
          </NavRow>
          <NavRow
            className="srow" selected={screen === 'changelog'} data-desk="changelog"
            onActivate={() => onNavigate('changelog')}
          >
            <span className="ic">
              <Icon>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
              </Icon>
            </span>{m.shell.nav.changelog}{changeCount === null ? null : <CountBadge className="n" count={changeCount} />}
          </NavRow>
        </div>

        <SectHead sect="research" label={m.shell.nav.research} closed={!!closed['research']} onToggle={() => toggle('research')} />
        <div className={sect('research')} id="sect-research">
          <NavRow
            className="srow" selected={screen === 'overview'} data-desk="restl"
            onActivate={() => onNavigate('overview')}
          >
            <span className="ic"><Icon><path d="M4 6h8" /><path d="M9 12h11" /><path d="M6 18h9" /></Icon></span>{m.shell.nav.overview}
          </NavRow>
          <NavRow
            className="srow" selected={screen === 'project'} data-desk="resproj"
            onActivate={() => onNavigate('project')}
          >
            <span className="ic">
              <Icon>
                <path d="M10 2v7.5L4.7 19a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 9.5V2" />
                <path d="M8.5 2h7" /><path d="M7 16h10" />
              </Icon>
            </span>{m.shell.nav.projects}{projectCount === null ? null : <CountBadge className="n" count={projectCount} />}
          </NavRow>
          <NavRow
            className="srow" selected={screen === 'ideas'} data-desk="ideas"
            onActivate={() => onNavigate('ideas')}
          >
            <span className="ic">
              <Icon><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.2 14.5A7 7 0 1 1 15.8 14.5C14.8 15.2 14.5 16 14.5 17h-5c0-1-.3-1.8-1.3-2.5z" /></Icon>
            </span>{m.shell.nav.ideas}{ideaCount === null ? null : <CountBadge className="n" count={ideaCount} />}
          </NavRow>
        </div>
      </div>

      <UpdateRow />
      {/* The trash can does not belong to any content group and is pinned outside the scroll area just like demo. */}
      <NavRow
        className="srow" selected={screen === 'trash'} data-desk="trash"
        style={{ flexShrink: 0, marginTop: 6 }} onActivate={() => onNavigate('trash')}
      >
        <span className="ic">
          <Icon>
            <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
          </Icon>
        </span>{m.shell.nav.trash}{trashCount > 0 ? <CountBadge className="n" count={trashCount} /> : null}
      </NavRow>
      <Grip {...grip} />
    </div>
  )
}
