import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { AppCommand } from '../../shared/app-commands.js'
import type { ChatSession, Watch } from '../../shared/contract.js'
import { listingsOf } from '../../shared/inbox-streams.js'
import { ACTIVE_PROJECT } from '../../shared/vocabulary.js'
import {
  appMenu, appUpdates, changelog, chat, extensions, idea, inbox, later, papers, project, trash, vault, watch, wiki,
} from '../ipc.js'
import { ActionMenu, MenuItem } from '../components/ActionMenu.js'
import { AboutDialog } from '../components/AboutDialog.js'
import { AppFrame, ScreenSlot } from '../components/AppFrame.js'
import { Breadcrumb, type CrumbSeg } from '../components/Breadcrumb.js'
import { GripEdge, type GripProps } from '../components/Grip.js'
import { IconButton } from '../components/IconButton.js'
import { Notice, type NoticeAction, type NoticeContent, type NoticeTone } from '../components/Notice.js'
import { PageFailure } from '../components/PageShell.js'
import { ScreenBoundary } from '../components/ScreenBoundary.js'
import { AppMark, TitleBar } from '../components/TitleBar.js'
import { Tooltip } from '../components/Tooltip.js'
import { usePruneDrafts } from '../hooks/useDrafts.js'
import { GenerationsContext, useCoreGenerations } from '../hooks/useGenerations.js'
import { ModelStatusContext, useCoreModelStatus } from '../hooks/useModelStatus.js'
import { useOpenerFocus } from '../hooks/useOpenerFocus.js'
import { errorLabel, failureOf } from '../lib/failure-label.js'
import { commandShortcut, composing, pressesCommand, typesText } from '../lib/keyboard.js'
import type { Catalog } from '../messages/catalog.js'
import { useMessages } from '../messages/useMessages.js'
import { CommandPalette, type PaletteCommand } from './CommandPalette.js'
import { SETTINGS_CATEGORIES, SETTINGS_CATEGORY_LABEL, type SettingsCategory } from './settings-categories.js'
import { Sidebar } from './Sidebar.js'
import { JobsContext, useJobsPoll } from './useJobs.js'
import { readShellState, writeShellState } from './shell-state.js'
import { itemsNow, landOnRestored, takeUndoOffers } from './undo-offers.js'
import { ColourThemeFilesContext, useColourThemeFilesPoll } from './useColourThemes.js'
import { Button } from '../components/Button.js'
import './AppShell.css'

export type ScreenKey =
  'feed' | 'inbox' | 'later' | 'papers' | 'wiki' | 'changelog' | 'ideas' | 'overview' | 'project'
  | 'trash' | 'chat' | 'reader'

/** The breadcrumb trail for each screen. `null` means this screen keeps whatever brought it in. */
const crumbsOf = (m: Catalog): Record<ScreenKey, [string, ...string[]] | null> => ({
  feed: [m.shell.crumbs.feed],
  inbox: [m.shell.crumbs.inbox],
  later: [m.shell.crumbs.inbox, m.shell.crumbs.later],
  papers: [m.shell.crumbs.library, m.shell.crumbs.papers],
  wiki: [m.shell.crumbs.library, m.shell.crumbs.wiki],
  changelog: [m.shell.crumbs.library, m.shell.crumbs.changelog],
  ideas: [m.shell.crumbs.research, m.shell.crumbs.ideas],
  overview: [m.shell.crumbs.research, m.shell.crumbs.overview],
  project: [m.shell.crumbs.research, m.shell.crumbs.project],
  trash: [m.shell.crumbs.trash],
  chat: [m.shell.crumbs.chat],
  reader: null,
})

/** The Inbox's default scope: no watch filter, papers from every watch shown together. */
export const ALL_WATCHES = 'all'

/** The Inbox's two streams. Which one is open is shell navigation state, not a page-local filter. */
export type InboxMode = 'watch' | 'discovery'

/** One project's share of the discovery stream, listed under Discovery in the sidebar. */
export type DiscoveryProjectCount = { id: string; name: string; count: number }

/** The sidebar's default width in px, which a double-click on its grip restores. */
const SIDEBAR_WIDTH = 232
/** The paper chat's width in px while it has not been resized, the default of `--rrw` in Reader.css. */
const PAPER_CHAT_WIDTH = 300
/** The width range, in px, that each of the shell's grips keeps its pane within. */
const GRIP_LIMITS = {
  sidebar: { min: 180, max: 320 },
  paperChat: { min: 240, max: 480 },
}

/** A screen's additions to its base breadcrumbs: deeper segments and the last base segment's back action. */
type Deeper = { tail: CrumbSeg[]; onLeafClick: (() => void) | null }

/**
 * A jump from one screen to another: `screen` is the destination, `target` the item to open there
 * (a wiki page id, an item id), `from` the screen the jump started on. `seq` grows with every jump, so
 * the destination can tell whether it was entered by this jump or again from the sidebar. `anchor` is
 * where to land on the destination.
 */
export type JumpAnchor = {
  /** Reader: the page, highlight or note to show, and the side panel to open. */
  page?: number
  highlight?: string
  note?: string
  panel?: 'highlights' | 'notes'
  /** Project: the task to locate in the plan. */
  task?: string
  /** Project: the milestone to locate in the plan. */
  milestone?: string
  /** Project: the conclusion to open in the Conclusions view, by its id. */
  conclusion?: string
  /** Papers: the target is a paper id whose detail view opens, not a title to filter the table by. */
  detail?: true
  /** Papers: open the file chooser of the PDF import. */
  importPdf?: true
  /** Project: show the project list with its new-project row open. */
  newProject?: true
  /** Ideas: open the draft of a new idea of the user's own. */
  newIdea?: true
}
export type ScreenJump = {
  screen: ScreenKey
  target: string
  from: ScreenKey
  seq: number
  anchor?: JumpAnchor
}

const CrumbTailContext = createContext<((tail: CrumbSeg[], onLeafClick: (() => void) | null) => void) | null>(null)
/** Shows a notice of one tone: `text`, and optionally the one action it offers. */
export type Notify = (text: ReactNode, action?: NoticeAction) => void
const NoticeContext = createContext<{ success: Notify; refusal: Notify } | null>(null)
const PaperCountContext = createContext<{ count: number | null } | null>(null)
const ScreenContext = createContext<{ screen: ScreenKey; entry: number; reentry: number } | null>(null)
const InboxScopeContext = createContext<string | null>(null)
const InboxModeContext = createContext<InboxMode | null>(null)
const ChatSessionContext = createContext<{
  id: string | null
  title: string | null
  archived: boolean
  paper: boolean
  select: (id: string) => void
  remove: (id: string) => void
} | null>(null)
const VaultRevisionContext = createContext<{ revision: number; bump: () => void } | null>(null)
/** Exported only so tests can supply a today value to components that call `useToday` without mounting all of AppShell. */
export const TodayContext = createContext<string | null>(null)
const JumpContext = createContext<{
  jump: ScreenJump | null
  open: (screen: ScreenKey, target: string, anchor?: JumpAnchor) => void
  returnTo: (screen: ScreenKey) => void
  enter: (screen: ScreenKey) => void
} | null>(null)
/** The screen these children belong to: every mounted screen keeps running, so each must know its own. */
const SlotContext = createContext<ScreenKey | null>(null)
/**
 * A row a request to open Settings lands on: `id`, the id its category gives it, inside the group
 * `within` names when ids repeat across groups. A new object lands again.
 */
export type SettingsTarget = { id: string; within?: string }

const SettingsContext = createContext<{
  open: boolean
  requestedCategory: SettingsCategory | null
  requestedTarget: SettingsTarget | null
  setOpen: (open: boolean) => void
  openCategory: (category: SettingsCategory, target?: SettingsTarget) => void
} | null>(null)
const PaperChatGripContext = createContext<{ grip: GripProps; collapsed: boolean } | null>(null)

/** The color of the window buttons' symbols in the current theme: `--sec`, the tone of secondary text. */
function symbolColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--sec').trim()
}

/**
 * Hands the shell the current screen's deeper breadcrumb segments, shown after its base segments. An
 * empty array means the screen has no deeper level. `onLeafClick` goes on the last base segment (such
 * as "Papers"): once `tail` pushes that segment out of the last position, it becomes the way back to
 * the screen's top level.
 * Both arguments must keep the same reference while their content is unchanged (useMemo /
 * useCallback); otherwise the shell is set again and again.
 */
export function useCrumbTail(tail: CrumbSeg[], onLeafClick?: () => void): void {
  const set = useContext(CrumbTailContext)
  useEffect(() => { set?.(tail, onLeafClick ?? null) }, [set, tail, onLeafClick])
}

/**
 * Returns the two ways to show the app's one notice: `success` for an action that took effect,
 * `refusal` for one that was refused or failed and wrote nothing. A new notice replaces the shown one.
 * An action marked `undoes` stays on offer after its notice is gone, as does the Undo of every write
 * the change log records whose notice does not offer one (useVaultWrite): ⌘Z outside a text field runs
 * the latest Undo still on offer exactly as a notice's button does, then returns to the screen that was
 * shown when it was offered and lands on the item the undo brings back there, which flashes. Running
 * it either way takes it off offer.
 * The returned object keeps the same reference throughout the lifetime of the shell.
 */
export function useNotice(): { success: Notify; refusal: Notify } {
  const notify = useContext(NoticeContext)
  if (!notify) throw new Error('useNotice needs AppShell')
  return notify
}

/**
 * Returns the number of papers in the vault. The sidebar badge reads it, and so does the Papers screen
 * title while no filter narrows its list. null means it has not been fetched yet.
 */
export function usePaperCount(): number | null {
  const state = useContext(PaperCountContext)
  if (!state) throw new Error('usePaperCount needs AppShell')
  return state.count
}

/**
 * Returns the vault-wide write count and the function that increments it. Call `bump` after a write;
 * every screen and sidebar badge fetches again on a new `revision`. A write on one screen that changes
 * another screen's data (moving to the trash, restoring from it) relies on this. The returned `bump`
 * remains the same reference throughout the lifetime of the shell.
 */
export function useVaultRevision(): { revision: number; bump: () => void } {
  const state = useContext(VaultRevisionContext)
  if (!state) throw new Error('useVaultRevision needs AppShell')
  return state
}

/**
 * Returns the vault's today as an ISO date. Every relative date on screen counts from it; Core gives
 * it, not the local system clock. No screen mounts before it arrives, so this always has a value. It
 * is fetched again after every vault write and only then: a screen left idle past midnight with no
 * write keeps the previous day until the next write.
 */
export function useToday(): string {
  const today = useContext(TodayContext)
  if (today === null) throw new Error('useToday needs AppShell')
  return today
}

/**
 * Returns the cross-screen jump functions and the jump aimed at the caller's screen. `open` records
 * the current screen as the origin, then switches to the destination; every cross-screen link in the
 * UI calls it. `jump` is non-null only when the caller's screen is a jump's destination: every mounted
 * screen keeps running, so none may take another screen's jump for its own. `returnTo` goes back to
 * the origin screen. The third argument of `open` is where to land, such as a page in the reader.
 * `enter` opens a screen at its top level, as a sidebar click does.
 */
export function useJump(): {
  jump: ScreenJump | null
  open: (screen: ScreenKey, target: string, anchor?: JumpAnchor) => void
  returnTo: (screen: ScreenKey) => void
  enter: (screen: ScreenKey) => void
} {
  const state = useContext(JumpContext)
  const slot = useContext(SlotContext)
  if (!state) throw new Error('useJump needs AppShell')
  return {
    jump: state.jump !== null && state.jump.screen === slot ? state.jump : null,
    open: state.open,
    returnTo: state.returnTo,
    enter: state.enter,
  }
}

/**
 * Returns the open state of the Settings modal. `open` becomes true when the user opens Settings from
 * the app menu. `setOpen` goes to Radix: Escape, a click on the overlay, and the modal's links to
 * other places all close it through this. The returned `setOpen` keeps the same reference throughout
 * the lifetime of the shell. `openCategory` opens Settings at `category`, and at the row `target` names
 * there when given, which the category lands on as `requestedTarget`.
 */
export function useSettingsOpen(): {
  open: boolean
  requestedCategory: SettingsCategory | null
  requestedTarget: SettingsTarget | null
  setOpen: (open: boolean) => void
  openCategory: (category: SettingsCategory, target?: SettingsTarget) => void
} {
  const state = useContext(SettingsContext)
  if (!state) throw new Error('useSettingsOpen needs AppShell')
  return state
}

/**
 * Returns the key of the screen currently shown. A screen once entered stays mounted, and a hidden
 * one still receives document-level events; handlers meant only for the current screen use this to
 * step aside.
 */
export function useScreen(): ScreenKey {
  const state = useContext(ScreenContext)
  if (!state) throw new Error('useScreen needs AppShell')
  return state.screen
}

/** Whether the caller's screen is the one shown; a screen once entered stays mounted while hidden. */
export function useScreenShown(): boolean {
  const state = useContext(ScreenContext)
  const slot = useContext(SlotContext)
  if (!state) throw new Error('useScreenShown needs AppShell')
  return state.screen === slot
}

/**
 * Returns the number of sidebar navigations. A screen uses it to decide when an entry takes it back to
 * its top level: only a sidebar click counts as an entry. A cross-screen jump and the return from one
 * leave the number unchanged.
 */
export function useScreenEntry(): number {
  const state = useContext(ScreenContext)
  if (!state) throw new Error('useScreenEntry needs AppShell')
  return state.entry
}

/**
 * Get the number of sidebar clicks on the screen that was already shown. A screen that keeps its
 * state when you leave and come back uses it to return to its top level only on that click.
 */
export function useScreenReentry(): number {
  const state = useContext(ScreenContext)
  if (!state) throw new Error('useScreenReentry needs AppShell')
  return state.reentry
}

/**
 * Returns the Inbox's current scope: `ALL_WATCHES` for the whole stream, otherwise one watch's id
 * (one project's id in Discovery). The sidebar picks it, so like the current screen it is shell
 * navigation state.
 */
export function useInboxScope(): string {
  const scope = useContext(InboxScopeContext)
  if (scope === null) throw new Error('useInboxScope needs AppShell')
  return scope
}

/** Whether the Inbox shows the stream of explicit watches or the Discovery stream derived from projects. */
export function useInboxMode(): InboxMode {
  const mode = useContext(InboxModeContext)
  if (mode === null) throw new Error('useInboxMode needs AppShell')
  return mode
}

/**
 * Returns the chat the Chats screen shows: `id` and `title` are both null when none is selected. The
 * sidebar's chat list picks it, so like the current screen it is shell navigation state; `select`
 * makes another chat the current one. `archived` tells whether the chat is archived: an archived chat
 * is not in the sidebar list and opens only from Settings, so the screen has to show that it is.
 * `paper` tells whether it is a paper's reading chat, which is named after its paper.
 * `remove` deletes a chat into the trash, with Undo in the notice, and when it is the current one
 * leaves for the Feed, as archiving it from the sidebar does.
 */
export function useChatSession(): {
  id: string | null
  title: string | null
  archived: boolean
  paper: boolean
  select: (id: string) => void
  remove: (id: string) => void
} {
  const state = useContext(ChatSessionContext)
  if (!state) throw new Error('useChatSession needs AppShell')
  return state
}

/**
 * Returns the props of the grip on the Reader paper chat's edge, which must be a direct child of the
 * chat: the shell owns the chat's width.
 */
export function usePaperChatGrip(): GripProps {
  const state = useContext(PaperChatGripContext)
  if (!state) throw new Error('usePaperChatGrip needs AppShell')
  return state.grip
}

/**
 * Returns whether the Reader's paper chat is collapsed: it collapses with the sidebar, and a
 * collapsed chat must be inert.
 */
export function usePaperChatCollapsed(): boolean {
  const state = useContext(PaperChatGripContext)
  if (!state) throw new Error('usePaperChatCollapsed needs AppShell')
  return state.collapsed
}

const escapeLayers: { close: () => void }[] = []

/**
 * Focuses the search field of the screen shown, as "/" and Find do: the screen's own field wins over
 * the always-mounted sidebar search, which sits earlier in the DOM and would otherwise match first in a
 * single combined selector. A collapsed sidebar is inert, and its search is no fallback.
 */
function focusSearch(): void {
  const field = document.querySelector<HTMLElement>(
    '.screenslot:not([hidden]) #composer, .screenslot:not([hidden]) #libq',
  ) ?? document.querySelector<HTMLElement>('#sidebar:not([inert]) #sSearch')
  field?.focus()
}

/**
 * Presses the back button of what is in front, as a trackpad swipe and the mouse's back button do:
 * an open dialog's, or else the shown screen's first. With none there, nothing happens.
 */
function pressBack(): void {
  const front = document.querySelector('[role="dialog"]') ?? document.querySelector('.screenslot:not([hidden])')
  front?.querySelector<HTMLButtonElement>('button.back')?.click()
}

/**
 * Register one dismissible layer. Escape peels the most recently registered active layer and stops;
 * Radix surfaces handle their own Escape before this handler sees it. An Escape pressed while an
 * input method is composing peels nothing.
 */
export function useEscapeLayer(active: boolean, close: () => void): void {
  useEffect(() => {
    if (!active) return
    const layer = { close }
    escapeLayers.push(layer)
    return () => { escapeLayers.splice(escapeLayers.indexOf(layer), 1) }
  }, [active, close])
}

/**
 * The app shell: the title bar (sidebar toggle, breadcrumbs) and the sidebar, whose navigation picks
 * the current screen. `screens` gives each screen's content. A screen once entered stays mounted and
 * is only hidden when you leave it, so its paging, sorting, column widths and edits survive.
 * `settings` is the Settings modal's content, opened from the app menu over the current screen. It is
 * not a screen: it has no keep-alive slot and no breadcrumbs, and reads its open state through
 * `useSettingsOpen`.
 */
export function AppShell({ screens, settings }: {
  screens: Record<ScreenKey, ReactNode>
  settings: ReactNode
}) {
  const m = useMessages()
  // The App reopens where it was: the screen, the reader's paper, its sidebar selection and the sidebar.
  const [restored] = useState(() => readShellState({
    sidebarWidth: SIDEBAR_WIDTH, sidebarHidden: false, screen: 'feed', inboxScope: ALL_WATCHES, inboxMode: 'watch',
    chat: null, reader: null,
  }, GRIP_LIMITS.sidebar))
  const reopened: ScreenKey = restored.reader === null ? restored.screen : 'reader'
  const [screen, setScreen] = useState<ScreenKey>(reopened)
  const [entry, setEntry] = useState(0)
  const [reentry, setReentry] = useState(0)
  const [inboxScope, setInboxScope] = useState(restored.inboxScope)
  const [inboxMode, setInboxMode] = useState<InboxMode>(restored.inboxMode)
  const [mounted, setMounted] = useState<ScreenKey[]>([reopened])
  const [tails, setTails] = useState<Partial<Record<ScreenKey, Deeper>>>({})
  const [width, setWidth] = useState(restored.sidebarWidth)
  /** The paper chat's dragged width; null until the first drag, leaving the Reader's CSS default. */
  const [chatWidth, setChatWidth] = useState<number | null>(null)
  const [hidden, setHidden] = useState(restored.sidebarHidden)
  const [paperCount, setPaperCount] = useState<number | null>(null)
  const [projectCount, setProjectCount] = useState<number | null>(null)
  const [trashCount, setTrashCount] = useState(0)
  const [changeCount, setChangeCount] = useState<number | null>(null)
  const [wikiCount, setWikiCount] = useState<number | null>(null)
  const [ideaCount, setIdeaCount] = useState<number | null>(null)
  // A reopened reader is a jump from the screen it was opened from, as when it was opened.
  const [jump, setJump] = useState<ScreenJump | null>(() => (restored.reader === null
    ? null
    : { screen: 'reader', target: restored.reader.paper, from: restored.reader.from, seq: 1 }))
  const [watches, setWatches] = useState<Watch[]>([])
  const [chats, setChats] = useState<ChatSession[]>([])
  const [chatsRead, setChatsRead] = useState(false)
  const [projectIds, setProjectIds] = useState<string[] | null>(null)
  const [ideaIds, setIdeaIds] = useState<string[] | null>(null)
  const [chatId, setChatId] = useState<string | null>(restored.chat)
  const [inboxWatches, setInboxWatches] = useState<string[][]>([])
  const [discoveryCount, setDiscoveryCount] = useState(0)
  const [discoveryProjects, setDiscoveryProjects] = useState<DiscoveryProjectCount[]>([])
  const [laterCount, setLaterCount] = useState(0)
  const [revision, setRevision] = useState(0)
  const [today, setToday] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory | null>(null)
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeContent | null>(null)
  const noticeSeq = useRef(0)
  /** The Undos notices have offered that nothing has run yet, the latest last, with the screen shown when each was offered. */
  const undoOffers = useRef<{ run: () => void; screen: ScreenKey }[]>([])
  const shownScreen = useRef(screen)
  shownScreen.current = screen
  const jumpSeq = useRef(restored.reader === null ? 0 : 1)
  const [appMenuOpen, setAppMenuOpen] = useState(false)
  // With no element noted, Radix returns focus to the logo button.
  const returnAppMenuFocus = useOpenerFocus(appMenuOpen)
  // The dialog a menu item asked for, opened only once the menu has closed and handed focus back.
  const wantDialog = useRef<'settings' | 'palette' | 'about' | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Every sidebar badge counts the whole vault and must be fetched again after each write, so this
  // follows `revision`. The vault's today is fetched here too: a write uses the current day, and a
  // stale day on screen would be one day off.
  useEffect(() => {
    void vault.today().then(setToday).catch((e: unknown) => setBootError(errorLabel(m, e)))
    void papers.list({ page: 1, size: 1 }).then((r) => setPaperCount(r.total))
    void project.list().then((rows) => {
      setProjectCount(rows.filter((p) => p.status === ACTIVE_PROJECT).length)
      setProjectIds(rows.map((p) => p.id))
    })
    void trash.list().then((entries) => setTrashCount(entries.length))
    void changelog.list().then((entries) => setChangeCount(entries.filter((c) => !c.archived).length))
    void wiki.home().then((h) => setWikiCount(h.aggregationCount))
    void watch.list().then(setWatches)
    void chat.list().then((rows) => {
      setChats(rows)
      setChatsRead(true)
    })
    void later.list().then((entries) => setLaterCount(entries.length))
    void inbox.list({ kind: 'watch' }).then((entries) => setInboxWatches(
      entries.map((entry) => listingsOf(entry, 'watch').map((listing) => listing.id)),
    ))
    void Promise.all([inbox.list({ kind: 'discovery' }), project.list()]).then(([entries, projects]) => {
      setDiscoveryCount(entries.length)
      const names = new Map(projects.map((held) => [held.id, held.name]))
      const counts = new Map<string, DiscoveryProjectCount>()
      for (const listing of entries.flatMap((entry) => listingsOf(entry, 'discovery'))) {
        const held = counts.get(listing.id) ?? { id: listing.id, name: names.get(listing.id) ?? listing.source, count: 0 }
        counts.set(listing.id, { ...held, count: held.count + 1 })
      }
      setDiscoveryProjects([...counts.values()])
    })
  }, [revision])

  // A kept draft of a chat, project or idea that is gone is dropped whenever their list is read, one
  // of a paper that is gone once per session, when the kept drafts are read.
  usePruneDrafts(['chat'], chatsRead ? chats.map((session) => session.id) : null)
  usePruneDrafts(['project'], projectIds)
  usePruneDrafts(['idea'], ideaIds)
  usePruneDrafts(['paper'], papers.allIds)

  // Reading ideas also takes in those a coding agent recorded, which is not a write here, so recount on every screen change too.
  useEffect(() => {
    void idea.list().then((rows) => {
      setIdeaCount(rows.filter((item) => !item.archived).length)
      setIdeaIds(rows.map((item) => item.id))
    })
  }, [revision, screen])

  // After a watch is removed, the Inbox must not stay scoped to a watch that no longer exists.
  // Discovery scopes by project instead, so its scope is never a watch id.
  useEffect(() => {
    if (inboxMode === 'watch' && inboxScope !== ALL_WATCHES
      && !watches.some((w) => w.id === inboxScope)) setInboxScope(ALL_WATCHES)
  }, [watches, inboxScope, inboxMode])

  // "Settings" in the app menu: the main process sends a message; the open state stays in the page.
  useEffect(() => appMenu.onOpenSettings(() => setSettingsOpen(true)), [])

  // "Command Palette" in the native menu, whose accelerator is the palette's shortcut.
  useEffect(() => appMenu.onOpenPalette(() => setPaletteOpen(true)), [])

  // Help owns one stable entry into the same Extensions surface that reports installation state.
  useEffect(() => appMenu.onOpenAgentTutorial(() => {
    setSettingsCategory('extensions')
    setSettingsOpen(true)
  }), [])

  // The platform name is for CSS: the room left for the window buttons on either side depends on it.
  useEffect(() => { document.documentElement.dataset.os = appMenu.platform() }, [])
  // While Meridian is not the active app the document is marked, and the current navigation row turns grey.
  useEffect(() => {
    const root = document.documentElement
    const mark = () => {
      if (document.hasFocus()) delete root.dataset.windowInactive
      else root.dataset.windowInactive = ''
    }
    mark()
    window.addEventListener('focus', mark)
    window.addEventListener('blur', mark)
    return () => {
      window.removeEventListener('focus', mark)
      window.removeEventListener('blur', mark)
    }
  }, [])
  useEffect(() => appMenu.onFullScreen((on) => {
    if (on) document.documentElement.dataset.fullscreen = ''
    else delete document.documentElement.dataset.fullscreen
  }), [])

  // The theme is not React state: it is written straight to documentElement's data-theme and
  // data-colour-theme, and the screenshot script and e2e write them the same way. So this watches the
  // attributes, not the buttons, and catches every way the theme can change.
  useEffect(() => {
    appMenu.setTitleBarTheme(symbolColor())
    const observer = new MutationObserver(() => appMenu.setTitleBarTheme(symbolColor()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-colour-theme'] })
    return () => { observer.disconnect() }
  }, [])

  const bump = useCallback(() => setRevision((n) => n + 1), [])
  const notify = useMemo(() => {
    const offered = (action: NoticeAction | undefined): NoticeAction | undefined => {
      if (action?.undoes !== true) return action
      const offer = { run: action.onAction, screen: shownScreen.current }
      undoOffers.current.push(offer)
      return {
        ...action,
        onAction: () => {
          undoOffers.current = undoOffers.current.filter((held) => held !== offer)
          offer.run()
        },
      }
    }
    const of = (tone: NoticeTone): Notify => (text, action) => {
      noticeSeq.current += 1
      setNotice({ id: noticeSeq.current, tone, text, action: offered(action) })
    }
    return { success: of('success'), refusal: of('refusal') }
  }, [])
  const { status: jobsStatus, refresh: refreshJobs } = useJobsPoll(bump)
  const generations = useCoreGenerations(jobsStatus, refreshJobs)
  const modelStatus = useCoreModelStatus(settingsOpen)
  const colourThemeFiles = useColourThemeFilesPoll()
  const paperCountState = useMemo(() => ({ count: paperCount }), [paperCount])
  const screenState = useMemo(() => ({ screen, entry, reentry }), [screen, entry, reentry])
  const vaultRevision = useMemo(() => ({ revision, bump }), [revision, bump])
  const openSettingsCategory = useCallback((category: SettingsCategory, target?: SettingsTarget) => {
    setSettingsCategory(category)
    setSettingsTarget(target ?? null)
    setSettingsOpen(true)
  }, [])
  const settingsState = useMemo(() => ({
    open: settingsOpen,
    requestedCategory: settingsCategory,
    requestedTarget: settingsTarget,
    setOpen: setSettingsOpen,
    openCategory: openSettingsCategory,
  }), [settingsCategory, settingsTarget, settingsOpen, openSettingsCategory])

  // ⌘B on macOS, Ctrl+B elsewhere, toggles the sidebar; Escape peels the topmost dismissible layer;
  // "/" outside an editable element jumps to the nearest search field; the mouse's back button goes back.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (pressesCommand(appMenu.platform(), e, 'B')) {
        e.preventDefault()
        setHidden((h) => !h)
        return
      }
      if (e.key === 'Escape' && !e.defaultPrevented && !composing(e)) {
        const top = escapeLayers.at(-1)
        if (top) { e.preventDefault(); top.close() }
        return
      }
      const target = e.target as HTMLElement
      const editable = target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName)
      if (e.key === '/' && !editable) {
        e.preventDefault()
        focusSearch()
      }
    }
    const mouseBack = (e: MouseEvent) => {
      // The mouse's back button is button 3.
      if (e.button !== 3) return
      e.preventDefault()
      pressBack()
    }
    document.addEventListener('keydown', key)
    document.addEventListener('mouseup', mouseBack)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('mouseup', mouseBack)
    }
  }, [])

  const setTail = useMemo(() => {
    const make = (k: ScreenKey) => (tail: CrumbSeg[], onLeafClick: (() => void) | null) =>
      setTails((prev) => {
        const seen = prev[k]
        return seen?.tail === tail && seen.onLeafClick === onLeafClick
          ? prev
          : { ...prev, [k]: { tail, onLeafClick } }
      })
    return {
      feed: make('feed'), inbox: make('inbox'), later: make('later'),
      papers: make('papers'), wiki: make('wiki'), changelog: make('changelog'),
      ideas: make('ideas'), overview: make('overview'), project: make('project'),
      trash: make('trash'), chat: make('chat'), reader: make('reader'),
    }
  }, [])

  const sidebarGrip: GripProps = {
    id: 'sbgrip', label: m.shell.sidebar.resize, value: width, ...GRIP_LIMITS.sidebar,
    onResize: setWidth, onReset: () => setWidth(SIDEBAR_WIDTH),
  }
  // In the Reader the paper chat takes the sidebar's place and collapses with it.
  const paperChat = useMemo(() => ({
    grip: {
      id: 'rrgrip', label: m.chat.paperChatWidth, value: chatWidth ?? PAPER_CHAT_WIDTH, ...GRIP_LIMITS.paperChat,
      onResize: setChatWidth, onReset: () => setChatWidth(null),
    },
    collapsed: hidden,
  }), [m, chatWidth, hidden])

  const goTo = useCallback((next: ScreenKey) => {
    setScreen(next)
    setMounted((m) => (m.includes(next) ? m : [...m, next]))
  }, [])

  // A write the change log records offers its Undo here too when no notice offers it (useVaultWrite).
  useEffect(() => takeUndoOffers((run) => { undoOffers.current.push({ run, screen: shownScreen.current }) }), [])

  // ⌘Z on macOS, Ctrl+Z elsewhere, outside a text field runs the latest Undo still on offer, goes back
  // to where it was offered and lands on the item it brings back. In a text field it stays the field's own undo.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!pressesCommand(appMenu.platform(), e, 'Z') || e.shiftKey || composing(e) || typesText(e.target)) return
      const offer = undoOffers.current.pop()
      if (offer === undefined) return
      e.preventDefault()
      const before = itemsNow()
      offer.run()
      goTo(offer.screen)
      landOnRestored(before)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [goTo])

  // Every sidebar click is an entry: a screen showing a detail returns to its list, also when it is the current screen.
  const navigate = useCallback((next: ScreenKey) => {
    setEntry((n) => n + 1)
    if (next === screen) setReentry((n) => n + 1)
    goTo(next)
  }, [screen, goTo])

  const openInbox = (scope: string, mode: InboxMode = 'watch') => {
    setInboxScope(scope)
    setInboxMode(mode)
    navigate('inbox')
  }

  const openChat = (id: string) => {
    setChatId(id)
    navigate('chat')
  }

  // The demo's newChat: if an empty chat already exists, switch to it instead of creating another.
  const newChat = () => {
    const empty = chats.find((s) => s.paperId === undefined && !s.archived && s.messageCount === 0)
    if (empty) { openChat(empty.id); return }
    void chat.create(m.chat.newChat, false).then((session) => {
      bump()
      openChat(session.id)
    }).catch((e: unknown) => notify.refusal(errorLabel(m, e)))
  }

  const renameChat = (id: string, title: string) => chat.rename(id, title).then(() => {
    bump()
    return true
  }, (e: unknown) => {
    notify.refusal(errorLabel(m, e))
    return false
  })

  // The demo's archive: archive a chat and, if it is the open one, go to the Feed. Unarchiving happens
  // in Settings and does not come through here.
  const archiveChat = (id: string) => {
    void chat.setArchived(id, true).then(() => {
      bump()
      if (id !== chatId) return
      setChatId(null)
      navigate('feed')
    }).catch((e: unknown) => notify.refusal(errorLabel(m, e)))
  }

  // Deletes a chat into the trash with Undo in the notice and, if it is the open one, goes to the Feed as archiving does.
  const deleteChat = useCallback((id: string) => {
    void chat.delete(id).then(({ trash: entry }) => {
      bump()
      notify.success(m.common.trashed, {
        label: m.common.undo,
        undoes: true,
        onAction: () => {
          void trash.restore(entry).then(() => {
            bump()
          }).catch((e: unknown) => notify.refusal(errorLabel(m, e)))
        },
      })
      if (id !== chatId) return
      setChatId(null)
      navigate('feed')
    }).catch((e: unknown) => notify.refusal(errorLabel(m, e)))
  }, [chatId, navigate, notify, bump, m])

  // A kept chat that is gone by this launch leaves the Chats screen for the Feed, as deleting the open chat does.
  const keptChatChecked = useRef(false)
  useEffect(() => {
    if (!chatsRead || keptChatChecked.current) return
    keptChatChecked.current = true
    if (chatId === null || chats.some((session) => session.id === chatId)) return
    setChatId(null)
    if (screen === 'chat') goTo('feed')
  }, [chatsRead, chats, chatId, screen, goTo])

  // A kept paper that is gone by this launch leaves the reader for the screen it was opened from.
  useEffect(() => {
    const reader = restored.reader
    if (reader === null) return
    void papers.get(reader.paper).catch((e: unknown) => {
      if (failureOf(e) !== 'not-found' || shownScreen.current !== 'reader') return
      setJump(null)
      goTo(reader.from)
    })
  }, [restored, goTo])

  // The reader is kept with its paper and the screen it was opened from, which stands in for it.
  const readerFrom = jump?.screen === 'reader' ? jump.from : 'papers'
  const origin = readerFrom === 'reader' ? 'papers' : readerFrom
  const kept = screen === 'reader' ? origin : screen
  const keptPaper = screen === 'reader' && jump?.screen === 'reader' ? jump.target : null
  useEffect(() => {
    writeShellState({
      sidebarWidth: width, sidebarHidden: hidden, screen: kept, inboxScope, inboxMode, chat: chatId,
      reader: keptPaper === null ? null : { paper: keptPaper, from: origin },
    })
  }, [width, hidden, kept, inboxScope, inboxMode, chatId, keptPaper, origin])

  const chatSession = useMemo(() => {
    const open = chats.find((s) => s.id === chatId)
    return {
      id: chatId,
      title: open?.title ?? null,
      archived: open?.archived ?? false,
      paper: open?.paperId !== undefined,
      select: setChatId,
      remove: deleteChat,
    }
  }, [chatId, chats, deleteChat])

  const jumps = useMemo(() => ({
    jump,
    open: (next: ScreenKey, target: string, anchor?: JumpAnchor) => {
      jumpSeq.current += 1
      setJump({
        screen: next, target, from: screen, seq: jumpSeq.current,
        ...(anchor === undefined ? {} : { anchor }),
      })
      goTo(next)
    },
    returnTo: goTo,
    enter: navigate,
  }), [jump, screen, goTo, navigate])

  const crumbs = useMemo(() => crumbsOf(m), [m])

  // The creates and the import the palette and the File menu both offer, one implementation each.
  const newProject = () => jumps.open('project', '', { newProject: true })
  const importPdf = () => jumps.open('papers', '', { importPdf: true })
  const newIdea = () => jumps.open('ideas', '', { newIdea: true })
  const commands: PaletteCommand[] = [
    { label: m.research.list.create, run: newProject },
    { label: m.papers.upload.importAction, run: importPdf },
    { label: m.ideas.create, run: newIdea },
    { label: m.shell.titlebar.settings, shortcut: commandShortcut(appMenu.platform(), ','), run: () => setSettingsOpen(true) },
    ...SETTINGS_CATEGORIES.map((category) => ({
      label: m.shell.palette.settingsPane(m.settings.categories[SETTINGS_CATEGORY_LABEL[category]]),
      run: () => openSettingsCategory(category),
    })),
    { label: m.shell.nav.feed, run: () => navigate('feed') },
    { label: m.shell.nav.delivery, run: () => openInbox(ALL_WATCHES) },
    { label: m.shell.nav.discovery, run: () => openInbox(ALL_WATCHES, 'discovery') },
    { label: m.shell.nav.later, run: () => navigate('later') },
    { label: m.shell.nav.wiki, run: () => navigate('wiki') },
    { label: m.shell.nav.papers, run: () => navigate('papers') },
    { label: m.shell.nav.changelog, run: () => navigate('changelog') },
    { label: m.shell.nav.overview, run: () => navigate('overview') },
    { label: m.shell.nav.projects, run: () => navigate('project') },
    { label: m.shell.nav.ideas, run: () => navigate('ideas') },
    { label: m.shell.nav.trash, run: () => navigate('trash') },
  ]

  // A command from the application menu or a swipe runs what the shell renders now; the reader takes the zoom commands.
  const onAppCommand = useRef<(command: AppCommand) => void>(() => {})
  onAppCommand.current = (command) => {
    if (command === 'newProject') newProject()
    if (command === 'newIdea') newIdea()
    if (command === 'newChat') newChat()
    if (command === 'importPdf') importPdf()
    if (command === 'find') focusSearch()
    if (command === 'toggleSidebar') setHidden((h) => !h)
    if (command === 'back') pressBack()
  }
  useEffect(() => appMenu.onAppCommand((command) => onAppCommand.current(command)), [])
  useEffect(() => { appMenu.setMenuState({ sidebarHidden: hidden, reading: screen === 'reader' }) }, [hidden, screen])

  // A screen's own breadcrumbs: the last base segment carries its back action, then its deeper ones.
  const partsOf = (k: ScreenKey): CrumbSeg[] => {
    const base = crumbs[k]
    if (base === null) return []
    const leaf = base[base.length - 1]!
    const deeper = tails[k]
    const onLeafClick = deeper?.onLeafClick
    return [
      ...base.slice(0, -1).map((text) => ({ text })),
      onLeafClick ? { text: leaf, onClick: onLeafClick } : { text: leaf },
      ...(deeper?.tail ?? []),
    ]
  }

  // Borrowed segments are copied as plain text, and only the last one links back to the origin screen:
  // the earlier ones are that screen's own back actions, and clicking them here would only change a
  // hidden screen, a dead link.
  const from = crumbs[screen] === null && jump?.screen === screen ? jump.from : null
  const parts: CrumbSeg[] = from === null
    ? partsOf(screen)
    : [
      ...partsOf(from).map((p, i, all) =>
        (i < all.length - 1 ? { text: p.text } : { text: p.text, onClick: () => goTo(from) })),
      ...(tails[screen]?.tail ?? []),
    ]

  return (
    <>
      <TitleBar onZoom={() => appMenu.toggleMaximize()}>
        <IconButton
          label={m.shell.sidebar.toggle} shortcut={commandShortcut(appMenu.platform(), 'B')} size="nested"
          className="tbtn" id="sbBtn" onClick={() => setHidden((h) => !h)}
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M9.5 3v18" />
          </svg>
        </IconButton>
        <ActionMenu
          align="start" sideOffset={6} contentData={{ 'data-appmenu': '' }}
          open={appMenuOpen} onOpenChange={setAppMenuOpen}
          trigger={(
            <IconButton label="Meridian" size="nested" className="appbtn"><AppMark /></IconButton>
          )}
          contentProps={{
              // The menu and the Dialog cannot both manage focus. Mounting the Dialog as soon as
              // "Settings" is selected makes it record the menu item being unmounted as the element
              // to refocus on close; by then that node is gone and focus falls to the body. So the
              // menu only notes which dialog is wanted, and the Dialog mounts in the menu's own close
              // callback, once the menu has handed focus back and the Dialog gets a stable element.
              // setTimeout cannot order this: Radix's FocusScope also schedules a 0 ms macrotask when
              // it unmounts, and which one runs first is not guaranteed.
              onCloseAutoFocus: (e) => {
                returnAppMenuFocus(e)
                const wanted = wantDialog.current
                wantDialog.current = null
                if (wanted === 'settings') setSettingsOpen(true)
                if (wanted === 'palette') setPaletteOpen(true)
                if (wanted === 'about') setAboutOpen(true)
              },
          }}
        >
          <MenuItem onSelect={() => { wantDialog.current = 'settings' }}>
            {m.shell.titlebar.settings}<span className="mi-key">{commandShortcut(appMenu.platform(), ',')}</span>
          </MenuItem>
          <MenuItem onSelect={() => { wantDialog.current = 'palette' }}>
            {m.shell.titlebar.palette}<span className="mi-key">{commandShortcut(appMenu.platform(), 'P', true)}</span>
          </MenuItem>
          <MenuItem onSelect={() => {
            void appUpdates.check()
            void extensions.checkLatest()
            wantDialog.current = 'about'
          }}>
            {m.shell.titlebar.checkUpdates}
          </MenuItem>
          <MenuItem onSelect={appMenu.revealLogs}>{m.shell.titlebar.logs}</MenuItem>
          <MenuItem onSelect={() => { wantDialog.current = 'about' }}>{m.shell.titlebar.about}</MenuItem>
        </ActionMenu>
        <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
        <Breadcrumb id="crumb" trail={parts} />
      </TitleBar>

      <AppFrame
        collapsed={hidden} reading={screen === 'reader'}
        style={{
          ['--sbw']: `${width}px`, ['--rrw']: chatWidth === null ? undefined : `${chatWidth}px`,
        } as CSSProperties}
      >
        <Sidebar
          onOpenStorage={() => openSettingsCategory('storage')}
          screen={screen} onNavigate={navigate} onJump={jumps.open} paperCount={paperCount}
          changeCount={changeCount} projectCount={projectCount} trashCount={trashCount}
          wikiCount={wikiCount} ideaCount={ideaCount}
          inboxScope={inboxScope} inboxMode={inboxMode} onOpenInbox={openInbox} watches={watches}
          inboxWatches={inboxWatches} discoveryCount={discoveryCount} discoveryProjects={discoveryProjects}
          laterCount={laterCount}
          chats={chats} chatId={screen === 'chat' ? chatId : null} onOpenChat={openChat}
          onNewChat={newChat} onRenameChat={renameChat} onArchiveChat={archiveChat} onDeleteChat={deleteChat}
          grip={sidebarGrip} collapsed={hidden} hidden={screen === 'reader'}
        />
        {hidden ? (
          <Tooltip
            label={screen === 'reader' ? m.chat.expandPaperChat : m.shell.sidebar.expand}
            shortcut={commandShortcut(appMenu.platform(), 'B')} side="right"
          >
            <GripEdge
              label={screen === 'reader' ? m.chat.expandPaperChat : m.shell.sidebar.expand}
              onExpand={() => setHidden(false)}
            />
          </Tooltip>
        ) : null}
        <NoticeContext.Provider value={notify}>
          <JobsContext.Provider value={jobsStatus}>
            <GenerationsContext.Provider value={generations}>
            <ModelStatusContext.Provider value={modelStatus}>
            <PaperCountContext.Provider value={paperCountState}>
              <VaultRevisionContext.Provider value={vaultRevision}>
                <ScreenContext.Provider value={screenState}>
                  <InboxScopeContext.Provider value={inboxScope}>
                    <InboxModeContext.Provider value={inboxMode}>
                    <ChatSessionContext.Provider value={chatSession}>
                    <PaperChatGripContext.Provider value={paperChat}>
                      <JumpContext.Provider value={jumps}>
                        {/*
                         * Every screen counts relative dates from the vault's today, so no screen mounts
                         * before it arrives. If it cannot be fetched, not one screen mounts, and the
                         * error can only show at this level.
                         */}
                        <TodayContext.Provider value={today}>
                          <SettingsContext.Provider value={settingsState}>
                            {bootError === null ? null : (
                              <PageFailure
                                className="bootfail" title={m.shell.bootFailure.title}
                                error={bootError}
                                action={(
                                  <Button size="regular" onClick={() => openSettingsCategory('storage')}>
                                    {m.shell.bootFailure.changeLibrary}
                                  </Button>
                                )}
                              />
                            )}
                            {today === null ? null : mounted.map((k) => (
                              <CrumbTailContext.Provider value={setTail[k]} key={k}>
                                <SlotContext.Provider value={k}>
                                  <ScreenSlot shown={k === screen}>
                                    <ScreenBoundary>{screens[k]}</ScreenBoundary>
                                  </ScreenSlot>
                                </SlotContext.Provider>
                              </CrumbTailContext.Provider>
                            ))}
                            {/* The modal covers the current screen and does not occupy the keep-alive slot: it has no view state to keep. */}
                            <ColourThemeFilesContext.Provider value={colourThemeFiles}>{settings}</ColourThemeFilesContext.Provider>
                          </SettingsContext.Provider>
                        </TodayContext.Provider>
                      </JumpContext.Provider>
                    </PaperChatGripContext.Provider>
                    </ChatSessionContext.Provider>
                    </InboxModeContext.Provider>
                  </InboxScopeContext.Provider>
                </ScreenContext.Provider>
              </VaultRevisionContext.Provider>
            </PaperCountContext.Provider>
            </ModelStatusContext.Provider>
            </GenerationsContext.Provider>
          </JobsContext.Provider>
        </NoticeContext.Provider>
        <Notice notice={notice} />
      </AppFrame>

    </>
  )
}
