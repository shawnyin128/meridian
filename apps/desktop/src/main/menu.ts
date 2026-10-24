import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

export type MenuCopy = { settings: string; palette: string; tools: string; help: string; agentTutorial: string }

export type EditMenuCopy = { cut: string; copy: string; paste: string; selectAll: string; lookUp: (text: string) => string }

/** The most characters of the selection Look Up names before it ends in an ellipsis. */
const LOOK_UP_CHARS = 50

/**
 * Application menu template. `platform` comes from `process.platform`; `onSettings`, `onAgentTutorial`
 * and `onPalette` handle the Settings, tutorial and Command Palette actions. Every other item uses an
 * Electron role, which supplies native copy, paste, zoom, developer tools, and related behavior
 * without reimplementing them here.
 */
export function menuTemplate(
  platform: NodeJS.Platform,
  onSettings: () => void,
  copy: MenuCopy,
  onAgentTutorial: () => void = () => {},
  onPalette: () => void = () => {},
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
  // macOS places Settings in the application-name menu beside the Apple menu. Electron requires
  // that menu as a complete template, so reproduce the default appMenu roles and insert Settings and
  // the Command Palette after it.
  // Other platforms do not have this menu. Because Meridian has no document New/Open/Save model,
  // File only needs Quit. On Windows, application preferences conventionally live in Tools, which
  // follows View and precedes Window in the classic menu order.
  return [
    ...(platform === 'darwin'
      ? [
        {
          role: 'appMenu',
          submenu: [
            { role: 'about' }, { type: 'separator' },
            settings, palette, { type: 'separator' },
            { role: 'services' }, { type: 'separator' },
            { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
            { role: 'quit' },
          ],
        } satisfies MenuItemConstructorOptions,
        { role: 'fileMenu' } satisfies MenuItemConstructorOptions,
      ]
      : [{
        label: 'File',
        submenu: [{ role: 'quit' }],
      } satisfies MenuItemConstructorOptions]),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    ...(platform === 'darwin'
      ? []
      : [{ label: copy.tools, submenu: [settings, palette] } satisfies MenuItemConstructorOptions]),
    { role: 'windowMenu' },
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
 * or Copy.
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
  groups.push(target.isEditable
    ? [
      { role: 'cut', label: copy.cut, enabled: can.canCut },
      { role: 'copy', label: copy.copy, enabled: can.canCopy },
      { role: 'paste', label: copy.paste, enabled: can.canPaste },
      { role: 'selectAll', label: copy.selectAll, enabled: can.canSelectAll },
    ]
    : [{ role: 'copy', label: copy.copy, enabled: can.canCopy }])
  return groups.filter((group) => group.length > 0)
    .flatMap((group, at) => (at === 0 ? group : [{ type: 'separator' } satisfies MenuItemConstructorOptions, ...group]))
}
