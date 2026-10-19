import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { ChatSession, Watch } from '../../shared/contract.js'
import { ACTIVE_PROJECT } from '../../shared/vocabulary.js'
import {
  appMenu, appUpdates, changelog, chat, extensions, idea, inbox, later, papers, project, trash, vault, watch, wiki,
} from '../ipc.js'
import { ActionMenu, MenuItem } from '../components/ActionMenu.js'
import { AboutDialog } from '../components/AboutDialog.js'
import { PageFailure } from '../components/PageShell.js'
import { ScreenBoundary } from '../components/ScreenBoundary.js'
import type { Catalog } from '../messages/catalog.js'
import { useMessages } from '../messages/useMessages.js'
import { Sidebar } from './Sidebar.js'
import { GRIP_WIDTHS, useGrip } from './useGrip.js'
import { JobsContext, useJobsPoll } from './useJobs.js'
import brandmark from '../../../resources/mark-64.png'
import './AppShell.css'

export type ScreenKey =
  'feed' | 'inbox' | 'later' | 'papers' | 'wiki' | 'changelog' | 'ideas' | 'overview' | 'project'
  | 'trash' | 'chat' | 'reader'

/** A breadcrumb segment. One with `onClick` that is not last is a link back, the demo's `.cseg.link`. */
export type CrumbSeg = { text: string; onClick?: () => void }

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

/** The demo's showGtip: the handle's tooltip appears after the pointer rests on it this many ms. */
const GRIPTIP_DELAY = 350

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
  /** Project: the conclusion to open in the Conclusions view, by its id. */
  conclusion?: string
}
export type ScreenJump = {
  screen: ScreenKey
  target: string
  from: ScreenKey
  seq: number
  anchor?: JumpAnchor
}

const CrumbTailContext = createContext<((tail: CrumbSeg[], onLeafClick: (() => void) | null) => void) | null>(null)
const BannerContext = createContext<((text: string) => void) | null>(null)
const ToastContext = createContext<((text: string) => void) | null>(null)
const PaperCountContext = createContext<{ count: number | null } | null>(null)
const ScreenContext = createContext<{ screen: ScreenKey; entry: number; reentry: number } | null>(null)
const InboxScopeContext = createContext<string | null>(null)
const InboxModeContext = createContext<InboxMode | null>(null)
const ChatSessionContext = createContext<{
  id: string | null
  title: string | null
  archived: boolean
  select: (id: string) => void
} | null>(null)
const VaultRevisionContext = createContext<{ revision: number; bump: () => void } | null>(null)
/** Exported only so tests can supply a today value to components that call `useToday` without mounting all of AppShell. */
export const TodayContext = createContext<string | null>(null)
const JumpContext = createContext<{
  jump: ScreenJump | null
  open: (screen: ScreenKey, target: string, anchor?: JumpAnchor) => void
  returnTo: (screen: ScreenKey) => void
} | null>(null)
/** The screen these children belong to: every mounted screen keeps running, so each must know its own. */
const SlotContext = createContext<ScreenKey | null>(null)
export type SettingsCategory = 'appearance' | 'storage' | 'api' | 'model' | 'research' | 'extensions' | 'delivery' | 'delivery-watch' | 'delivery-discovery' | 'archived'
const SettingsContext = createContext<{
  open: boolean
  requestedCategory: SettingsCategory | null
  setOpen: (open: boolean) => void
  openCategory: (category: SettingsCategory) => void
} | null>(null)
/** The mouse handlers of a resize grip: dragging, click-to-collapse and the hover tooltip are the shell's. */
type GripHandlers = {
  onMouseDown: (e: ReactMouseEvent) => void
  onMouseEnter: (e: ReactMouseEvent) => void
  onMouseLeave: () => void
}
const PaperChatGripContext = createContext<GripHandlers | null>(null)

/** The color of the window buttons' symbols in the current theme: `--sec`, the tone of secondary text. */
function symbolColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--sec').trim()
}

/** The demo's banner() and toast(): a new message replaces the shown one, which hides after `ms` ms. */
function useFading(ms: number): [{ text: string; show: boolean }, (text: string) => void] {
  const [state, setState] = useState({ text: '', show: false })
  const timer = useRef(0)
  const show = useCallback((text: string) => {
    setState({ text, show: true })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState((s) => ({ ...s, show: false })), ms)
  }, [ms])
  return [state, show]
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
 * Returns the function that shows the confirmation banner after a write, the demo's banner(): a new
 * message replaces the shown one, which hides after 1.6 seconds.
 * The returned function retains the same reference throughout the lifetime of the shell.
 */
export function useBanner(): (text: string) => void {
  const show = useContext(BannerContext)
  if (!show) throw new Error('useBanner needs AppShell')
  return show
}

/**
 * Returns the function that tells the user an action was rejected, the demo's toast(): a new message
 * replaces the shown one, which hides after 2.4 seconds.
 * The returned function retains the same reference throughout the lifetime of the shell.
 */
export function useToast(): (text: string) => void {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast needs AppShell')
  return show
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
 */
export function useJump(): {
  jump: ScreenJump | null
  open: (screen: ScreenKey, target: string, anchor?: JumpAnchor) => void
  returnTo: (screen: ScreenKey) => void
} {
  const state = useContext(JumpContext)
  const slot = useContext(SlotContext)
  if (!state) throw new Error('useJump needs AppShell')
  return {
    jump: state.jump !== null && state.jump.screen === slot ? state.jump : null,
    open: state.open,
    returnTo: state.returnTo,
  }
}

/**
 * Returns the open state of the Settings modal. `open` becomes true when the user opens Settings from
 * the app menu. `setOpen` goes to Radix: Escape, a click on the overlay, and the modal's links to
 * other places all close it through this. The returned `setOpen` keeps the same reference throughout
 * the lifetime of the shell.
 */
export function useSettingsOpen(): {
  open: boolean
  requestedCategory: SettingsCategory | null
  setOpen: (open: boolean) => void
  openCategory: (category: SettingsCategory) => void
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
 */
export function useChatSession(): {
  id: string | null
  title: string | null
  archived: boolean
  select: (id: string) => void
} {
  const state = useContext(ChatSessionContext)
  if (!state) throw new Error('useChatSession needs AppShell')
  return state
}

/**
 * Returns the handlers for the grip on the Reader paper chat's edge, which must be a direct child of
 * the chat: dragging it resizes the chat, a click collapses it, and hovering it shows the tooltip.
 * The returned object keeps its reference throughout the lifetime of the shell.
 */
export function usePaperChatGrip(): GripHandlers {
  const grip = useContext(PaperChatGripContext)
  if (!grip) throw new Error('usePaperChatGrip needs AppShell')
  return grip
}

const escapeLayers: { close: () => void }[] = []

/**
 * Register one dismissible layer. Escape peels the most recently registered active layer and stops;
 * Radix surfaces handle their own Escape before this handler sees it.
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
  const [screen, setScreen] = useState<ScreenKey>('feed')
  const [entry, setEntry] = useState(0)
  const [reentry, setReentry] = useState(0)
  const [inboxScope, setInboxScope] = useState(ALL_WATCHES)
  const [inboxMode, setInboxMode] = useState<InboxMode>('watch')
  const [mounted, setMounted] = useState<ScreenKey[]>(['feed'])
  const [tails, setTails] = useState<Partial<Record<ScreenKey, Deeper>>>({})
  const [width, setWidth] = useState(232)
  /** The paper chat's dragged width; null until the first drag, leaving the Reader's CSS default. */
  const [chatWidth, setChatWidth] = useState<number | null>(null)
  const [hidden, setHidden] = useState(false)
  const [paperCount, setPaperCount] = useState<number | null>(null)
  const [projectCount, setProjectCount] = useState<number | null>(null)
  const [trashCount, setTrashCount] = useState(0)
  const [changeCount, setChangeCount] = useState<number | null>(null)
  const [wikiCount, setWikiCount] = useState<number | null>(null)
  const [ideaCount, setIdeaCount] = useState<number | null>(null)
  const [jump, setJump] = useState<ScreenJump | null>(null)
  const [watches, setWatches] = useState<Watch[]>([])
  const [chats, setChats] = useState<ChatSession[]>([])
  const [chatId, setChatId] = useState<string | null>(null)
  const [inboxCounts, setInboxCounts] = useState<Record<string, number>>({})
  const [discoveryCount, setDiscoveryCount] = useState(0)
  const [discoveryProjects, setDiscoveryProjects] = useState<DiscoveryProjectCount[]>([])
  const [laterCount, setLaterCount] = useState(0)
  const [revision, setRevision] = useState(0)
  const [today, setToday] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [banner, showBanner] = useFading(1600)
  const [toast, showToast] = useFading(2400)
  const [griptip, setGriptip] = useState<{ top: number; left: number } | null>(null)
  const griptipTimer = useRef(0)
  const jumpSeq = useRef(0)
  /** Focus before the app menu opened, restored on close; when null, Radix returns focus to the logo button. */
  const appMenuOpener = useRef<HTMLElement | null>(null)
  // The dialog a menu item asked for, opened only once the menu has closed and handed focus back.
  const wantDialog = useRef<'settings' | 'about' | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

  // Every sidebar badge counts the whole vault and must be fetched again after each write, so this
  // follows `revision`. The vault's today is fetched here too: a write uses the current day, and a
  // stale day on screen would be one day off.
  useEffect(() => {
    void vault.today().then(setToday).catch((e: Error) => setBootError(e.message))
    void papers.list({ page: 1, size: 1 }).then((r) => setPaperCount(r.total))
    void project.list().then((rows) =>
      setProjectCount(rows.filter((p) => p.status === ACTIVE_PROJECT).length))
    void trash.list().then((entries) => setTrashCount(entries.length))
    void changelog.list().then((entries) => setChangeCount(entries.filter((c) => !c.archived).length))
    void wiki.home().then((h) => setWikiCount(h.aggregationCount))
    void watch.list().then(setWatches)
    void chat.list().then(setChats)
    void later.list().then((entries) => setLaterCount(entries.length))
    void inbox.list({ kind: 'watch' }).then((entries) => setInboxCounts(entries.reduce<Record<string, number>>(
      (counts, e) => ({ ...counts, [e.watch]: (counts[e.watch] ?? 0) + 1 }), {})))
    void Promise.all([inbox.list({ kind: 'discovery' }), project.list()]).then(([entries, projects]) => {
      setDiscoveryCount(entries.length)
      const names = new Map(projects.map((held) => [held.id, held.name]))
      const counts = new Map<string, DiscoveryProjectCount>()
      for (const entry of entries) {
        const held = counts.get(entry.project) ?? { id: entry.project, name: names.get(entry.project) ?? entry.source, count: 0 }
        counts.set(entry.project, { ...held, count: held.count + 1 })
      }
      setDiscoveryProjects([...counts.values()])
    })
  }, [revision])

  // Reading ideas also takes in those a coding agent recorded, which is not a write here, so recount on every screen change too.
  useEffect(() => {
    void idea.list().then((rows) => setIdeaCount(rows.filter((item) => !item.archived).length))
  }, [revision, screen])

  // After a watch is removed, the Inbox must not stay scoped to a watch that no longer exists.
  // Discovery scopes by project instead, so its scope is never a watch id.
  useEffect(() => {
    if (inboxMode === 'watch' && inboxScope !== ALL_WATCHES
      && !watches.some((w) => w.id === inboxScope)) setInboxScope(ALL_WATCHES)
  }, [watches, inboxScope, inboxMode])

  // "Settings…" in the app menu: the main process sends a message; the open state stays in the page.
  useEffect(() => appMenu.onOpenSettings(() => setSettingsOpen(true)), [])

  // Help owns one stable entry into the same Extensions surface that reports installation state.
  useEffect(() => appMenu.onOpenAgentTutorial(() => {
    setSettingsCategory('extensions')
    setSettingsOpen(true)
  }), [])

  // The platform name is for CSS: the room left for the window buttons on either side depends on it.
  useEffect(() => { document.documentElement.dataset.os = appMenu.platform() }, [])

  // The theme is not React state: it is written straight to documentElement's data-theme, and the
  // screenshot script and e2e write it the same way. So this watches the attribute, not the buttons,
  // and catches every way the theme can change.
  useEffect(() => {
    appMenu.setTitleBarTheme(symbolColor())
    const observer = new MutationObserver(() => appMenu.setTitleBarTheme(symbolColor()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { observer.disconnect() }
  }, [])

  const bump = useCallback(() => setRevision((n) => n + 1), [])
  const jobsStatus = useJobsPoll(bump)
  const paperCountState = useMemo(() => ({ count: paperCount }), [paperCount])
  const screenState = useMemo(() => ({ screen, entry, reentry }), [screen, entry, reentry])
  const vaultRevision = useMemo(() => ({ revision, bump }), [revision, bump])
  const openSettingsCategory = useCallback((category: SettingsCategory) => {
    setSettingsCategory(category)
    setSettingsOpen(true)
  }, [])
  const settingsState = useMemo(() => ({
    open: settingsOpen,
    requestedCategory: settingsCategory,
    setOpen: setSettingsOpen,
    openCategory: openSettingsCategory,
  }), [settingsCategory, settingsOpen, openSettingsCategory])

  // Both grips toggle `hidden`: in the Reader the paper chat takes the sidebar's place and collapses with it.
  const toggleHidden = useCallback(() => setHidden((h) => !h), [])
  const dragSidebar = useGrip(GRIP_WIDTHS.sidebar, setWidth, toggleHidden)
  const dragPaperChat = useGrip(GRIP_WIDTHS.paperChat, setChatWidth, toggleHidden)

  // Ctrl+B / Cmd+B toggles the sidebar; Escape peels the topmost dismissible layer; "/" jumps to the nearest search field.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        setHidden((h) => !h)
        return
      }
      if (e.key === 'Escape' && !e.defaultPrevented) {
        const top = escapeLayers.at(-1)
        if (top) { e.preventDefault(); top.close() }
        return
      }
      if (e.key === '/' && !/^(input|textarea)$/i.test((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        // The active screen's own field wins over the always-mounted sidebar search, which sits
        // earlier in the DOM and would otherwise match first in a single combined selector.
        const field = document.querySelector<HTMLElement>(
          '.screenslot:not([hidden]) #composer, .screenslot:not([hidden]) #libq',
        ) ?? document.querySelector<HTMLElement>('#sSearch')
        field?.focus()
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
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

  const hideGriptip = useCallback(() => {
    window.clearTimeout(griptipTimer.current)
    setGriptip(null)
  }, [])

  const gripEnter = useCallback((e: ReactMouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    window.clearTimeout(griptipTimer.current)
    griptipTimer.current = window.setTimeout(() => setGriptip({
      top: Math.max(8, Math.min(window.innerHeight - 64, r.top + r.height / 2 - 20)),
      left: r.right + 10,
    }), GRIPTIP_DELAY)
  }, [])

  const gripOf = useCallback((startDrag: (e: ReactMouseEvent) => void): GripHandlers => ({
    onMouseDown: (e) => { startDrag(e); hideGriptip() },
    onMouseEnter: gripEnter,
    onMouseLeave: hideGriptip,
  }), [gripEnter, hideGriptip])
  const paperChatGrip = useMemo(() => gripOf(dragPaperChat), [gripOf, dragPaperChat])

  const goTo = useCallback((next: ScreenKey) => {
    setScreen(next)
    setMounted((m) => (m.includes(next) ? m : [...m, next]))
  }, [])

  // Every sidebar click is an entry: a screen showing a detail returns to its list, also when it is the current screen.
  const navigate = (next: ScreenKey) => {
    setEntry((n) => n + 1)
    if (next === screen) setReentry((n) => n + 1)
    goTo(next)
  }

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
    }).catch((e: Error) => showToast(e.message))
  }

  // The demo's archive: archive a chat and, if it is the open one, go to the Feed. Unarchiving happens
  // in Settings and does not come through here.
  const archiveChat = (id: string) => {
    void chat.setArchived(id, true).then(() => {
      bump()
      if (id !== chatId) return
      setChatId(null)
      navigate('feed')
    }).catch((e: Error) => showToast(e.message))
  }

  const chatSession = useMemo(() => {
    const open = chats.find((s) => s.id === chatId)
    return {
      id: chatId,
      title: open?.title ?? null,
      archived: open?.archived ?? false,
      select: setChatId,
    }
  }, [chatId, chats])

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
  }), [jump, screen, goTo])

  const crumbs = useMemo(() => crumbsOf(m), [m])

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
      <div
        className="titlebar"
        onDoubleClick={(event: ReactMouseEvent<HTMLDivElement>) => {
          const target = event.target
          if (!(target instanceof Element)) return
          if (target.closest('button,a,input,select,textarea,[contenteditable="true"],.cseg.link')) return
          appMenu.toggleMaximize()
        }}
      >
        <button className="tbtn" id="sbBtn" title={m.shell.sidebar.toggle} onClick={() => setHidden((h) => !h)}>
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M9.5 3v18" />
          </svg>
        </button>
        <ActionMenu
          align="start" sideOffset={6} contentData={{ 'data-appmenu': '' }}
          onOpenChange={(open) => {
            if (!open) return
            // The body does not count as where focus was: Radix then returns focus to the logo button.
            const active = document.activeElement
            appMenuOpener.current = active instanceof HTMLElement && active !== document.body
              ? active
              : null
          }}
          trigger={(
            <button className="appbtn" title="Meridian">
            <img className="brandmark" src={brandmark} alt="Meridian" />
            </button>
          )}
          contentProps={{
              // The menu and the Dialog cannot both manage focus. Mounting the Dialog as soon as
              // "Settings…" is selected makes it record the menu item being unmounted as the element
              // to refocus on close; by then that node is gone and focus falls to the body. So the
              // menu only notes which dialog is wanted, and the Dialog mounts in the menu's own close
              // callback, once the menu has handed focus back and the Dialog gets a stable element.
              // setTimeout cannot order this: Radix's FocusScope also schedules a 0 ms macrotask when
              // it unmounts, and which one runs first is not guaranteed.
              onCloseAutoFocus: (e) => {
                if (appMenuOpener.current) {
                  e.preventDefault()
                  appMenuOpener.current.focus()
                }
                const wanted = wantDialog.current
                wantDialog.current = null
                if (wanted === 'settings') setSettingsOpen(true)
                if (wanted === 'about') setAboutOpen(true)
              },
          }}
        >
          <MenuItem onSelect={() => { wantDialog.current = 'settings' }}>
            {m.shell.titlebar.settings}<span className="mi-key">{appMenu.platform() === 'darwin' ? '⌘,' : 'Ctrl+,'}</span>
          </MenuItem>
          <MenuItem onSelect={() => {
            void appUpdates.check()
            void extensions.checkLatest()
            wantDialog.current = 'about'
          }}>
            {m.shell.titlebar.checkUpdates}
          </MenuItem>
          <MenuItem onSelect={() => { wantDialog.current = 'about' }}>{m.shell.titlebar.about}</MenuItem>
        </ActionMenu>
        <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
        <div className="crumb" id="crumb">
          {parts.map((p, i) => {
            // As in the demo, only .cseg.link gets a handler: the last segment is the current position.
            const link = p.onClick !== undefined && i < parts.length - 1
            return (
              <Fragment key={`${i}${p.text}`}>
                {i > 0 ? <span className="csep">›</span> : null}
                <span className={link ? 'cseg link' : 'cseg'} onClick={link ? p.onClick : undefined}>
                  {p.text}
                </span>
              </Fragment>
            )
          })}
        </div>
      </div>

      <div
        className={`main${hidden ? ' sbhide' : ''}${screen === 'reader' ? ' reading' : ''}`} id="main"
        style={{
          ['--sbw']: `${width}px`, ['--rrw']: chatWidth === null ? undefined : `${chatWidth}px`,
        } as CSSProperties}
      >
        <Sidebar
          screen={screen} onNavigate={navigate} onJump={jumps.open} paperCount={paperCount}
          changeCount={changeCount} projectCount={projectCount} trashCount={trashCount}
          wikiCount={wikiCount} ideaCount={ideaCount}
          inboxScope={inboxScope} inboxMode={inboxMode} onOpenInbox={openInbox} watches={watches}
          inboxCounts={inboxCounts} discoveryCount={discoveryCount} discoveryProjects={discoveryProjects}
          laterCount={laterCount}
          chats={chats} chatId={screen === 'chat' ? chatId : null} onOpenChat={openChat}
          onNewChat={newChat} onArchiveChat={archiveChat}
          grip={gripOf(dragSidebar)}
        />
        {screen === 'reader' && hidden ? (
          <button className="paper-chat-edge" title={m.chat.expandPaperChat} onClick={() => setHidden(false)} />
        ) : null}
        <BannerContext.Provider value={showBanner}>
          <JobsContext.Provider value={jobsStatus}>
          <ToastContext.Provider value={showToast}>
            <PaperCountContext.Provider value={paperCountState}>
              <VaultRevisionContext.Provider value={vaultRevision}>
                <ScreenContext.Provider value={screenState}>
                  <InboxScopeContext.Provider value={inboxScope}>
                    <InboxModeContext.Provider value={inboxMode}>
                    <ChatSessionContext.Provider value={chatSession}>
                    <PaperChatGripContext.Provider value={paperChatGrip}>
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
                                error={bootError} note={m.shell.bootFailure.note}
                                action={(
                                  <button className="btn" onClick={() => setSettingsOpen(true)}>
                                    {m.shell.bootFailure.openSettings}
                                  </button>
                                )}
                              />
                            )}
                            {today === null ? null : mounted.map((k) => (
                              <CrumbTailContext.Provider value={setTail[k]} key={k}>
                                <SlotContext.Provider value={k}>
                                  <div className="screenslot" hidden={k !== screen}>
                                    <ScreenBoundary>{screens[k]}</ScreenBoundary>
                                  </div>
                                </SlotContext.Provider>
                              </CrumbTailContext.Provider>
                            ))}
                            {/* The modal covers the current screen and does not occupy the keep-alive slot: it has no view state to keep. */}
                            {settings}
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
          </ToastContext.Provider>
          </JobsContext.Provider>
        </BannerContext.Provider>
      </div>

      {/* The demo's banner: the element is always present, and its text stays while it fades out. */}
      <div className={banner.show ? 'banner show' : 'banner'} id="banner">
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span>{banner.text}</span>
      </div>

      {/* The demo's toast: says an action was rejected; like the banner, the element is always present. */}
      <div className={toast.show ? 'toast show' : 'toast'} id="toast">{toast.text}</div>

      {/* The demo's griptip: the tooltip shown after hovering the handle, parked off screen while hidden. */}
      <div
        className={griptip ? 'griptip show' : 'griptip'} id="griptip"
        style={{ top: griptip?.top ?? 0, left: griptip?.left ?? -9999 }}
      >
        <div className="t1">{m.shell.sidebar.collapseHint}<span className="k">Ctrl+B</span></div>
        <div className="t2">{m.shell.sidebar.dragHint}</div>
      </div>
    </>
  )
}
