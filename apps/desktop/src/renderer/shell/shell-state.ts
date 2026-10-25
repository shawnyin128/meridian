import type { InboxMode, ScreenKey } from './AppShell.js'

/** The paper the reader showed, and the screen it was opened from, which its back button returns to. */
export type KeptReader = { paper: string; from: Exclude<ScreenKey, 'reader'> }

/**
 * Where the shell was when the App last ran, kept on this device: the sidebar's width and whether it
 * was hidden, the screen shown, the Inbox's scope and stream, the chat the Chats screen showed, and
 * the reader's paper while the reader was shown, when `screen` is the screen it was opened from.
 */
export type ShellState = {
  sidebarWidth: number
  sidebarHidden: boolean
  screen: Exclude<ScreenKey, 'reader'>
  inboxScope: string
  inboxMode: InboxMode
  chat: string | null
  reader: KeptReader | null
}

export const SHELL_STATE_STORAGE_KEY = 'meridian.shell'

const SCREENS: readonly ShellState['screen'][] = [
  'feed', 'inbox', 'later', 'papers', 'wiki', 'changelog', 'ideas', 'overview', 'project', 'trash', 'chat',
]

/**
 * The kept shell state, each part checked on its own: a part that is missing or not of its kind, or a
 * width outside `widths`, falls back to its value in `fallback`. Nothing kept, or nothing readable,
 * gives `fallback` whole.
 */
export function readShellState(fallback: ShellState, widths: { min: number; max: number }): ShellState {
  let value: unknown
  try {
    value = JSON.parse(window.localStorage.getItem(SHELL_STATE_STORAGE_KEY) ?? 'null')
  } catch {
    return fallback
  }
  if (typeof value !== 'object' || value === null) return fallback
  const kept = value as Record<string, unknown>
  const width = kept['sidebarWidth']
  const hidden = kept['sidebarHidden']
  const screen = kept['screen']
  const scope = kept['inboxScope']
  const mode = kept['inboxMode']
  const chat = kept['chat']
  return {
    sidebarWidth: typeof width === 'number' && width >= widths.min && width <= widths.max ? width : fallback.sidebarWidth,
    sidebarHidden: typeof hidden === 'boolean' ? hidden : fallback.sidebarHidden,
    screen: SCREENS.find((key) => key === screen) ?? fallback.screen,
    inboxScope: typeof scope === 'string' ? scope : fallback.inboxScope,
    inboxMode: mode === 'watch' || mode === 'discovery' ? mode : fallback.inboxMode,
    chat: typeof chat === 'string' ? chat : fallback.chat,
    reader: readerOf(kept['reader']) ?? fallback.reader,
  }
}

/** The kept reader in `value`, or undefined when it is not one: a paper id and a screen the reader opens from. */
function readerOf(value: unknown): KeptReader | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { paper, from } = value as Record<string, unknown>
  const screen = SCREENS.find((key) => key === from)
  return typeof paper === 'string' && screen !== undefined ? { paper, from: screen } : undefined
}

/** Keeps `state` for the next launch. A blocked storage backend keeps nothing. */
export function writeShellState(state: ShellState): void {
  try {
    window.localStorage.setItem(SHELL_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // As in language.ts, a blocked storage backend must not stop the session.
  }
}
