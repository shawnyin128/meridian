import { useState } from 'react'
import type { ChatSession, Watch } from '../../shared/contract.js'
import { MenuItem, MenuSeparator } from '../components/ActionMenu.js'
import { DotsMenu } from '../components/FieldPickers.js'
import { RowActions } from '../components/Item.js'
import { Grip, type GripProps } from '../components/Grip.js'
import { AddAction } from '../components/AddAction.js'
import { CHAT_BUBBLE_PATH, Icon, IconNorthStar } from '../components/icons.js'
import { NavPane } from '../components/NavPane.js'
import { NavRow } from '../components/NavRow.js'
import { NavSection } from '../components/NavSection.js'
import { InlineMessage } from '../components/InlineMessage.js'
import { StatusDot } from '../components/StatusDot.js'
import { FadeText } from '../components/FadeText.js'
import { useMessages } from '../messages/useMessages.js'
import { useAppUpdate } from '../hooks/useAppUpdate.js'
import { appUpdates } from '../ipc.js'
import { ALL_WATCHES, type DiscoveryProjectCount, type InboxMode, type JumpAnchor, type ScreenKey } from './AppShell.js'
import { GripTooltip } from './GripTooltip.js'
import { SearchBox } from './SearchBox.js'
import { PaperText } from '../components/paper/PaperText.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { Button } from '../components/Button.js'

/** A watch's row in the sidebar. When `count` is 0 there is no badge; a paused watch is greyed out and keeps its count. */
function WatchRow({ watch, count, on, onOpen }: {
  watch: Watch; count: number; on: boolean; onOpen: () => void
}) {
  return (
    <NavRow
      indent={2} sub dim={!watch.active} selected={on} icon={<NewDot fresh={count > 0} />} count={count}
      data-watchrow={watch.id} data-inbox={watch.id} onActivate={onOpen}
    >
      <FadeText label={watch.name}>{watch.name}</FadeText>
    </NavRow>
  )
}

/** The dot of a row that lists one source of papers: filled while it has new papers, a ring otherwise. */
function NewDot({ fresh }: { fresh: boolean }) {
  return <StatusDot size="nav" tone={fresh ? 'new' : 'neutral'} fill={fresh ? 'full' : 'ring'} />
}

/**
 * A chat's row in the sidebar. The "More" button at its end opens a menu with Archive and Delete:
 * the demo's menu also had pin and rename, which this app does not. Archived chats are not in this
 * list; unarchiving is in Settings.
 */
function ChatRow({ session, on, onOpen, onArchive, onDelete }: {
  session: ChatSession; on: boolean; onOpen: () => void; onArchive: () => void; onDelete: () => void
}) {
  const m = useMessages()
  return (
    <NavRow
      className="chat-row" selected={on} data-chat={session.id} data-row-actions="" onActivate={onOpen}
      icon={<Icon><path d={CHAT_BUBBLE_PATH} /></Icon>}
      actions={(
        <RowActions>
          <DotsMenu label={m.shell.sidebar.manageChat(plainTitle(session.title))} stopRowActivation>
            <MenuItem onSelect={onArchive}>{m.shell.sidebar.archive}</MenuItem>
            <MenuSeparator />
            <MenuItem className="mi danger" onSelect={onDelete}>{m.common.delete}</MenuItem>
          </DotsMenu>
        </RowActions>
      )}
    >
      <FadeText label={plainTitle(session.title)}><PaperText text={session.title} /></FadeText>
    </NavRow>
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
    <InlineMessage
      tone="info" variant="box" data-desk="update"
      lead={<Icon><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></Icon>}
      action={(
        <Button
          size="compact"
          onClick={() => { if (ready) appUpdates.install(); else window.open(update.url) }}
        >{ready ? m.shell.update.relaunch : m.shell.update.download}</Button>
      )}
    >
      {ready ? m.shell.update.ready(update.version) : m.shell.update.available(update.version)}
    </InlineMessage>
  )
}

/**
 * The sidebar: global search, updates, Inbox, Chats, My library, Research, and Trash.
 * Clicking the Chats heading does not switch screens; every other item opens one. `onJump` goes to
 * the global search, and clicking a result opens that item on its screen.
 * No row shows a 0: a row whose count is 0, or null while it loads, has no badge, like the demo's
 * `TRASH.length||''`.
 * `watches` fills the Watched topics and Watched authors groups under the Inbox; `inboxWatches` holds,
 * for each paper the watches delivered, the ids of the watches that list it. A watch's row counts the
 * papers listed under it, and a group row, like the Inmail row, counts each paper once.
 * `inboxMode` tells the Discovery stream from the watch stream and `inboxScope` is the scope shown in
 * it; together they decide which row is selected.
 * `chats` fills the list under Chats; archived chats are not here but in Settings. `chatId` is the
 * chat the Chats screen shows; null means none is selected.
 * `grip` is the props of the grip on the sidebar's edge: the shell owns the sidebar's width. A
 * `collapsed` sidebar is inert: nothing in it takes focus. A `hidden` one is out while the reader's
 * paper chat takes its place. Its rows, from Feed to Trash, are one Tab stop, with the up and down
 * arrow keys between them.
 */
export function Sidebar({
  screen, onNavigate, onJump, paperCount, changeCount, projectCount, trashCount, wikiCount, ideaCount,
  inboxScope, inboxMode, onOpenInbox, watches, inboxWatches, discoveryCount, discoveryProjects, laterCount,
  chats, chatId, onOpenChat, onNewChat, onArchiveChat, onDeleteChat, grip, collapsed, hidden,
}: {
  screen: ScreenKey
  onNavigate: (next: ScreenKey) => void
  onJump: (next: ScreenKey, target: string, anchor?: JumpAnchor) => void
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
  inboxWatches: string[][]
  discoveryCount: number
  discoveryProjects: DiscoveryProjectCount[]
  laterCount: number
  chats: ChatSession[]
  chatId: string | null
  onOpenChat: (id: string) => void
  onNewChat: () => void
  onArchiveChat: (id: string) => void
  onDeleteChat: (id: string) => void
  grip: GripProps
  collapsed: boolean
  hidden: boolean
}) {
  const m = useMessages()
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const toggle = (name: string) => setClosed((c) => ({ ...c, [name]: !c[name] }))

  const topics = watches.filter((w) => w.type === 'topic')
  const authors = watches.filter((w) => w.type === 'author')
  const active = chats.filter((s) => !s.archived)
  const pushed = inboxWatches.length
  const delivered = (group: Watch[]) => inboxWatches.filter((ids) => group.some((w) => ids.includes(w.id))).length
  const deliveredBy = (id: string) => inboxWatches.filter((ids) => ids.includes(id)).length
  const topicPapers = delivered(topics)
  const authorPapers = delivered(authors)
  const onWatch = (id: string) => screen === 'inbox' && inboxMode === 'watch' && inboxScope === id
  const onDiscovery = (id: string) => screen === 'inbox' && inboxMode === 'discovery' && inboxScope === id

  const fold = (name: string) => ({ open: !closed[name], onToggle: () => toggle(name) })

  return (
    <NavPane
      id="sidebar" collapsed={collapsed} hidden={hidden} top={<SearchBox onJump={onJump} />}
      pinned={(
        <>
          <UpdateRow />
          {/* The trash can does not belong to any content group and is pinned outside the scroll area just like demo. */}
          <NavRow
            selected={screen === 'trash'} data-desk="trash" onActivate={() => onNavigate('trash')} count={trashCount}
            icon={(
              <Icon>
                <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
              </Icon>
            )}
          >{m.shell.nav.trash}</NavRow>
        </>
      )}
      grip={<GripTooltip label={m.shell.sidebar.collapse}><Grip {...grip} /></GripTooltip>}
    >
      <NavRow
        selected={screen === 'feed'} id="rowFeed" data-desk="feed" onActivate={() => onNavigate('feed')}
        icon={<Icon><path d="M22 12h-4l-3 8L9 4l-3 8H2" /></Icon>}
      >{m.shell.nav.feed}</NavRow>

      <NavSection id="inbox" title={m.shell.nav.inbox} fold={fold('inbox')}>
        {/* As in the demo, only this row's caret collapses its subgroups; the rest of the row opens the Inbox. */}
        <NavRow
          selected={onWatch(ALL_WATCHES)} id="rowInboxAll" data-inbox={ALL_WATCHES} onActivate={() => onOpenInbox(ALL_WATCHES)}
          fold={{
            label: m.shell.sidebar.toggleGroup(m.shell.nav.delivery), open: !closed['inboxsub'],
            onToggle: () => toggle('inboxsub'), controls: 'g-inboxsub',
          }}
          count={pushed}
          icon={(
            <Icon>
              <path d="M22 13h-5l-2 3h-6l-2-3H2" />
              <path d="M5.4 5.6L2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.4-7.4A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.6z" />
            </Icon>
          )}
        >{m.shell.nav.delivery}</NavRow>
        <div id="g-inboxsub" hidden={closed['inboxsub']}>
          <NavRow
            indent={1} selected={onDiscovery(ALL_WATCHES)} data-inbox="discovery"
            onActivate={() => onOpenInbox(ALL_WATCHES, 'discovery')}
            fold={discoveryProjects.length > 0 ? {
              label: m.shell.sidebar.toggleGroup(m.shell.nav.discovery), open: !closed['discoverysub'],
              onToggle: () => toggle('discoverysub'), controls: 'g-discoverysub',
            } : undefined}
            count={discoveryCount} icon={<IconNorthStar />}
          >{m.shell.nav.discovery}</NavRow>
          <div id="g-discoverysub" hidden={closed['discoverysub']}>
            {discoveryProjects.map((held) => (
              <NavRow
                key={held.id} indent={2} sub selected={onDiscovery(held.id)} icon={<NewDot fresh={held.count > 0} />} count={held.count}
                data-discovery-project={held.id} onActivate={() => onOpenInbox(held.id, 'discovery')}
              >
                <FadeText label={held.name}>{held.name}</FadeText>
              </NavRow>
            ))}
          </div>
          <NavRow
            indent={1} data-disc="topics" fold={{ open: !closed['topics'], onToggle: () => toggle('topics'), controls: 'g-topics' }}
            count={topicPapers}
            icon={(
              <Icon>
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </Icon>
            )}
          >{m.shell.nav.watchTopics}</NavRow>
          <div id="g-topics" hidden={closed['topics']}>
            {topics.map((w) => (
              <WatchRow key={w.id} watch={w} count={deliveredBy(w.id)} on={onWatch(w.id)} onOpen={() => onOpenInbox(w.id)} />
            ))}
          </div>
          <NavRow
            indent={1} data-disc="authors" fold={{ open: !closed['authors'], onToggle: () => toggle('authors'), controls: 'g-authors' }}
            count={authorPapers}
            icon={<Icon><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>}
          >{m.shell.nav.watchAuthors}</NavRow>
          <div id="g-authors" hidden={closed['authors']}>
            {authors.map((w) => (
              <WatchRow key={w.id} watch={w} count={deliveredBy(w.id)} on={onWatch(w.id)} onOpen={() => onOpenInbox(w.id)} />
            ))}
          </div>
        </div>
        <NavRow
          selected={screen === 'later'} id="rowLater" data-desk="later" onActivate={() => onNavigate('later')} count={laterCount}
          icon={<Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>}
        >{m.shell.nav.later}</NavRow>
      </NavSection>

      <NavSection
        id="chats" title={m.shell.nav.chats} fold={fold('chats')}
        action={<AddAction label={m.shell.nav.newChat} size="compact" onClick={(e) => { e.stopPropagation(); onNewChat() }} />}
      >
        <div id="chatList">
          {active.map((s) => (
            <ChatRow
              key={s.id} session={s} on={s.id === chatId} onOpen={() => onOpenChat(s.id)}
              onArchive={() => onArchiveChat(s.id)} onDelete={() => onDeleteChat(s.id)}
            />
          ))}
        </div>
      </NavSection>

      <NavSection id="lib" title={m.shell.nav.myLibrary} fold={fold('lib')}>
        <NavRow
          selected={screen === 'wiki'} data-desk="wiki" onActivate={() => onNavigate('wiki')} count={wikiCount}
          icon={<Icon><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5" /><path d="M2 17l10 5 10-5" /></Icon>}
        >{m.shell.nav.wiki}</NavRow>
        <NavRow
          selected={screen === 'papers'} data-desk="papers" onActivate={() => onNavigate('papers')} count={paperCount}
          icon={(
            <Icon>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </Icon>
          )}
        >{m.shell.nav.papers}</NavRow>
        <NavRow
          selected={screen === 'changelog'} data-desk="changelog" onActivate={() => onNavigate('changelog')} count={changeCount}
          icon={<Icon><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></Icon>}
        >{m.shell.nav.changelog}</NavRow>
      </NavSection>

      <NavSection id="research" title={m.shell.nav.research} fold={fold('research')}>
        <NavRow
          selected={screen === 'overview'} data-desk="restl" onActivate={() => onNavigate('overview')}
          icon={<Icon><path d="M4 6h8" /><path d="M9 12h11" /><path d="M6 18h9" /></Icon>}
        >{m.shell.nav.overview}</NavRow>
        <NavRow
          selected={screen === 'project'} data-desk="resproj" onActivate={() => onNavigate('project')} count={projectCount}
          icon={<Icon><path d="M10 2v7.5L4.7 19a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 9.5V2" /><path d="M8.5 2h7" /><path d="M7 16h10" /></Icon>}
        >{m.shell.nav.projects}</NavRow>
        <NavRow
          selected={screen === 'ideas'} data-desk="ideas" onActivate={() => onNavigate('ideas')} count={ideaCount}
          icon={(
            <Icon>
              <path d="M9 18h6" /><path d="M10 22h4" />
              <path d="M8.2 14.5A7 7 0 1 1 15.8 14.5C14.8 15.2 14.5 16 14.5 17h-5c0-1-.3-1.8-1.3-2.5z" />
            </Icon>
          )}
        >{m.shell.nav.ideas}</NavRow>
      </NavSection>
    </NavPane>
  )
}
