/**
 * The commands Main hands to the page, which owns what each one does: the File menu's creates and
 * import, Edit › Find, View › Show/Hide Sidebar, the View menu's zoom items while the reader is
 * shown, and `back`, which a trackpad swipe sends.
 */
export const APP_COMMANDS = [
  'newProject', 'newIdea', 'newChat', 'importPdf', 'find', 'toggleSidebar', 'zoomIn', 'zoomOut', 'resetZoom', 'back',
] as const

export type AppCommand = typeof APP_COMMANDS[number]

/** The View menu's zoom commands: the reader takes them while it is shown, the window's zoom otherwise. */
export type ZoomCommand = Extract<AppCommand, 'zoomIn' | 'zoomOut' | 'resetZoom'>

/**
 * What the page tells Main for the menu: whether the sidebar is hidden, which titles Show/Hide
 * Sidebar, and whether the reader is the screen shown, which takes the zoom items.
 */
export type MenuState = { sidebarHidden: boolean; reading: boolean }
