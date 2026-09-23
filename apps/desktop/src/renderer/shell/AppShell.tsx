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
import { JobsContext, useJobsPoll } from './useJobs.js'
import brandmark from '../../../resources/mark-64.png'
import './AppShell.css'

export type ScreenKey =
  'feed' | 'inbox' | 'later' | 'papers' | 'wiki' | 'changelog' | 'ideas' | 'overview' | 'project'
  | 'trash' | 'chat' | 'reader'

/** A section of bread crumbs. Those with onClick and not at the last position are clickable return entries, corresponding to the `.cseg.link` of the demo. */
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

/** The new conversation's placeholder before the title is set is the same as demo's makeSession('new conversation', false). */
// TODO(i18n-t17): stays Chinese until Task 17 moves this into messages/{zh,en}/chat.ts
// alongside Chat.tsx, which this task must not touch (owned by the parallel worktree).

/** The default level of the paper push screen is: do not filter and follow, push all papers together for viewing. */
export const ALL_WATCHES = 'all'

/** Two independent information streams for paper push. The entrance belongs to the shell navigation and is not held by the temporary filtering status in the page. */
export type InboxMode = 'watch' | 'discovery'

/** One project's share of the discovery stream, listed under Discovery in the sidebar. */
export type DiscoveryProjectCount = { id: string; name: string; count: number }

const SB_MIN = 180
const SB_MAX = 320
/** Demo's showGtip: The capsule comes out after hovering over the handle for 350ms. */
const GRIPTIP_DELAY = 350

/** A screen hangs below the basic breadcrumbs: deeper levels, and final fallback actions. */
type Deeper = { tail: CrumbSeg[]; onLeafClick: (() => void) | null }

/**
 * A cross-screen jump: `screen` is the screen you want to go to, `target` is the recognized landing point on that screen (wiki page id,
 * item id), `from` is the screen that initiates the jump, `seq` is incremented every time it jumps - the target screen relies on it to identify this screen entry
 * Was it jumped in, or re-entered from the sidebar. `anchor` is where to land on the target screen.
 */
export type JumpAnchor = {
  /** Reader: the page, highlight or note to show, and the side panel to open. */
  page?: number
  highlight?: string
  note?: string
  panel?: 'highlights' | 'notes'
  /** Project: the task to locate in the plan. */
  task?: string
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
/** Which screen does the current children belong to? The hanging screens are all running, and things across the screens must recognize their own grid. */
const SlotContext = createContext<ScreenKey | null>(null)
export type SettingsCategory = 'appearance' | 'storage' | 'api' | 'model' | 'research' | 'extensions' | 'delivery' | 'delivery-watch' | 'delivery-discovery' | 'archived'
const SettingsContext = createContext<{
  open: boolean
  requestedCategory: SettingsCategory | null
  setOpen: (open: boolean) => void
  openCategory: (category: SettingsCategory) => void
} | null>(null)

/** The symbol color that should be used for the window button under the current theme is `--sec`: the three symbols and the secondary text are in the same file. */
function symbolColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--sec').trim()
}

/** The demo's banner() and toast() have the same shape: the latter one covers the previous one, and exits automatically after `ms` milliseconds. */
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
 * Hang the deeper level of the current screen under the basic breadcrumbs to the shell. An empty array means that this screen does not have a deeper level.
 * `onLeafClick` is attached to the last paragraph of the basic breadcrumb (such as "paper"), so that it will be pushed off the last position by `tail`
 * It becomes the entrance back to the shallowest level of this screen.
 * Both parameters must maintain the same reference (using useMemo / useCallback) when the content does not change, otherwise the shell
 * will be reset repeatedly.
 */
export function useCrumbTail(tail: CrumbSeg[], onLeafClick?: () => void): void {
  const set = useContext(CrumbTailContext)
  useEffect(() => { set?.(tail, onLeafClick ?? null) }, [set, tail, onLeafClick])
}

/**
 * The confirmation banner function after fetching and writing operations corresponds to demo's banner(): the latter one covers the previous one and exits automatically after 1.6 seconds.
 * The returned function retains the same reference throughout the lifetime of the shell.
 */
export function useBanner(): (text: string) => void {
  const show = useContext(BannerContext)
  if (!show) throw new Error('useBanner needs AppShell')
  return show
}

/**
 * Get the prompt function of the rejected action, which corresponds to the toast() of the demo: the last one overwrites the previous one, and it will exit automatically after 2.4 seconds.
 * The returned function retains the same reference throughout the lifetime of the shell.
 */
export function useToast(): (text: string) => void {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast needs AppShell')
  return show
}

/**
 * Round up the number of articles in the database. The sidebar corner markers and the paper screen title read the same number. null means it has not been retrieved yet.
 */
export function usePaperCount(): number | null {
  const state = useContext(PaperCountContext)
  if (!state) throw new Error('usePaperCount needs AppShell')
  return state.count
}

/**
 * The rounding library's write count and its increment function. After writing a call `bump`, each screen and sidebar corner mark will be clicked.
 * New `revision` retrieval: when data on one screen is changed to another screen (delete to trash, restore from trash)
 * That's what it depends on. The returned `bump` remains the same reference throughout the lifetime of the shell.
 */
export function useVaultRevision(): { revision: number; bump: () => void } {
  const state = useContext(VaultRevisionContext)
  if (!state) throw new Error('useVaultRevision needs AppShell')
  return state
}

/**
 * Get today's ISO date in the library. Every relative date on the screen is calculated from it, which is given by core, not the local system date.
 * You won't be stuck on a single screen until you get it, so you'll always get value here. Refetch it after each library write, and only then:
 * A screen of dry waiting passed midnight without any writing during that time, and what is given here remains the same as that day, until the next time it is written.
 */
export function useToday(): string {
  const today = useContext(TodayContext)
  if (today === null) throw new Error('useToday needs AppShell')
  return today
}

/**
 * Get the entrance to the cross-screen jump and the jump to the caller's screen. `open` records the current screen as the origin and then switches to it
 * The target screen is called in every cross-screen entry on the interface; `jump` is only used when the screen where it is taken is the target of a certain jump.
 * Not empty - the hanging screens are all running, and the jumps of other screens cannot be mistaken for your own; `returnTo` returns to the original screen. `open`
 * The third parameter is the landing point when entering the reader.
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
 * Get the opening and closing settings of the modal. `open` becomes true when the user requests to open settings in the application menu; `setOpen` is handed over to Radix,
 * Esc, point masks, and modal entrances to other places are all closed via it. The returned `setOpen` is used throughout the lifetime of the shell.
 * Keep the same reference.
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
 * Get the key of which screen is currently displayed. The screens that have been entered are always hung, and those that are hidden still receive document-level events.
 * Processors that should only be active on the current screen use it to get themselves out of the way.
 */
export function useScreen(): ScreenKey {
  const state = useContext(ScreenContext)
  if (!state) throw new Error('useScreen needs AppShell')
  return state.screen
}

/**
 * Get the number of times the sidebar is cut. The screen uses it to decide whether to return to the lowest level when "re-entering": only the sidebar cuts to another screen.
 * It counts as re-entering. Cross-screen jumps and returns after jumps are not counted, so the number remains unchanged in those two situations.
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
 * Get the current file of the paper push screen: `ALL_WATCHES` means all push, otherwise it is the id of a certain follower.
 * Which file to select is determined by the sidebar, so it belongs to the navigation state of the shell just like the current screen.
 */
export function useInboxScope(): string {
  const scope = useContext(InboxScopeContext)
  if (scope === null) throw new Error('useInboxScope needs AppShell')
  return scope
}

/** The current paper push entry is an explicit attention stream or a discovery stream generated by project. */
export function useInboxMode(): InboxMode {
  const mode = useContext(InboxModeContext)
  if (mode === null) throw new Error('useInboxMode needs AppShell')
  return mode
}

/**
 * Get which conversation the conversation screen is currently viewing: `id` and `title` are both null when no one is selected. Which one to choose
 * Determined by the conversation list in the sidebar, it belongs to the navigation state of the shell as well as the current screen; `select` makes the conversation screen
 * Cut the new one into the current one. `archived` indicates whether this item is in the archive - the archived conversation is not in the sidebar
 * In one column, it can only be opened from the settings, and it must be visible on the screen.
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
 * Application shell: top bar (sidebar switch, breadcrumbs) and study sidebar. The current screen is determined by the sidebar navigation.
 * `screens` gives the contents of each screen. The screen you entered is always hanging, and when you cut it out it is just hidden, paging, sorting, column width,
 * The editing status is still there.
 * `settings` is the content of the settings modal, covering the current screen and opened by the application menu; it is not a screen and has no keep-alive
 * Breadcrumbs are not entered in the slot, and the opening and closing are obtained through `useSettingsOpen`.
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
  const drag = useRef<{ x0: number; w0: number; moved: boolean } | null>(null)
  const griptipTimer = useRef(0)
  const jumpSeq = useRef(0)
  /** Where the focus is before opening the application menu. Returned here when the menu is closed; returned to Radix when empty, it is returned to the Mark button. */
  const appMenuOpener = useRef<HTMLElement | null>(null)
  /** Is it because I selected "Settings..." when I closed the menu this time? To set the modal, wait until the menu is closed before hanging up. See the note below. */
  // The dialog a menu item asked for, opened only once the menu has closed and handed focus back.
  const wantDialog = useRef<'settings' | 'about' | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

  // Each subscript in the side column reads the number of the entire database, and it must be retrieved every time after writing, so follow the revision. Curry’s today is also
  // Retake it here: The library uses the current day when writing, and the old day on the screen will be one day different.
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

  // After a follower is removed, the paper push screen cannot stop on a follower that no longer exists.
  // Discovery scopes by project instead, so its scope is never a watch id.
  useEffect(() => {
    if (inboxMode === 'watch' && inboxScope !== ALL_WATCHES
      && !watches.some((w) => w.id === inboxScope)) setInboxScope(ALL_WATCHES)
  }, [watches, inboxScope, inboxMode])

  // "Settings..." in the menu: The main process conveys a message, and the opening and closing still returns to the page.
  useEffect(() => appMenu.onOpenSettings(() => setSettingsOpen(true)), [])

  // Help owns one stable entry into the same Extensions surface that reports installation state.
  useEffect(() => appMenu.onOpenAgentTutorial(() => {
    setSettingsCategory('extensions')
    setSettingsOpen(true)
  }), [])

  // The platform name is used for CSS: How much space should be left for the window buttons on both sides is divided according to the platform.
  useEffect(() => { document.documentElement.dataset.os = appMenu.platform() }, [])

  // The theme does not go into the React state, but directly writes the documentElement's data-theme. The screenshot script and e2e are also written in the same way.
  // So focus on properties instead of buttons: every way to change the theme can be caught here.
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

  // The handle of the demo can be used with both hands: when the displacement exceeds 3px, it is dragging, and when there is no displacement, when the hand is raised, it is "click to collapse".
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.x0
      if (!d.moved && Math.abs(dx) > 3) d.moved = true
      if (d.moved) setWidth(Math.max(SB_MIN, Math.min(SB_MAX, d.w0 + dx)))
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      if (!d.moved) setHidden((h) => !h)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
  }, [])

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

  const gripEnter = (e: ReactMouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    window.clearTimeout(griptipTimer.current)
    griptipTimer.current = window.setTimeout(() => setGriptip({
      top: Math.max(8, Math.min(window.innerHeight - 64, r.top + r.height / 2 - 20)),
      left: r.right + 10,
    }), GRIPTIP_DELAY)
  }

  const gripDown = (e: ReactMouseEvent) => {
    drag.current = { x0: e.clientX, w0: width, moved: false }
    hideGriptip()
    e.preventDefault()
  }

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

  // Demo's newChat: If there is already a conversation that has not been spoken yet, just cut it and not open another one.
  const newChat = () => {
    const empty = chats.find((s) => s.paperId === undefined && !s.archived && s.messageCount === 0)
    if (empty) { openChat(empty.id); return }
    void chat.create(m.chat.newChat, false).then((session) => {
      bump()
      openChat(session.id)
    }).catch((e: Error) => showToast(e.message))
  }

  // Demo archiving: put the currently open item into the archive and return it to the status. Cancel archiving in the settings screen, do not go here
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

  // A screen of your own breadcrumbs: the last paragraph of the basic level brings the rollback action of this screen, and then connects to the deeper paragraphs of this screen
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

  // The borrowed paragraphs are copied into text, and only the last paragraphs are connected back to the screen where they came from: the paragraphs further forward are on the screen where they came from.
  // It is the rollback action of that screen itself. Clicking here will only change an invisible screen and become a dead link.
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
            // The body does not count as "where the focus was just now": in that case it is returned to Radix, which will return the marker button itself
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
              // Two floating layers cannot control focus at the same time. If you hang up Dialog on the spot when selecting "Settings...", it will record "Return after closing".
              // "To whom" will fall on the menu item being unloaded. When it is returned, the node is gone and the focus falls back to the body. so
              // The menu only writes down "I will open the settings later", and the actual hanging Dialog is placed in the menu's own closing callback - at that time the menu
              // The focus has been returned, and Dialog has obtained a stable element. You cannot use setTimeout to arrange this:
              // When Radix's FocusScope is uninstalled, it also schedules a macro task of 0 milliseconds. There is no guarantee who will come first.
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
            // The demo only connects .cseg.link to the processor: you cannot click the callback at the end, it is the current position.
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
        style={{ ['--sbw']: `${width}px` } as CSSProperties}
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
          grip={{ onMouseDown: gripDown, onMouseEnter: gripEnter, onMouseLeave: hideGriptip }}
        />
        <BannerContext.Provider value={showBanner}>
          <JobsContext.Provider value={jobsStatus}>
          <ToastContext.Provider value={showToast}>
            <PaperCountContext.Provider value={paperCountState}>
              <VaultRevisionContext.Provider value={vaultRevision}>
                <ScreenContext.Provider value={screenState}>
                  <InboxScopeContext.Provider value={inboxScope}>
                    <InboxModeContext.Provider value={inboxMode}>
                    <ChatSessionContext.Provider value={chatSession}>
                      <JumpContext.Provider value={jumps}>
                        {/*
                         * Each screen is calculated as a relative date based on today's date in the library, and the screen will not hang until it is retrieved; it cannot be retrieved.
                         * I can't hang up even one screen, and the error can only appear on this layer.
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

      {/* The banner of the demo: the element is permanent, and the text remains and fades out when exiting. */}
      <div className={banner.show ? 'banner show' : 'banner'} id="banner">
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span>{banner.text}</span>
      </div>

      {/* The demo's toast: a prompt for rejected actions, the same element as the banner is permanent */}
      <div className={toast.show ? 'toast show' : 'toast'} id="toast">{toast.text}</div>

      {/* The griptip of the demo: the capsule after hovering the handle, stops outside the viewport when it does not appear. */}
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
