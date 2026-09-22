import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { ChatSession, Watch } from '../../shared/contract.js'
import { MenuItem } from '../components/ActionMenu.js'
import { DotsMenu } from '../components/FieldPickers.js'
import { Icon, IconNorthStar, IconPlus } from '../components/icons.js'
import { useMessages } from '../messages/useMessages.js'
import { useAppUpdate } from '../hooks/useAppUpdate.js'
import { appUpdates } from '../ipc.js'
import { ALL_WATCHES, type DiscoveryProjectCount, type InboxMode, type ScreenKey } from './AppShell.js'
import { SearchBox } from './SearchBox.js'

const Caret = ({ onClick }: { onClick?: (e: ReactMouseEvent) => void }) => (
  <span className="sh-caret" onClick={onClick}><Icon sw={2.4}><path d="M6 9l6 6 6-6" /></Icon></span>
)

/**
 * A line of concern in the sidebar. When `count` is 0, the subscript is empty (the empty subscript is hidden by CSS), and the paused bar
 * It turns gray and does not display the corner mark, which is consistent with the demo's applyWatchUI.
 */
function WatchRow({ watch, count, on, onOpen }: {
  watch: Watch; count: number; on: boolean; onOpen: () => void
}) {
  const cls = ['srow', 'sub', on ? 'on' : null, watch.active ? null : 'dim']
  return (
    <div
      className={[...cls, 'watch-row'].filter(Boolean).join(' ')}
      data-watchrow={watch.id} data-inbox={watch.id}
      onClick={onOpen}
    >
      <span className="ic" />
      <span className="watch-name">{watch.name}</span>
      {watch.active ? <span className={count > 0 ? 'n new' : 'n'}>{count || ''}</span> : null}
    </div>
  )
}

/**
 * A conversation's row in the sidebar. The "More" button at the end of the line opens a menu with only archives: demo. That menu also has pinned,
 * Rename and delete, this application does not have those three things. Archived conversations are not in this column, unarchiving is in the settings.
 */
function ChatRow({ session, on, onOpen, onArchive }: {
  session: ChatSession; on: boolean; onOpen: () => void; onArchive: () => void
}) {
  const m = useMessages()
  return (
    <div
      className={on ? 'srow chat-row on' : 'srow chat-row'} data-chat={session.id} onClick={onOpen}
    >
      <span className="ic">
        <Icon><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>
      </span>
      <span className="ct-t">{session.title}</span>
      <DotsMenu label={m.shell.sidebar.manageChat(session.title)} stopRowActivation>
        <MenuItem onSelect={onArchive}>{m.shell.sidebar.archive}</MenuItem>
      </DotsMenu>
    </div>
  )
}

function SectHead({ sect, label, closed, onToggle, extra }: {
  sect: string; label: string; closed: boolean; onToggle: () => void; extra?: ReactNode
}) {
  const cls = ['sb-h', extra ? 'chats-h' : null, 'sect-h', closed ? 'closed' : null]
  return (
    <div
      className={cls.filter(Boolean).join(' ')} data-sect={sect}
      // demo excludes .sb-add: the buttons in the title have their own actions and should not be collapsed together with this section.
      onClick={(e) => { if (!(e.target as HTMLElement).closest('.sb-add')) onToggle() }}
    >
      {label}<Caret />{extra}
    </div>
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
        type="button" className="btn pri update-row-action"
        onClick={() => { if (ready) appUpdates.install(); else window.open(update.url) }}
      >{ready ? m.shell.update.relaunch : m.shell.update.download}</button>
    </div>
  )
}

/**
 * Study sidebar: global search, updates, incoming items, conversations, my library, research, and trash can.
 * Click "Dialogue" without cutting the screen, and all other items will lead to one screen; `onJump` is handed over to the global search, and the results of clicking an item will fall to
 * That one on that screen.
 * When `paperCount`, `changeCount`, `projectCount` and `wikiCount` are null, the corresponding subscripts are not rendered, `trashCount`
 * When it is 0, the trash can corner is empty (the empty corner is hidden by CSS, consistent with the demo's `TRASH.length||''`).
 * `watches` displays two groups of attention·topic and attention·author under the inbox, `inboxCounts` gives each according to the attention id
 * The number of push items, and the followings that do not appear in it are counted as 0. `inboxMode` distinguishes discovery and attention flows, `inboxScope`
 * It is the file currently viewed in the focus stream; both determine the selected state of the sidebar.
 * `chats` displays the conversation list under the conversation. The archived ones are not in this column, they are in the settings; `chatId` is the conversation screen
 * When the currently viewed item is null, no session is selected.
 * `grip` is the three mouse processors of the retractable handle. Drag and drop, click to collapse and hover prompts are all implemented by the shell.
 */
export function Sidebar({
  screen, onNavigate, onJump, paperCount, changeCount, projectCount, trashCount, wikiCount, ideaCount,
  inboxScope, inboxMode, onOpenInbox, watches, inboxCounts, discoveryCount, discoveryProjects, laterCount,
  chats, chatId, onOpenChat, onNewChat, onArchiveChat, grip,
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
  grip: {
    onMouseDown: (e: ReactMouseEvent) => void
    onMouseEnter: (e: ReactMouseEvent) => void
    onMouseLeave: () => void
  }
}) {
  const m = useMessages()
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const toggle = (name: string) => setClosed((c) => ({ ...c, [name]: !c[name] }))
  const sect = (name: string) => (closed[name] ? 'sect closed' : 'sect')
  const wgroup = (name: string) => (closed[name] ? 'wgroup closed' : 'wgroup')

  const topics = watches.filter((w) => w.type === 'topic')
  const authors = watches.filter((w) => w.type === 'author')
  const active = chats.filter((s) => !s.archived)
  // "Paper push" counts the number of articles brought in by all following, which is synonymous with demo's allN = unread.spec + unread.dao
  const pushed = Object.values(inboxCounts).reduce((sum, n) => sum + n, 0)
  const onWatch = (id: string) => screen === 'inbox' && inboxMode === 'watch' && inboxScope === id
  const onDiscovery = (id: string) => screen === 'inbox' && inboxMode === 'discovery' && inboxScope === id
  const inboxAll = [
    'srow', closed['inboxsub'] ? 'closed' : null,
    screen === 'inbox' && inboxMode === 'watch' && inboxScope === ALL_WATCHES ? 'on' : null,
  ]

  return (
    <div className="sidebar" id="sidebar">
      <SearchBox onJump={onJump} />

      <div className="sb-top">
        <div
          className={screen === 'feed' ? 'srow on' : 'srow'} id="rowFeed" data-desk="feed"
          style={{ marginTop: 8 }} onClick={() => onNavigate('feed')}
        >
          <span className="ic"><Icon><path d="M22 12h-4l-3 8L9 4l-3 8H2" /></Icon></span>{m.shell.nav.feed}
        </div>

        <SectHead sect="inbox" label={m.shell.nav.inbox} closed={!!closed['inbox']} onToggle={() => toggle('inbox')} />
        <div className={sect('inbox')} id="sect-inbox">
          {/* The demo only allows the caret of this row to collapse subgroups, leaving the rest of the row for the recipient view */}
          <div
            className={inboxAll.filter(Boolean).join(' ')} id="rowInboxAll" data-inbox={ALL_WATCHES}
            onClick={() => onOpenInbox(ALL_WATCHES)}
          >
            <span className="ic">
              <Icon>
                <path d="M22 13h-5l-2 3h-6l-2-3H2" />
                <path d="M5.4 5.6L2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.4-7.4A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.6z" />
              </Icon>
            </span>{m.shell.nav.delivery}
            <Caret onClick={(e) => { e.stopPropagation(); toggle('inboxsub') }} />
            <span className={pushed > 0 ? 'n new' : 'n'}>{pushed || ''}</span>
          </div>
          <div className={wgroup('inboxsub')} id="g-inboxsub">
            <div
              className={[
                'srow discovery', closed['discoverysub'] ? 'closed' : null,
                onDiscovery(ALL_WATCHES) ? 'on' : null,
              ].filter(Boolean).join(' ')}
              data-inbox="discovery" onClick={() => onOpenInbox(ALL_WATCHES, 'discovery')}
            >
              <span className="ic"><IconNorthStar /></span>{m.shell.nav.discovery}
              {discoveryProjects.length > 0
                ? <Caret onClick={(e) => { e.stopPropagation(); toggle('discoverysub') }} /> : null}
              <span className={discoveryCount > 0 ? 'n new' : 'n'}>{discoveryCount || ''}</span>
            </div>
            <div className={wgroup('discoverysub')} id="g-discoverysub">
              {discoveryProjects.map((held) => (
                <div
                  key={held.id} className={onDiscovery(held.id) ? 'srow sub watch-row on' : 'srow sub watch-row'}
                  data-discovery-project={held.id} onClick={() => onOpenInbox(held.id, 'discovery')}
                >
                  <span className="ic" />
                  <span className="watch-name">{held.name}</span>
                  <span className="n new">{held.count}</span>
                </div>
              ))}
            </div>
            <div
              className={closed['topics'] ? 'srow disc closed' : 'srow disc'} data-disc="topics"
              onClick={() => toggle('topics')}
            >
              <span className="ic">
                <Icon>
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </Icon>
              </span>{m.shell.nav.watchTopics}<Caret /><span className="n">{topics.length}</span>
            </div>
            <div className={wgroup('topics')} id="g-topics">
              {topics.map((w) => (
                <WatchRow
                  key={w.id} watch={w} count={inboxCounts[w.id] ?? 0} on={onWatch(w.id)}
                  onOpen={() => onOpenInbox(w.id)}
                />
              ))}
            </div>
            <div
              className={closed['authors'] ? 'srow disc closed' : 'srow disc'} data-disc="authors"
              onClick={() => toggle('authors')}
            >
              <span className="ic">
                <Icon><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>
              </span>{m.shell.nav.watchAuthors}<Caret /><span className="n">{authors.length}</span>
            </div>
            <div className={wgroup('authors')} id="g-authors">
              {authors.map((w) => (
                <WatchRow
                  key={w.id} watch={w} count={inboxCounts[w.id] ?? 0} on={onWatch(w.id)}
                  onOpen={() => onOpenInbox(w.id)}
                />
              ))}
            </div>
          </div>
          <div
            className={screen === 'later' ? 'srow on' : 'srow'} id="rowLater" data-desk="later"
            onClick={() => onNavigate('later')}
          >
            <span className="ic"><Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon></span>
            {m.shell.nav.later}<span className="n">{laterCount || ''}</span>
          </div>
        </div>

        <SectHead
          sect="chats" label={m.shell.nav.chats} closed={!!closed['chats']} onToggle={() => toggle('chats')}
          extra={(
            <button className="sb-add" title={m.shell.nav.newChat} onClick={onNewChat}>
              <IconPlus />
            </button>
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
          <div
            className={screen === 'wiki' ? 'srow on' : 'srow'} data-desk="wiki"
            onClick={() => onNavigate('wiki')}
          >
            <span className="ic">
              <Icon>
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5" /><path d="M2 17l10 5 10-5" />
              </Icon>
            </span>{m.shell.nav.wiki}{wikiCount === null ? null : <span className="n">{wikiCount}</span>}
          </div>
          <div
            className={screen === 'papers' ? 'srow on' : 'srow'} data-desk="papers"
            onClick={() => onNavigate('papers')}
          >
            <span className="ic">
              <Icon>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </Icon>
            </span>{m.shell.nav.papers}{paperCount === null ? null : <span className="n">{paperCount}</span>}
          </div>
          <div
            className={screen === 'changelog' ? 'srow on' : 'srow'} data-desk="changelog"
            onClick={() => onNavigate('changelog')}
          >
            <span className="ic">
              <Icon>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
              </Icon>
            </span>{m.shell.nav.changelog}{changeCount === null ? null : <span className="n">{changeCount}</span>}
          </div>
        </div>

        <SectHead sect="research" label={m.shell.nav.research} closed={!!closed['research']} onToggle={() => toggle('research')} />
        <div className={sect('research')} id="sect-research">
          <div
            className={screen === 'overview' ? 'srow on' : 'srow'} data-desk="restl"
            onClick={() => onNavigate('overview')}
          >
            <span className="ic"><Icon><path d="M4 6h8" /><path d="M9 12h11" /><path d="M6 18h9" /></Icon></span>{m.shell.nav.overview}
          </div>
          <div
            className={screen === 'project' ? 'srow on' : 'srow'} data-desk="resproj"
            onClick={() => onNavigate('project')}
          >
            <span className="ic">
              <Icon>
                <path d="M10 2v7.5L4.7 19a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 9.5V2" />
                <path d="M8.5 2h7" /><path d="M7 16h10" />
              </Icon>
            </span>{m.shell.nav.projects}{projectCount === null ? null : <span className="n">{projectCount}</span>}
          </div>
          <div
            className={screen === 'ideas' ? 'srow on' : 'srow'} data-desk="ideas"
            onClick={() => onNavigate('ideas')}
          >
            <span className="ic">
              <Icon><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.2 14.5A7 7 0 1 1 15.8 14.5C14.8 15.2 14.5 16 14.5 17h-5c0-1-.3-1.8-1.3-2.5z" /></Icon>
            </span>{m.shell.nav.ideas}{ideaCount === null ? null : <span className="n">{ideaCount}</span>}
          </div>
        </div>
      </div>

      <UpdateRow />
      {/* The trash can does not belong to any content group and is pinned outside the scroll area just like demo. */}
      <div
        className={screen === 'trash' ? 'srow on' : 'srow'} data-desk="trash"
        style={{ flexShrink: 0, marginTop: 6 }} onClick={() => onNavigate('trash')}
      >
        <span className="ic">
          <Icon>
            <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
          </Icon>
        </span>{m.shell.nav.trash}<span className="n">{trashCount || ''}</span>
      </div>
      <div className="grip" id="sbgrip" {...grip} />
    </div>
  )
}
