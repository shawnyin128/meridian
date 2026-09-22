import type { MenuItemConstructorOptions } from 'electron'

export type MenuCopy = { settings: string; tools: string; help: string; agentTutorial: string }

/**
 * Application menu template. `platform` comes from `process.platform`; `onSettings` handles the
 * Settings action. Every item except Settings uses an Electron role, which supplies native copy,
 * paste, zoom, developer tools, and related behavior without reimplementing them here.
 */
export function menuTemplate(
  platform: NodeJS.Platform,
  onSettings: () => void,
  copy: MenuCopy,
  onAgentTutorial: () => void = () => {},
): MenuItemConstructorOptions[] {
  const settings: MenuItemConstructorOptions = {
    id: 'settings',
    label: copy.settings,
    accelerator: 'CmdOrCtrl+,',
    click: onSettings,
  }
  // macOS places Settings in the application-name menu beside the Apple menu. Electron requires
  // that menu as a complete template, so reproduce the default appMenu roles and insert Settings.
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
            settings, { type: 'separator' },
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
      : [{ label: copy.tools, submenu: [settings] } satisfies MenuItemConstructorOptions]),
    { role: 'windowMenu' },
    {
      label: copy.help,
      submenu: [{ id: 'agent-tutorial', label: copy.agentTutorial, click: onAgentTutorial }],
    },
  ]
}
