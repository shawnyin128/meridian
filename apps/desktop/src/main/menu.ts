import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'
import type { AppCommand, ZoomCommand } from '../shared/app-commands.js'

/** The roles the application menu lists, each named in the UI language. */
type MenuRole = 'about' | 'services' | 'hide' | 'hideOthers' | 'unhide' | 'quit' | 'close'
  | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'delete' | 'selectAll'
  | 'showSubstitutions' | 'toggleSmartQuotes' | 'toggleSmartDashes' | 'toggleTextReplacement' | 'startSpeaking' | 'stopSpeaking'
  | 'reload' | 'forceReload' | 'toggleDevTools' | 'resetZoom' | 'zoomIn' | 'zoomOut' | 'togglefullscreen'
  | 'minimize' | 'zoom' | 'front'

export type MenuCopy = {
  settings: string; palette: string; tools: string; help: string; agentTutorial: string
  file: string; edit: string; view: string; window: string; substitutions: string; speech: string
  newProject: string; newIdea: string; newChat: string; importPdf: string; find: string
  showSidebar: string; hideSidebar: string
  roles: Record<MenuRole, string>
}

/**
 * What the menu shows of the running App: `packaged` drops Reload and the developer tools,
 * `sidebarHidden` titles Show/Hide Sidebar, and `onCommand` hands the page the command of an item the
 * page carries out.
 */
export type MenuApp = { packaged: boolean; sidebarHidden: boolean; onCommand: (command: AppCommand) => void }

/** The window zoom level after `command`, from `level`: the steps of Electron's own zoom roles. */
export function nextZoomLevel(command: ZoomCommand, level: number): number {
  if (command === 'resetZoom') return 0
  return level + (command === 'zoomIn' ? 0.5 : -0.5)
}

export type EditMenuCopy = { cut: string; copy: string; paste: string; selectAll: string; lookUp: (text: string) => string }

/** The most characters of the selection Look Up names before it ends in an ellipsis. */
const LOOK_UP_CHARS = 50

/**
 * Application menu template, every title and item named by `copy`. `platform` comes from
 * `process.platform`; `onSettings`, `onAgentTutorial` and `onPalette` handle the Settings, tutorial
 * and Command Palette actions. File lists New Project, New Idea, New Chat and Import PDF, Edit ends
 * with Find, and View starts with Show or Hide Sidebar; each hands its command to `app.onCommand`, as
 * do the View menu's zoom items, whose shortcuts are those of Electron's zoom roles. Every other item
 * uses an Electron role, which supplies native copy, paste, developer tools, and related behavior
 * without reimplementing them here; each role menu lists the items Electron's own role menu has on
 * `platform`, in its order, so that they carry names. A packaged App has no Reload or developer tools.
 */
export function menuTemplate(
  platform: NodeJS.Platform,
  onSettings: () => void,
  copy: MenuCopy,
  onAgentTutorial: () => void = () => {},
  onPalette: () => void = () => {},
  app: MenuApp = { packaged: false, sidebarHidden: false, onCommand: () => {} },
): MenuItemConstructorOptions[] {
  const settings: MenuItemConstructorOptions = {
    id: 'settings',
    label: copy.settings,
    accelerator: 'CmdOrCtrl+,',
    click: onSettings,
  }
  const palette: MenuItemConstructorOptions = {
    id: 'palette',
    label: copy.palette,
    accelerator: 'CmdOrCtrl+Shift+P',
    click: onPalette,
  }
  const item = (role: MenuRole): MenuItemConstructorOptions => ({ role, label: copy.roles[role] })
  const command = (id: AppCommand, label: string, accelerator?: string): MenuItemConstructorOptions => ({
    id, label, ...(accelerator === undefined ? {} : { accelerator }), click: () => app.onCommand(id),
  })
  const separator: MenuItemConstructorOptions = { type: 'separator' }
  const mac = platform === 'darwin'
  const creates = [
    command('newProject', copy.newProject), command('newIdea', copy.newIdea), command('newChat', copy.newChat), separator,
    command('importPdf', copy.importPdf), separator,
  ]
  const find = command('find', copy.find, 'CmdOrCtrl+F')
  // macOS places Settings in the application-name menu beside the Apple menu. Electron requires
  // that menu as a complete template, so reproduce the default appMenu roles and insert Settings and
  // the Command Palette after it.
  // Other platforms do not have this menu, so their File menu ends with Quit. On Windows, application
  // preferences conventionally live in Tools, which follows View and precedes Window in the classic
  // menu order.
  return [
    ...(mac
      ? [
        {
          role: 'appMenu',
          submenu: [
            item('about'), separator,
            settings, palette, separator,
            item('services'), separator,
            item('hide'), item('hideOthers'), item('unhide'), separator,
            item('quit'),
          ],
        } satisfies MenuItemConstructorOptions,
        { role: 'fileMenu', label: copy.file, submenu: [...creates, item('close')] } satisfies MenuItemConstructorOptions,
      ]
      : [{
        label: copy.file,
        submenu: [...creates, item('quit')],
      } satisfies MenuItemConstructorOptions]),
    {
      role: 'editMenu',
      label: copy.edit,
      submenu: [
        item('undo'), item('redo'), separator, item('cut'), item('copy'), item('paste'),
        ...(mac
          ? [
            item('pasteAndMatchStyle'), item('delete'), item('selectAll'), separator, find, separator,
            {
              label: copy.substitutions,
              submenu: [
                item('showSubstitutions'), separator,
                item('toggleSmartQuotes'), item('toggleSmartDashes'), item('toggleTextReplacement'),
              ],
            },
            { label: copy.speech, submenu: [item('startSpeaking'), item('stopSpeaking')] },
          ]
          : [item('delete'), separator, item('selectAll'), separator, find]),
      ],
    },
    {
      role: 'viewMenu',
      label: copy.view,
      submenu: [
        command('toggleSidebar', app.sidebarHidden ? copy.showSidebar : copy.hideSidebar, 'CmdOrCtrl+B'), separator,
        ...(app.packaged ? [] : [item('reload'), item('forceReload'), item('toggleDevTools'), separator]),
        command('resetZoom', copy.roles.resetZoom, 'CommandOrControl+0'),
        command('zoomIn', copy.roles.zoomIn, 'CommandOrControl+Plus'),
        // ⌘= is the key under ⌘+ on most layouts, and a hidden item still takes its shortcut.
        { ...command('zoomIn', copy.roles.zoomIn, 'CommandOrControl+='), id: 'zoomIn-equals', visible: false },
        command('zoomOut', copy.roles.zoomOut, 'CommandOrControl+-'), separator, item('togglefullscreen'),
      ],
    },
    ...(mac
      ? []
      : [{ label: copy.tools, submenu: [settings, palette] } satisfies MenuItemConstructorOptions]),
    {
      role: 'windowMenu',
      label: copy.window,
      submenu: [item('minimize'), item('zoom'), ...(mac ? [separator, item('front')] : [item('close')])],
    },
    {
      label: copy.help,
      submenu: [{ id: 'agent-tutorial', label: copy.agentTutorial, click: onAgentTutorial }],
    },
  ]
}

/**
 * The edit menu a secondary click on page text opens, from the click's context-menu `target`; empty
 * when there is none to open. In an editable field it holds the spelling suggestions for a
 * misspelled word under the pointer, then Cut, Copy, Paste and Select All, each dimmed when `target`
 * reports the page cannot perform it; on selected text outside a field it holds Copy. On macOS,
 * Look Up the selection, its whitespace collapsed and cut to 50 characters, comes right before Cut
 * or Copy, and no item shows a shortcut, as in the system's context menus; elsewhere the items keep
 * Electron's default shortcuts.
 * `replaceMisspelling` puts a suggestion in place of the misspelled word; `lookUp` shows the
 * selection in the system dictionary.
 */
export function editMenuTemplate(
  platform: NodeJS.Platform,
  target: Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags' | 'misspelledWord' | 'dictionarySuggestions'>,
  copy: EditMenuCopy,
  actions: { replaceMisspelling: (word: string) => void; lookUp: () => void },
): MenuItemConstructorOptions[] {
  const selection = [...target.selectionText.replace(/\s+/g, ' ').trim()]
  if (!target.isEditable && selection.length === 0) return []
  const groups: MenuItemConstructorOptions[][] = []
  if (target.isEditable && target.misspelledWord !== '') {
    groups.push(target.dictionarySuggestions.map((word) => ({ label: word, click: () => actions.replaceMisspelling(word) })))
  }
  if (platform === 'darwin' && selection.length > 0) {
    const named = selection.length > LOOK_UP_CHARS ? `${selection.slice(0, LOOK_UP_CHARS).join('')}…` : selection.join('')
    groups.push([{ label: copy.lookUp(named), click: actions.lookUp }])
  }
  const can = target.editFlags
  // A role item shows its role's default shortcut unless it is given another; an empty one shows none.
  const shortcut = platform === 'darwin' ? { accelerator: '' } : {}
  groups.push(target.isEditable
    ? [
      { role: 'cut', label: copy.cut, enabled: can.canCut, ...shortcut },
      { role: 'copy', label: copy.copy, enabled: can.canCopy, ...shortcut },
      { role: 'paste', label: copy.paste, enabled: can.canPaste, ...shortcut },
      { role: 'selectAll', label: copy.selectAll, enabled: can.canSelectAll, ...shortcut },
    ]
    : [{ role: 'copy', label: copy.copy, enabled: can.canCopy, ...shortcut }])
  return groups.filter((group) => group.length > 0)
    .flatMap((group, at) => (at === 0 ? group : [{ type: 'separator' } satisfies MenuItemConstructorOptions, ...group]))
}
