import type { InboxMode, ScreenKey } from './AppShell.js'

/**
 * Where the shell was when the App last ran, kept on this device: the sidebar's width, the screen
 * shown, the Inbox's scope and stream, and the chat the Chats screen showed. The reader is kept as
 * the screen it was opened from.
 */
export type ShellState = {
  sidebarWidth: number
  screen: Exclude<ScreenKey, 'reader'>
  inboxScope: string
  inboxMode: InboxMode
  chat: string | null
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
  const screen = kept['screen']
  const scope = kept['inboxScope']
  const mode = kept['inboxMode']
  const chat = kept['chat']
  return {
    sidebarWidth: typeof width === 'number' && width >= widths.min && width <= widths.max ? width : fallback.sidebarWidth,
    screen: SCREENS.find((key) => key === screen) ?? fallback.screen,
    inboxScope: typeof scope === 'string' ? scope : fallback.inboxScope,
    inboxMode: mode === 'watch' || mode === 'discovery' ? mode : fallback.inboxMode,
    chat: typeof chat === 'string' ? chat : fallback.chat,
  }
}

/** Keeps `state` for the next launch. A blocked storage backend keeps nothing. */
export function writeShellState(state: ShellState): void {
  try {
    window.localStorage.setItem(SHELL_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // As in language.ts, a blocked storage backend must not stop the session.
  }
}
