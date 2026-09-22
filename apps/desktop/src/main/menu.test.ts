import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { menuTemplate } from './menu.js'
import { MAIN_COPY } from './messages.js'

/** Flatten every menu level in a template into one list. */
const flatten = (items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
  items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ])

const settingsOf = (platform: NodeJS.Platform, onSettings = () => {}) =>
  flatten(menuTemplate(platform, onSettings, MAIN_COPY.zh.menu)).find((item) => item.id === 'settings')

describe('menuTemplate', () => {
  it('macOS 把「设置…」放进应用名菜单,Windows 与 Linux 放进工具菜单', () => {
    const submenuOf = (platform: NodeJS.Platform) => menuTemplate(platform, () => {}, MAIN_COPY.zh.menu)
      .find((item) => Array.isArray(item.submenu)
        && item.submenu.some((sub) => sub.id === 'settings'))

    expect(submenuOf('darwin')?.role).toBe('appMenu')
    expect(submenuOf('win32')?.label).toBe('工具')
    expect(submenuOf('linux')?.label).toBe('工具')
  })

  it('三个平台的「设置…」是同一项:同一个标签、同一个快捷键、同一个动作', () => {
    const clicked = vi.fn()
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const settings = settingsOf(platform, clicked)
      expect(settings?.label).toBe('设置…')
      expect(settings?.accelerator).toBe('CmdOrCtrl+,')
      settings?.click?.(null as never, undefined, null as never)
    }
    expect(clicked).toHaveBeenCalledTimes(3)
  })

  it('英文菜单使用自然的 Settings 和 Tools 标签', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const settings = flatten(menuTemplate(platform, () => {}, MAIN_COPY.en.menu))
        .find((item) => item.id === 'settings')
      expect(settings?.label).toBe('Settings…')
    }
    expect(menuTemplate('win32', () => {}, MAIN_COPY.en.menu)[3]?.label).toBe('Tools')
  })

  it('编辑、视图、窗口三个菜单在每个平台都保留 Electron 的角色', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const roles = menuTemplate(platform, () => {}, MAIN_COPY.zh.menu).map((item) => item.role)
      // On Windows and Linux, the role-less Tools menu sits between View and Window. Filter out
      // undefined values so this assertion compares only the relative order of the three role menus.
      expect(roles.filter((role) => role !== undefined).slice(-3))
        .toEqual(['editMenu', 'viewMenu', 'windowMenu'])
    }
  })

  it('Windows 与 Linux 上「工具」菜单排在视图之后、窗口之前,只装「设置…」一项', () => {
    for (const platform of ['win32', 'linux'] as const) {
      const template = menuTemplate(platform, () => {}, MAIN_COPY.zh.menu)
      expect(template.map((item) => item.label ?? item.role))
        .toEqual(['File', 'editMenu', 'viewMenu', '工具', 'windowMenu', 'Help'])

      const tools = template[3]
      expect(Array.isArray(tools?.submenu) ? tools.submenu.map((i) => i.id) : [])
        .toEqual(['settings'])
    }
  })

  it('三个平台都在 Help 下提供同一个 Skill 与 MCP 教程入口', () => {
    const openTutorial = vi.fn()
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const tutorial = flatten(menuTemplate(
        platform, () => {}, MAIN_COPY.en.menu, openTutorial,
      )).find((item) => item.id === 'agent-tutorial')
      expect(tutorial?.label).toBe('Using Skills and MCP…')
      tutorial?.click?.(null as never, undefined, null as never)
    }
    expect(openTutorial).toHaveBeenCalledTimes(3)
  })

  it('macOS 的应用名菜单保留 appMenu 角色默认的每一项,退出仍在文件菜单', () => {
    const template = menuTemplate('darwin', () => {}, MAIN_COPY.zh.menu)
    const appMenu = template[0]
    expect(appMenu?.role).toBe('appMenu')
    expect(Array.isArray(appMenu?.submenu) ? appMenu.submenu.map((i) => i.role) : [])
      .toEqual([
        'about', undefined, undefined, undefined, 'services', undefined,
        'hide', 'hideOthers', 'unhide', undefined, 'quit',
      ])
    expect(template[1]?.role).toBe('fileMenu')
  })

  it('Windows 与 Linux 的文件菜单里只剩退出,仍是 Electron 的角色', () => {
    const file = menuTemplate('win32', () => {}, MAIN_COPY.zh.menu)[0]
    expect(Array.isArray(file?.submenu) ? file.submenu.map((i) => i.role) : [])
      .toEqual(['quit'])
  })
})
