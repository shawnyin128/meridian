import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import type { AppCommand } from '../shared/app-commands.js'
import { editMenuTemplate, menuTemplate, nextZoomLevel, type MenuApp, type MenuCopy } from './menu.js'
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
  it('macOS 把「设置」放进应用名菜单,Windows 与 Linux 放进工具菜单', () => {
    const submenuOf = (platform: NodeJS.Platform) => menuTemplate(platform, () => {}, MAIN_COPY.zh.menu)
      .find((item) => Array.isArray(item.submenu)
        && item.submenu.some((sub) => sub.id === 'settings'))

    expect(submenuOf('darwin')?.role).toBe('appMenu')
    expect(submenuOf('win32')?.label).toBe('工具')
    expect(submenuOf('linux')?.label).toBe('工具')
  })

  it('三个平台的「设置」是同一项:同一个标签、同一个快捷键、同一个动作', () => {
    const clicked = vi.fn()
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const settings = settingsOf(platform, clicked)
      expect(settings?.label).toBe('设置')
      expect(settings?.accelerator).toBe('CmdOrCtrl+,')
      settings?.click?.(null as never, undefined, null as never)
    }
    expect(clicked).toHaveBeenCalledTimes(3)
  })

  it('三个平台都在「设置」之后列出「命令面板」:同一个标签、同一个 CmdOrCtrl+Shift+P、同一个动作', () => {
    const opened = vi.fn()
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const menu = menuTemplate(platform, () => {}, MAIN_COPY.zh.menu, () => {}, opened)
        .find((item) => Array.isArray(item.submenu) && item.submenu.some((sub) => sub.id === 'settings'))!
      const ids = (menu.submenu as MenuItemConstructorOptions[]).map((item) => item.id)
      expect(ids[ids.indexOf('settings') + 1]).toBe('palette')
      // Electron reads CmdOrCtrl as ⌘ on macOS and Ctrl elsewhere: ⇧⌘P and Ctrl+Shift+P.
      const palette = flatten([menu]).find((item) => item.id === 'palette')
      expect(palette?.label).toBe('命令面板')
      expect(palette?.accelerator).toBe('CmdOrCtrl+Shift+P')
      palette?.click?.(null as never, undefined, null as never)
    }
    expect(opened).toHaveBeenCalledTimes(3)
    expect(flatten(menuTemplate('darwin', () => {}, MAIN_COPY.en.menu)).find((item) => item.id === 'palette')?.label)
      .toBe('Command Palette')
  })

  it('英文菜单使用自然的 Settings 和 Tools 标签', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const settings = flatten(menuTemplate(platform, () => {}, MAIN_COPY.en.menu))
        .find((item) => item.id === 'settings')
      expect(settings?.label).toBe('Settings')
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

  it('Windows 与 Linux 上「工具」菜单排在视图之后、窗口之前,只装「设置」与「命令面板」两项', () => {
    for (const platform of ['win32', 'linux'] as const) {
      const template = menuTemplate(platform, () => {}, MAIN_COPY.zh.menu)
      expect(template.map((item) => item.label ?? item.role))
        .toEqual(['文件', '编辑', '视图', '工具', '窗口', '帮助'])

      const tools = template[3]
      expect(Array.isArray(tools?.submenu) ? tools.submenu.map((i) => i.id) : [])
        .toEqual(['settings', 'palette'])
    }
  })

  it('中文菜单每一层的每一项都有中文名，只留 Meridian、Skill、MCP 与 PDF 这几个专名', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const english = flatten(menuTemplate(platform, () => {}, MAIN_COPY.zh.menu))
        // macOS titles the application menu with the app's name whatever its label.
        .filter((item) => item.type !== 'separator' && item.role !== 'appMenu')
        .map((item) => item.label ?? `(${item.role ?? item.id} 没有名字)`)
        .filter((label) => /[A-Za-z]/.test(label.replace(/Meridian|Skill|MCP|PDF/g, '')))
      expect([platform, english]).toEqual([platform, []])
    }
  })

  it('每个角色菜单按 Electron 默认的条目和顺序列出，各平台不同处照旧', () => {
    /** Each item's role, '—' for a separator, and a nested list for a submenu without a role. */
    const shape = (items: MenuItemConstructorOptions[]): unknown[] => items.map((item) => (item.type === 'separator'
      ? '—'
      : Array.isArray(item.submenu) ? { [item.role ?? item.label!]: shape(item.submenu) } : item.role ?? item.id))
    const zh = MAIN_COPY.zh.menu
    const roles = (platform: NodeJS.Platform) => shape(menuTemplate(platform, () => {}, zh))
    const view = { viewMenu: [
      'toggleSidebar', '—', 'reload', 'forceReload', 'toggleDevTools', '—',
      'resetZoom', 'zoomIn', 'zoomIn-equals', 'zoomOut', '—', 'togglefullscreen',
    ] }
    const help = { [zh.help]: ['agent-tutorial'] }
    const creates = ['newProject', 'newIdea', 'newChat', '—', 'importPdf', '—']
    expect(roles('darwin')).toEqual([
      { appMenu: ['about', '—', 'settings', 'palette', '—', 'services', '—', 'hide', 'hideOthers', 'unhide', '—', 'quit'] },
      { fileMenu: [...creates, 'close'] },
      { editMenu: [
        'undo', 'redo', '—', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'delete', 'selectAll', '—', 'find', '—',
        { [zh.substitutions]: ['showSubstitutions', '—', 'toggleSmartQuotes', 'toggleSmartDashes', 'toggleTextReplacement'] },
        { [zh.speech]: ['startSpeaking', 'stopSpeaking'] },
      ] },
      view,
      { windowMenu: ['minimize', 'zoom', '—', 'front'] },
      help,
    ])
    for (const platform of ['win32', 'linux'] as const) {
      expect(roles(platform)).toEqual([
        { [zh.file]: [...creates, 'quit'] },
        { editMenu: ['undo', 'redo', '—', 'cut', 'copy', 'paste', 'delete', '—', 'selectAll', '—', 'find'] },
        view,
        { [zh.tools]: ['settings', 'palette'] },
        { windowMenu: ['minimize', 'zoom', 'close'] },
        help,
      ])
    }
  })

  it('英文菜单用 Electron 默认的名字，应用菜单里写的是 Meridian', () => {
    const template = menuTemplate('darwin', () => {}, MAIN_COPY.en.menu)
    expect(template.map((item) => item.label)).toEqual([undefined, 'File', 'Edit', 'View', 'Window', 'Help'])
    expect((template[0]!.submenu as MenuItemConstructorOptions[]).filter((item) => item.role !== undefined).map((item) => item.label))
      .toEqual(['About Meridian', 'Services', 'Hide Meridian', 'Hide Others', 'Show All', 'Quit Meridian'])
    expect((template[2]!.submenu as MenuItemConstructorOptions[]).slice(0, 6).map((item) => item.label))
      .toEqual(['Undo', 'Redo', undefined, 'Cut', 'Copy', 'Paste'])
  })

  it('帮助菜单在三个平台都排在最后，中文写作「帮助」，英文写作 Help', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      expect([MAIN_COPY.zh.menu, MAIN_COPY.en.menu].map((copy) => menuTemplate(platform, () => {}, copy).at(-1)?.label))
        .toEqual(['帮助', 'Help'])
    }
  })

  it('三个平台都在 Help 下提供同一个 Skill 与 MCP 教程入口', () => {
    const openTutorial = vi.fn()
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const tutorial = flatten(menuTemplate(
        platform, () => {}, MAIN_COPY.en.menu, openTutorial,
      )).find((item) => item.id === 'agent-tutorial')
      expect(tutorial?.label).toBe('Using Skills and MCP')
      tutorial?.click?.(null as never, undefined, null as never)
    }
    expect(openTutorial).toHaveBeenCalledTimes(3)
  })

  it('三个平台、两种语言的菜单项都不以省略号结尾,打开对话框的也不', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      for (const copy of [MAIN_COPY.zh.menu, MAIN_COPY.en.menu]) {
        const labels = flatten(menuTemplate(platform, () => {}, copy)).map((item) => item.label ?? '')
        expect(labels.filter((label) => /(…|\.\.\.)$/.test(label)), platform).toEqual([])
      }
    }
  })

  it('macOS 的应用名菜单保留 appMenu 角色默认的每一项,退出仍在文件菜单', () => {
    const template = menuTemplate('darwin', () => {}, MAIN_COPY.zh.menu)
    const appMenu = template[0]
    expect(appMenu?.role).toBe('appMenu')
    expect(Array.isArray(appMenu?.submenu) ? appMenu.submenu.map((i) => i.role ?? i.id) : [])
      .toEqual([
        'about', undefined, 'settings', 'palette', undefined, 'services', undefined,
        'hide', 'hideOthers', 'unhide', undefined, 'quit',
      ])
    expect(template[1]?.role).toBe('fileMenu')
  })

  it('Windows 与 Linux 的文件菜单以退出结尾,仍是 Electron 的角色', () => {
    const file = menuTemplate('win32', () => {}, MAIN_COPY.zh.menu)[0]
    expect(Array.isArray(file?.submenu) ? file.submenu.at(-1)?.role : undefined).toBe('quit')
  })

  /** The app of a menu: `packaged` and `sidebarHidden` as given, every command recorded in `commands`. */
  const appOf = (over: Partial<Pick<MenuApp, 'packaged' | 'sidebarHidden'>> = {}) => {
    const commands: AppCommand[] = []
    return { commands, app: { packaged: false, sidebarHidden: false, ...over, onCommand: (c: AppCommand) => { commands.push(c) } } }
  }
  const itemsOf = (platform: NodeJS.Platform, copy: MenuCopy, app: MenuApp) =>
    flatten(menuTemplate(platform, () => {}, copy, () => {}, () => {}, app))
  const click = (item: MenuItemConstructorOptions | undefined) => item?.click?.(null as never, undefined, null as never)

  it('三个平台的文件菜单先列新建项目、新建想法、新对话,再列导入 PDF,各自交给页面去做', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const { commands, app } = appOf()
      const template = menuTemplate(platform, () => {}, MAIN_COPY.zh.menu, () => {}, () => {}, app)
      const file = template.find((top) => top.label === '文件')!.submenu as MenuItemConstructorOptions[]
      expect(file.slice(0, 6).map((item) => (item.type === 'separator' ? '—' : item.label)))
        .toEqual(['新建项目', '新建想法', '新对话', '—', '导入 PDF', '—'])
      file.slice(0, 6).forEach(click)
      expect(commands).toEqual(['newProject', 'newIdea', 'newChat', 'importPdf'])
    }
    expect(itemsOf('darwin', MAIN_COPY.en.menu, appOf().app).filter((item) => ['newProject', 'newIdea', 'newChat', 'importPdf']
      .includes(item.id ?? '')).map((item) => item.label)).toEqual(['New Project', 'New Idea', 'New Chat', 'Import PDF'])
  })

  it('编辑菜单最后有「查找」,快捷键 CmdOrCtrl+F,交给页面去做', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const { commands, app } = appOf()
      const find = itemsOf(platform, MAIN_COPY.zh.menu, app).find((item) => item.id === 'find')
      expect([find?.label, find?.accelerator]).toEqual(['查找', 'CmdOrCtrl+F'])
      click(find)
      expect(commands).toEqual(['find'])
    }
  })

  it('视图菜单第一项按侧栏的状态叫「收起侧栏」或「展开侧栏」,快捷键 CmdOrCtrl+B', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const toggle = (sidebarHidden: boolean, copy = MAIN_COPY.zh.menu) => {
        const { commands, app } = appOf({ sidebarHidden })
        const view = menuTemplate(platform, () => {}, copy, () => {}, () => {}, app).find((top) => top.role === 'viewMenu')!
        const first = (view.submenu as MenuItemConstructorOptions[])[0]
        click(first)
        return [first?.label, first?.accelerator, commands]
      }
      expect(toggle(false)).toEqual(['收起侧栏', 'CmdOrCtrl+B', ['toggleSidebar']])
      expect(toggle(true)).toEqual(['展开侧栏', 'CmdOrCtrl+B', ['toggleSidebar']])
      expect(toggle(false, MAIN_COPY.en.menu)[0]).toBe('Hide Sidebar')
      expect(toggle(true, MAIN_COPY.en.menu)[0]).toBe('Show Sidebar')
    }
  })

  it('打包后的 App 视图菜单里没有重新载入和开发者工具,开发时仍有', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const roles = (packaged: boolean) => itemsOf(platform, MAIN_COPY.zh.menu, appOf({ packaged }).app)
        .map((item) => item.role).filter((role) => role !== undefined)
      expect(roles(true)).not.toEqual(expect.arrayContaining(['reload']))
      expect(roles(true).filter((role) => ['reload', 'forceReload', 'toggleDevTools'].includes(role))).toEqual([])
      expect(roles(false)).toEqual(expect.arrayContaining(['reload', 'forceReload', 'toggleDevTools']))
    }
  })

  it('视图菜单的实际大小、放大、缩小沿用缩放角色的快捷键,交给页面;⌘= 是隐藏的放大', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const { commands, app } = appOf()
      const zooms = itemsOf(platform, MAIN_COPY.zh.menu, app).filter((item) => item.id?.startsWith('zoom') || item.id === 'resetZoom')
      expect(zooms.map((item) => [item.label, item.accelerator, item.visible ?? true])).toEqual([
        ['实际大小', 'CommandOrControl+0', true],
        ['放大', 'CommandOrControl+Plus', true],
        ['放大', 'CommandOrControl+=', false],
        ['缩小', 'CommandOrControl+-', true],
      ])
      zooms.forEach(click)
      expect(commands).toEqual(['resetZoom', 'zoomIn', 'zoomIn', 'zoomOut'])
    }
  })
})

describe('nextZoomLevel', () => {
  it('放大和缩小各走半级,实际大小回到 0,和 Electron 的缩放角色一样', () => {
    expect(nextZoomLevel('zoomIn', 0)).toBe(0.5)
    expect(nextZoomLevel('zoomOut', 0.5)).toBe(0)
    expect(nextZoomLevel('zoomOut', 0)).toBe(-0.5)
    expect(nextZoomLevel('resetZoom', 1.5)).toBe(0)
  })
})

/** A right-click on nothing editable, with nothing selected or misspelled, where every edit is allowed. */
const target = (over: Partial<Parameters<typeof editMenuTemplate>[1]>): Parameters<typeof editMenuTemplate>[1] => ({
  isEditable: false, selectionText: '', misspelledWord: '', dictionarySuggestions: [],
  editFlags: {
    canUndo: true, canRedo: true, canCut: true, canCopy: true, canPaste: true, canDelete: true,
    canSelectAll: true, canEditRichly: false,
  },
  ...over,
})
/** Each item's label, '—' for a separator. */
const labels = (template: MenuItemConstructorOptions[]) =>
  template.map((item) => (item.type === 'separator' ? '—' : item.label))
const noActions = { replaceMisspelling: () => {}, lookUp: () => {} }

describe('editMenuTemplate', () => {
  it('右键文本框给出 Electron 角色的剪切、复制、粘贴、全选,标签随界面语言', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      expect(editMenuTemplate(platform, target({ isEditable: true }), MAIN_COPY.zh.editMenu, noActions)
        .map((item) => [item.role, item.label]))
        .toEqual([['cut', '剪切'], ['copy', '复制'], ['paste', '粘贴'], ['selectAll', '全选']])
      expect(labels(editMenuTemplate(platform, target({ isEditable: true }), MAIN_COPY.en.editMenu, noActions)))
        .toEqual(['Cut', 'Copy', 'Paste', 'Select All'])
    }
  })

  it('文本框里页面报告做不了的编辑项变灰', () => {
    const flags = { ...target({}).editFlags, canCut: false, canCopy: false, canPaste: false }
    expect(editMenuTemplate('win32', target({ isEditable: true, editFlags: flags }), MAIN_COPY.zh.editMenu, noActions)
      .map((item) => item.enabled)).toEqual([false, false, false, true])
  })

  it('光标下的词拼错时先列出拼写建议,点一条就换成它', () => {
    const replaceMisspelling = vi.fn()
    const template = editMenuTemplate('win32', target({
      isEditable: true, misspelledWord: 'speculatve', dictionarySuggestions: ['speculative', 'speculate'],
    }), MAIN_COPY.zh.editMenu, { replaceMisspelling, lookUp: () => {} })
    expect(labels(template)).toEqual(['speculative', 'speculate', '—', '剪切', '复制', '粘贴', '全选'])
    template[1]!.click!(null as never, undefined, null as never)
    expect(replaceMisspelling).toHaveBeenCalledWith('speculate')
  })

  it('macOS 上选中的字先能查询,文本框里外都一样;文本框外只能复制;Windows 与 Linux 没有查询', () => {
    const lookUp = vi.fn()
    const selected = target({ selectionText: 'KV cache' })
    const mac = editMenuTemplate('darwin', selected, MAIN_COPY.zh.editMenu, { replaceMisspelling: () => {}, lookUp })
    expect(labels(mac)).toEqual(['查询“KV cache”', '—', '复制'])
    expect(mac[2]?.role).toBe('copy')
    mac[0]!.click!(null as never, undefined, null as never)
    expect(lookUp).toHaveBeenCalledTimes(1)
    expect(labels(editMenuTemplate('darwin', target({ isEditable: true, selectionText: 'KV' }), MAIN_COPY.en.editMenu, noActions)))
      .toEqual(['Look Up “KV”', '—', 'Cut', 'Copy', 'Paste', 'Select All'])
    for (const platform of ['win32', 'linux'] as const) {
      expect(labels(editMenuTemplate(platform, selected, MAIN_COPY.zh.editMenu, noActions))).toEqual(['复制'])
    }
  })

  it('查询的标签把选中的几行字并成一行,超过 50 个字截断并加省略号', () => {
    const tail = 'x'.repeat(80)
    const [lookUp] = editMenuTemplate('darwin', target({ selectionText: `  Speculative decoding\n  drafts  ${tail}\n` }),
      MAIN_COPY.en.editMenu, noActions)
    expect(lookUp?.label).toBe(`Look Up “${`Speculative decoding drafts ${tail}`.slice(0, 50)}…”`)
    const [short] = editMenuTemplate('darwin', target({ selectionText: '推测解码\n草稿' }), MAIN_COPY.zh.editMenu, noActions)
    expect(short?.label).toBe('查询“推测解码 草稿”')
  })

  it('macOS 上像系统的右键菜单一样不显示快捷键;Windows 与 Linux 保留 Electron 角色默认的快捷键', () => {
    const field = target({ isEditable: true, selectionText: 'KV' })
    const shortcuts = (platform: NodeJS.Platform) => editMenuTemplate(platform, field, MAIN_COPY.zh.editMenu, noActions)
      .filter((item) => item.role !== undefined).map((item) => item.accelerator)
    expect(shortcuts('darwin')).toEqual(['', '', '', ''])
    for (const platform of ['win32', 'linux'] as const) expect(shortcuts(platform)).toEqual([undefined, undefined, undefined, undefined])
  })

  it('既不是文本框也没选中字时,右键不弹菜单', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      expect(editMenuTemplate(platform, target({}), MAIN_COPY.zh.editMenu, noActions)).toEqual([])
      expect(editMenuTemplate(platform, target({ selectionText: ' \n ' }), MAIN_COPY.zh.editMenu, noActions)).toEqual([])
    }
  })
})
