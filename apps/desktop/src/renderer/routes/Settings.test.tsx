// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CallFailure, ColourTheme, HarnessCli, HarnessModelConnectionCheckResult, HarnessSubscriptionStatus, LibraryBackup,
  LibraryLocation, SemanticKeyCheckResult, SemanticKeyStatus,
} from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { MessagesProvider } from '../messages/useMessages.js'
import type { SettingsCategory } from '../shell/settings-categories.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ColourThemeFilesContext } from '../shell/useColourThemes.js'
import { BUILT_IN_COLOUR_THEMES } from '../../shared/colour-theme.js'

const api = vi.hoisted(() => ({
  setOpen: vi.fn(),
  requestedCategory: 'delivery-watch' as SettingsCategory | null,
  pluginVersion: vi.fn(async () => ({ version: '0.0.1', checkedAt: null as string | null })),
  // A check re-measures the same installed extensions against the version it read.
  checkLatest: vi.fn(async (): Promise<unknown> => api.extensionStatus()),
  deliverySettings: vi.fn(async () => ({ maxItemsPerRun: 10 })),
  updateDeliverySettings: vi.fn(async () => {}),
  modelSettings: vi.fn(async () => ({
    provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: '',
    authentication: 'api-key', apiKeyConfigured: false,
    apiKeyLastFour: undefined as string | undefined, configured: false,
    profiles: [{
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: '',
      authentication: 'api-key', apiKeyConfigured: false,
      apiKeyLastFour: undefined as string | undefined, configured: false,
    }],
    subscription: {
      active: null as HarnessCli | null, models: { claude: '', codex: '' },
      error: undefined as CallFailure | undefined,
    },
  })),
  updateModelSettings: vi.fn(async () => ({
    provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'gpt-test',
    authentication: 'api-key', apiKeyConfigured: true, apiKeyLastFour: 'cret', configured: true,
    profiles: [{
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'gpt-test',
      authentication: 'api-key', apiKeyConfigured: true, apiKeyLastFour: 'cret', configured: true,
    }],
    subscription: { active: null as HarnessCli | null, models: { claude: '', codex: '' }, error: undefined as CallFailure | undefined },
  })),
  updateSubscription: vi.fn(async (choice: { cli: HarnessCli; model: string }) => ({
    ...(await api.modelSettings()),
    subscription: {
      active: choice.cli as HarnessCli | null, models: { claude: '', codex: '', [choice.cli]: choice.model },
      error: undefined as CallFailure | undefined,
    },
  })),
  subscriptionStatus: vi.fn<(cli: HarnessCli) => Promise<HarnessSubscriptionStatus>>(async () => ({
    state: 'found', version: '2.1.3', signIn: 'subscription', models: ['opus', 'sonnet'],
  })),
  checkModelConnection: vi.fn(async (): Promise<HarnessModelConnectionCheckResult> => ({
    state: 'connected' as const, modelCalls: 1 as const, maxOutputTokens: 1 as const,
  })),
  semanticKey: vi.fn(async (): Promise<SemanticKeyStatus> => ({ configured: false })),
  setSemanticKey: vi.fn(async (): Promise<SemanticKeyStatus> => ({ configured: false })),
  checkSemanticKey: vi.fn(async (): Promise<SemanticKeyCheckResult> => ({ state: 'connected' as const })),
  extensionStatus: vi.fn(async () => [{
    id: 'codex', name: 'Codex', state: 'installed', version: '0.8.1',
    installCommand: 'codex install command', updateCommand: 'codex update command',
  }, {
    id: 'claude-code', name: 'Claude Code', state: 'not-installed',
    installCommand: 'claude install command', updateCommand: 'claude update command',
  }]),
  libraryLocation: vi.fn(async (): Promise<LibraryLocation> => ({
    root: '/tmp/meridian', source: 'fixture' as const, locked: true, restartRequired: false, openError: null,
  })),
  libraryBackups: vi.fn(async (): Promise<LibraryBackup[]> => []),
  switchBackup: vi.fn(async () => ({
    root: '/tmp/meridian', backupRoot: '/tmp/meridian-backup-current',
  })),
  deleteBackup: vi.fn(async () => null),
  resetLibrary: vi.fn(async () => ({})),
  deleteTheme: vi.fn(async () => {}),
  refreshThemes: vi.fn(async () => {}),
  restartApp: vi.fn(),
  success: vi.fn(),
  chatList: vi.fn(async () => [] as unknown[]),
  removeChat: vi.fn(),
  revision: 0,
}))

vi.mock('../ipc.js', () => ({
  appMenu: {
    chooseLibraryRoot: vi.fn(async () => null), restartApp: api.restartApp,
  },
  chat: { list: api.chatList, setArchived: vi.fn(async () => {}) },
  library: {
    location: api.libraryLocation,
    backups: api.libraryBackups,
    switchBackup: api.switchBackup,
    deleteBackup: api.deleteBackup,
    configure: vi.fn(), reset: api.resetLibrary,
  },
  delivery: {
    settings: api.deliverySettings,
    updateSettings: api.updateDeliverySettings,
    semanticKey: api.semanticKey,
    setSemanticKey: api.setSemanticKey,
    checkSemanticKey: api.checkSemanticKey,
  },
  harness: {
    modelSettings: api.modelSettings,
    updateModelSettings: api.updateModelSettings,
    checkModelConnection: api.checkModelConnection,
    updateSubscription: api.updateSubscription,
    subscriptionStatus: api.subscriptionStatus,
  },
  extensions: { status: api.extensionStatus, pluginVersion: api.pluginVersion, checkLatest: api.checkLatest },
  colourThemes: { save: vi.fn(async () => {}), delete: api.deleteTheme },
}))
vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: api.success, refusal: vi.fn() }),
  useJump: () => ({ open: vi.fn() }),
  useChatSession: () => ({ remove: api.removeChat }),
  useSettingsOpen: () => ({
    open: true, requestedCategory: api.requestedCategory, setOpen: api.setOpen, openCategory: vi.fn(),
  }),
  useVaultRevision: () => ({ revision: api.revision, bump: vi.fn() }),
}))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))
vi.mock('./Watches.js', () => ({ WatchSettings: () => <div data-testid="watch-settings">关注配置</div> }))
vi.mock('../components/settings/DiscoverySettings.js', () => ({
  DiscoverySettings: () => <div data-testid="discovery-settings">发现方向配置</div>,
}))

const { Settings } = await import('./Settings.js')

/** Opens the picker named `label` in `dialog` and returns its menu items. */
async function openPicker(dialog: Element, label: string): Promise<HTMLElement[]> {
  const trigger = dialog.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  await act(async () => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
  return [...document.querySelectorAll<HTMLElement>('.choice-picker-menu [role="menuitemradio"]')]
}

/** Closes the open picker menu without picking. */
async function closePicker(): Promise<void> {
  await act(async () => {
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
}

/** Picks the option shown as `text` in the picker named `label`. */
async function pick(dialog: Element, label: string, text: string): Promise<void> {
  const item = (await openPicker(dialog, label)).find((candidate) => candidate.textContent === text)!
  await act(async () => {
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('Settings', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.appearance
    delete document.documentElement.dataset.colourTheme
    document.getElementById('meridian-colour-theme')?.remove()
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)))
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    api.requestedCategory = 'delivery-watch'
    api.revision = 0
    api.updateDeliverySettings.mockClear()
    api.updateModelSettings.mockClear()
    api.checkModelConnection.mockClear()
    api.updateSubscription.mockClear()
    api.subscriptionStatus.mockClear()
    api.semanticKey.mockClear()
    api.semanticKey.mockResolvedValue({ configured: false })
    api.setSemanticKey.mockClear()
    api.setSemanticKey.mockResolvedValue({ configured: false })
    api.checkSemanticKey.mockClear()
    api.checkSemanticKey.mockResolvedValue({ state: 'connected' })
    api.extensionStatus.mockClear()
    api.libraryLocation.mockClear()
    api.libraryLocation.mockResolvedValue({
      root: '/tmp/meridian', source: 'fixture', locked: true, restartRequired: false, openError: null,
    })
    api.libraryBackups.mockClear()
    api.libraryBackups.mockResolvedValue([])
    api.switchBackup.mockClear()
    api.deleteBackup.mockClear()
    api.resetLibrary.mockClear()
    api.deleteTheme.mockReset()
    api.refreshThemes.mockClear()
    api.restartApp.mockClear()
    api.success.mockClear()
  })
  afterEach(() => { act(() => root.unmount()) })

  it('论文推送是可点击的总设置，关注与发现是两个子菜单', async () => {
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    expect([...dialog.querySelectorAll('[data-setcat]')].map((node) => node.textContent))
      .toEqual(['外观', '存储', 'API', '扩展', '论文推送', '关注', '发现', '归档的对话'])
    expect(dialog.querySelector('[data-setcat="delivery-watch"]')?.classList.contains('on')).toBe(true)
    expect(dialog.querySelector('[data-testid="watch-settings"]')).not.toBeNull()
    expect(dialog.querySelector('[data-testid="discovery-settings"]')).toBeNull()

    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="delivery-discovery"]')!.click()
    })
    expect(dialog.querySelector('[data-setcat="delivery-discovery"]')?.classList.contains('on')).toBe(true)
    expect(dialog.querySelector('[data-testid="watch-settings"]')).toBeNull()
    expect(dialog.querySelector('[data-testid="discovery-settings"]')).not.toBeNull()

    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="delivery"]')!.click()
    })
    expect(dialog.querySelector('[data-setcat="delivery"]')?.classList.contains('on')).toBe(true)
    const limit = dialog.querySelector<HTMLInputElement>('[aria-label="单次推送上限"]')!
    expect(limit.value).toBe('10')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(limit, '12')
      limit.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // Like the model card's save, it sits at the end of the card's foot and says it saved in place.
    const save = dialog.querySelector<HTMLButtonElement>('.delivery-settings-card > .service-foot > .service-actions > .btn')!
    expect(dialog.querySelector('.delivery-setting-control .btn')).toBeNull()
    await act(async () => { save.click() })
    expect(api.updateDeliverySettings).toHaveBeenCalledWith({ maxItemsPerRun: 12, maxShownPerScope: 20 })
    expect([save.getAttribute('aria-label'), save.querySelector('.cki') !== null]).toEqual(['已保存', true])
  })

  it('单次推送上限里输入法组字的回车不保存，组完字后的回车才保存', async () => {
    api.requestedCategory = 'delivery'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const limit = document.querySelector<HTMLInputElement>('[aria-label="单次推送上限"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(limit, '12')
      limit.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const pressEnter = (init: KeyboardEventInit) => act(async () => {
      limit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init }))
    })
    await pressEnter({ isComposing: true })
    expect(api.updateDeliverySettings).not.toHaveBeenCalled()
    await pressEnter({})
    expect(api.updateDeliverySettings).toHaveBeenCalledExactlyOnceWith({ maxItemsPerRun: 12, maxShownPerScope: 20 })
  })

  it('归档的对话那一行的打开、取消归档和删除是行尾操作槽里的图标钮，删除标红、不弹确认，交给删对话的那一处', async () => {
    const { chat } = await import('../ipc.js')
    vi.mocked(chat.list).mockResolvedValueOnce([{ id: 'chat-1', title: '树宽讨论', archived: true, messageCount: 2 }])
    api.requestedCategory = 'archived'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const row = document.querySelector('.setdlg [data-chat="chat-1"]')!
    const slot = (row: Element) => [...row.querySelectorAll('.row-actions button')].map((item) => [
      item.getAttribute('aria-label'), item.textContent, item.classList.contains('icbtn'), item.classList.contains('danger'),
    ])
    expect(row.hasAttribute('data-row-actions')).toBe(true)
    expect(slot(row)).toEqual([['打开', '', true, false], ['取消归档', '', true, false], ['删除', '', true, true]])
    await act(async () => { row.querySelector<HTMLButtonElement>('.row-actions button[aria-label="删除"]')!.click() })
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(api.removeChat).toHaveBeenCalledExactlyOnceWith('chat-1')
  })

  it('设置和外观主题编辑都是分栏页的对话框两栏:左边导航,右边的标题留在上面,下面的内容自己滚动', async () => {
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    const layout = () => {
      const split = dialog.querySelector('.modal-body > .split-page')
      const main = split?.querySelector(':scope > .split-main')
      return split === null || main === null || main === undefined ? null : [
        split.className, ...[...split.children].map((column) => column.className.split(' ')[0]),
        ...[...main.children].map((part) => part.className.split(' ')[0]),
      ]
    }
    expect(layout()).toEqual(['split-page split-page--dialog', 'scroll-area', 'split-main', 'split-main-head', 'scroll-area'])
    expect(dialog.querySelector('.split-nav > .split-nav-head > .modal-title')!.textContent).toBe('设置')
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="appearance"]')!.click() })
    const heading = [...dialog.querySelectorAll('.section-heading')].find((held) => held.firstChild?.textContent === '外观主题')!
    await act(async () => { heading.querySelector<HTMLButtonElement>('.section-heading-actions > .add-action')!.click() })
    expect(layout()).toEqual(['split-page split-page--dialog', 'scroll-area', 'split-main', 'split-main-head', 'scroll-area'])
    expect([...dialog.querySelector('.split-nav-head')!.children].map((part) => part.getAttribute('aria-label') ?? part.textContent))
      .toEqual(['返回', '外观主题'])
  })

  it('设置右栏放不下时，只在藏着内容的那一边淡出', async () => {
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const pane = document.querySelector<HTMLElement>('.setdlg .split-main-body')!
    let offset = 0
    Object.defineProperty(pane, 'clientHeight', { configurable: true, get: () => 400 })
    Object.defineProperty(pane, 'scrollHeight', { configurable: true, get: () => 900 })
    Object.defineProperty(pane, 'scrollTop', { configurable: true, get: () => offset })
    act(() => { pane.dispatchEvent(new Event('scroll')) })
    expect(pane.dataset.fade).toBe('bottom')
    act(() => { offset = 200; pane.dispatchEvent(new Event('scroll')) })
    expect(pane.dataset.fade).toBe('top bottom')
  })

  it('设置右栏放不下时，每个分类的标题都留在滚动区上面，标题以外的内容都在滚动区里', async () => {
    const titles: Record<SettingsCategory, string> = {
      appearance: '外观', storage: '存储', api: 'API', model: '模型', research: '科研', extensions: '扩展',
      delivery: '论文推送', 'delivery-watch': '关注', 'delivery-discovery': '发现', archived: '归档的对话 · 0',
    }
    for (const [category, title] of Object.entries(titles) as [SettingsCategory, string][]) {
      api.requestedCategory = category
      await act(async () => { root.render(<MessagesProvider key={category}><Settings /></MessagesProvider>) })
      const column = document.querySelector<HTMLElement>('.setdlg .split-main')!
      for (const box of [column, ...column.querySelectorAll<HTMLElement>('*')]) {
        Object.defineProperty(box, 'clientHeight', { configurable: true, get: () => 400 })
        Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => 900 })
      }
      act(() => { window.dispatchEvent(new Event('resize')) })
      const scrolling = [column, ...column.querySelectorAll<HTMLElement>('[data-fade]')]
        .filter((box) => box.dataset.fade !== undefined && box.parentElement?.closest('[data-fade]') === null)
      expect(scrolling, category).toHaveLength(1)
      const fixed = [...column.querySelectorAll('.section-heading')].filter((heading) => !scrolling[0]!.contains(heading))
      expect(fixed.map((heading) => heading.textContent), category).toEqual([title])
      expect(column.textContent, category).toBe(`${title}${scrolling[0]!.textContent}`)
    }
  })

  it('每个设置分类都是按钮，键盘能聚焦和打开', async () => {
    api.requestedCategory = null
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const rows = [...document.querySelectorAll('.setdlg [data-setcat]')]
    expect(rows.map((row) => row.tagName)).toEqual(rows.map(() => 'BUTTON'))
  })

  it('API 总览列出模型和科研的当前状态，点科研进入 Semantic Scholar 页', async () => {
    api.modelSettings.mockResolvedValueOnce({
      ...(await api.modelSettings()), model: 'gpt-test', configured: true,
    })
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="api"]')!.click() })
    expect(dialog.querySelector('[data-api="model"] .api-state')?.textContent).toBe('OpenAI · gpt-test')
    expect(dialog.querySelector('[data-api="research"] .api-state')?.textContent).toBe('未配置')

    await act(async () => { dialog.querySelector<HTMLElement>('[data-api="research"] .btn')!.click() })
    expect(dialog.querySelector('[data-setcat="research"]')?.classList.contains('on')).toBe(true)
    expect(dialog.querySelector('.semantic-key-card')).not.toBeNull()
    expect(dialog.querySelector('.semantic-key-card .service-status-pill')?.textContent).toBe('未配置')
  })

  it('API 总览在选了订阅时写订阅的名字，订阅指定了模型时再写模型', async () => {
    const shown = async (subscription: { active: HarnessCli; models: { claude: string; codex: string } }) => {
      api.modelSettings.mockResolvedValueOnce({ ...(await api.modelSettings()), subscription: { ...subscription, error: undefined } })
      await act(async () => { root.render(<MessagesProvider key={JSON.stringify(subscription)}><Settings /></MessagesProvider>) })
      const dialog = document.querySelector('.setdlg')!
      await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="api"]')!.click() })
      return dialog.querySelector('[data-api="model"] .api-state')?.textContent
    }
    expect(await shown({ active: 'claude', models: { claude: '', codex: 'gpt-5-codex' } })).toBe('Claude 订阅')
    expect(await shown({ active: 'codex', models: { claude: '', codex: 'gpt-5-codex' } })).toBe('ChatGPT 订阅 · gpt-5-codex')
  })

  it('API 总览还没读到一项的状态时，那一格是载入占位，不写正在读取', async () => {
    api.semanticKey.mockReturnValueOnce(new Promise(() => {}))
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="api"]')!.click() })
    const research = dialog.querySelector('[data-api="research"] .api-state')!
    expect([research.matches('.loading-placeholder'), research.textContent]).toEqual([true, ''])
  })

  it('科研数据源总览显示 Semantic Scholar 当已配置 key', async () => {
    api.semanticKey.mockResolvedValueOnce({ configured: true, lastFour: 'ab12' })
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="api"]')!.click() })
    expect(dialog.querySelector('[data-api="research"] .api-state')?.textContent).toBe('Semantic Scholar')
  })

  it('API 总览读不到当前状态时，原因落在共享的错误框里，和别的设置页的错误一样', async () => {
    api.semanticKey.mockRejectedValueOnce(new CallError('delivery.semanticKey', 'newer-version'))
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="api"]')!.click() })
    const alert = dialog.querySelector('.split-main-body [role="alert"]')
    expect([alert?.className, alert?.textContent]).toEqual(['inline-message inline-message--box inline-message--error page-error page-error--section', '需要更新 App'])
  })

  it('API 与论文推送的子分类默认收起，点开父级或直接进入子级都会展开', async () => {
    api.requestedCategory = null
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    const setcats = () => [...dialog.querySelectorAll('[data-setcat]')].map((node) => node.getAttribute('data-setcat'))
    expect(setcats()).toEqual(['appearance', 'storage', 'api', 'extensions', 'delivery', 'archived'])

    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="api"]')!.click() })
    expect(setcats()).toEqual(['appearance', 'storage', 'api', 'model', 'research', 'extensions', 'delivery', 'archived'])

    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="delivery"]')!.click() })
    expect(setcats()).toEqual([
      'appearance', 'storage', 'api', 'extensions', 'delivery', 'delivery-watch', 'delivery-discovery', 'archived',
    ])
  })

  it('直接打开一个子分类时，它所属的父级子菜单保持展开', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    expect([...dialog.querySelectorAll('[data-setcat]')].map((node) => node.getAttribute('data-setcat')))
      .toEqual(['appearance', 'storage', 'api', 'model', 'research', 'extensions', 'delivery', 'archived'])
    expect(dialog.querySelector('[data-setcat="model"]')?.classList.contains('on')).toBe(true)
  })

  it('未配置 key 时科研卡片显示未配置，测试连接不可用，按钮旁不写字', async () => {
    api.requestedCategory = 'research'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    const card = dialog.querySelector('.semantic-key-card')!
    expect(card.querySelector('.service-status-pill')?.textContent).toBe('未配置')
    const buttons = [...card.querySelectorAll<HTMLButtonElement>('button')]
    expect(buttons.find((b) => b.textContent === '测试连接')!.disabled).toBe(true)
    expect(card.querySelector('.service-actions .tag')).toBeNull()
    expect(buttons.find((b) => b.textContent === '保存配置')!.disabled).toBe(true)
    expect(buttons.some((b) => b.textContent === '清除已保存的 Key')).toBe(false)
  })

  it('模型配置还没保存时测试连接不可用，按钮旁不写字；保存过的可以测试', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const test = () => [...document.querySelectorAll<HTMLButtonElement>('.model-settings-card button')]
      .find((b) => b.textContent === '测试连接')!
    expect([test().disabled, document.querySelector('.model-settings-card .service-actions .tag')]).toEqual([true, null])
    api.modelSettings.mockResolvedValueOnce({ ...(await api.updateModelSettings()) })
    await act(async () => { root.render(<MessagesProvider key="saved"><Settings /></MessagesProvider>) })
    expect(test().disabled).toBe(false)
    expect(document.querySelector('.model-settings-card .service-actions .tag')).toBeNull()
  })

  it('填写 key 并保存配置会调用 delivery.setSemanticKey', async () => {
    api.requestedCategory = 'research'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    const input = dialog.querySelector<HTMLInputElement>('[aria-label="Semantic Scholar API Key"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'new-secret')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const save = [...dialog.querySelectorAll<HTMLButtonElement>('.semantic-key-card button')]
      .find((b) => b.textContent === '保存配置')!
    expect(save.disabled).toBe(false)
    await act(async () => { save.click() })
    expect(api.setSemanticKey).toHaveBeenCalledWith('new-secret')
  })

  /** What a user and a screen reader get from a card's save: its name and whether the check shows. */
  const doneLook = (save: HTMLButtonElement) => [save.getAttribute('aria-label'), save.querySelector('.cki') !== null]

  it('科研数据源的 key 保存成功后，保存与论文推送的保存一样就地亮出对勾，名字是已保存', async () => {
    api.requestedCategory = 'research'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const input = document.querySelector<HTMLInputElement>('.setdlg [aria-label="Semantic Scholar API Key"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'new-secret')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const save = document.querySelector<HTMLButtonElement>('.semantic-key-card .service-actions .btn.pri')!
    expect(doneLook(save)).toEqual([null, false])
    await act(async () => { save.click() })
    expect(doneLook(save)).toEqual(['已保存', true])
  })

  it('模型配置保存成功后，保存就地亮出对勾，名字是已保存；保存失败时不亮', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const save = () => document.querySelector<HTMLButtonElement>('.model-settings-card .service-actions .btn.pri')!
    expect(doneLook(save())).toEqual([null, false])
    api.updateModelSettings.mockRejectedValueOnce(new Error('refused'))
    await act(async () => { save().click() })
    expect(doneLook(save())).toEqual([null, false])
    await act(async () => { save().click() })
    expect(doneLook(save())).toEqual(['已保存', true])
  })

  it('已保存的 key 显示掩码末四位；标记清除后保存会调用 setSemanticKey(null)', async () => {
    api.requestedCategory = 'research'
    api.semanticKey.mockResolvedValueOnce({ configured: true, lastFour: 'ab12' })
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    const card = dialog.querySelector('.semantic-key-card')!
    expect(card.querySelector('.service-status-pill')?.textContent).toBe('已配置')
    const saved = card.querySelector<HTMLButtonElement>('.service-saved-key')!
    expect(saved.querySelector('.service-key-mask')?.textContent).toBe('••••••••')
    expect(saved.querySelector('.service-key-tail')?.textContent).toBe('ab12')

    const clear = [...card.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === '清除已保存的 Key')!
    await act(async () => { clear.click() })
    expect(clear.textContent).toBe('将清除 Key')
    const save = [...card.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '保存配置')!
    await act(async () => { save.click() })
    expect(api.setSemanticKey).toHaveBeenCalledWith(null)
  })

  it('已保存 key 时可测试连接，成功与失败都按模型页同样的方式展示', async () => {
    api.requestedCategory = 'research'
    api.semanticKey.mockResolvedValueOnce({ configured: true, lastFour: 'ab12' })
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    const card = dialog.querySelector('.semantic-key-card')!
    const test = [...card.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '测试连接')!
    expect(test.disabled).toBe(false)

    await act(async () => { test.click() })
    expect(api.checkSemanticKey).toHaveBeenCalledOnce()
    const worked = card.querySelector('.service-connection-status')!
    expect([worked.matches('.inline-message--line.inline-message--done[role="status"]'), worked.textContent]).toEqual([true, '连接成功'])

    api.checkSemanticKey.mockResolvedValueOnce({
      state: 'failed', reason: 'authentication', detail: 'HTTP 401',
    })
    await act(async () => { test.click() })
    const status = card.querySelector('.service-connection-status')!
    expect(status.matches('.inline-message--line.inline-message--error[role="alert"]')).toBe(true)
    expect(status.querySelector('.inline-message-text > div')?.textContent).toBe('认证失败')
    expect(status.textContent).toContain('HTTP 401')
  })

  it('扩展设置显示 Core 检查结果:已安装的给更新命令,未安装的给安装命令;复制不再弹提示', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="extensions"]')!.click()
    })

    expect(api.extensionStatus).toHaveBeenCalledOnce()
    expect(dialog.querySelector('[data-extension="codex"] .extension-state')?.textContent)
      .toBe('已安装 · 0.8.1')
    expect(dialog.querySelector('[data-extension="claude-code"] .extension-state')?.textContent)
      .toBe('未安装')
    expect(dialog.querySelector('[data-extension="codex"] code')?.textContent)
      .toBe('codex update command')
    expect(dialog.querySelector('[data-extension="codex"] .command-tray-heading')?.textContent)
      .toBe('更新命令')
    expect(dialog.querySelector('[data-extension="claude-code"] code')?.textContent)
      .toBe('claude install command')
    expect(dialog.querySelector('[data-extension-tutorial]')?.textContent)
      .toContain('在 Coding Agent 中使用 Meridian')
    // The first row is the plugin version the skills and MCP share, not the app's own version.
    const pluginRow = dialog.querySelector('[data-plugin-version="0.0.1"]')!
    expect(pluginRow.querySelector('.section-heading--group > span')?.firstChild?.textContent).toBe('Meridian Plugin')
    expect(pluginRow.querySelector('.extension-state')?.textContent).toBe('最新 0.0.1')
    expect(pluginRow.querySelector('.section-heading-meta')?.textContent).toBe('—')
    api.pluginVersion.mockResolvedValueOnce({ version: '0.0.2', checkedAt: '2026-09-22T08:00:00.000Z' })
    await act(async () => {
      pluginRow.querySelector<HTMLButtonElement>('button')!.click()
    })
    expect(api.checkLatest).toHaveBeenCalledOnce()
    const checked = dialog.querySelector('[data-plugin-version="0.0.2"]')!
    expect(checked.querySelector('.extension-state')?.textContent).toBe('最新 0.0.2')
    expect(checked.querySelector('.section-heading-meta')?.textContent).toContain('上次检查')

    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('[aria-label="复制 Claude Code 安装命令"]')!.click()
    })
    expect(writeText).toHaveBeenCalledWith('claude install command')
    expect(api.success).not.toHaveBeenCalled()

    const firstPrompt = dialog.querySelector('.extension-prompt .item-meta')?.textContent ?? ''
    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('.extension-prompt button')!.click()
    })
    expect(writeText).toHaveBeenLastCalledWith(firstPrompt)
    expect(api.success).not.toHaveBeenCalled()
  })

  it('外观设置用三张预览卡选择浅色、深色或跟随系统', async () => {
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="appearance"]')!.click()
    })

    const modes = dialog.querySelector('[role="radiogroup"][aria-label="外观"]')!
    const choices = [...modes.querySelectorAll<HTMLButtonElement>('.appearance-choice')]
    expect(choices.map((choice) => choice.textContent)).toEqual(['浅色', '深色', '跟随系统'])
    expect(modes.querySelectorAll('.appearance-preview')).toHaveLength(3)
    expect(modes.querySelectorAll('.appearance-preview.system .appearance-mini')).toHaveLength(2)
    expect(choices[2]!.getAttribute('aria-checked')).toBe('true')

    await act(async () => { choices[1]!.click() })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('meridian.appearance')).toBe('dark')
    expect(choices[1]!.getAttribute('aria-checked')).toBe('true')

    await act(async () => { choices[0]!.click() })
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(document.documentElement.dataset.appearance).toBe('light')
  })

  /** The colours a preview draws, as `<mode> <window> <sidebar> <line> <accent>`. */
  const previewColours = (preview: Element): string => {
    const style = (preview as HTMLElement).style
    return [preview.classList.contains('dark') ? 'dark' : 'light',
      ...['--ap-window', '--ap-sidebar', '--ap-line', '--ap-accent'].map((part) => style.getPropertyValue(part))].join(' ')
  }

  it('外观主题用五张卡选择默认和四种漆色主题,每张都并排预览它的浅色和深色;选中后整套颜色和三张外观预览都换成它', async () => {
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="appearance"]')!.click()
    })

    const themes = dialog.querySelector('[role="radiogroup"][aria-label="外观主题"]')!
    const choices = [...themes.querySelectorAll<HTMLButtonElement>('.appearance-choice')]
    expect(choices.map((choice) => choice.textContent)).toEqual(['默认', '朱漆', '螺钿', '秋叶', '流霞'])
    expect(choices.map((choice) => [...choice.querySelectorAll('.appearance-mini')].map((preview) => preview.classList.contains('dark') ? 'dark' : 'light')))
      .toEqual(choices.map(() => ['light', 'dark']))
    expect(previewColours(choices[1]!.querySelector('.appearance-mini.light')!)).toBe('light #f7f0e4 #ede6da #d3ccbf #a64436')
    expect(choices.map((choice) => choice.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false'])
    const modes = dialog.querySelector('[role="radiogroup"][aria-label="外观"]')!
    const modePreviews = () => [...modes.querySelectorAll('.appearance-mini')].map(previewColours)
    expect(modePreviews()).toEqual([
      'light #f8f8f8 #eeeeee #d2d2d2 #3568ff', 'dark #07111f #0d1b2d #394a62 #558cff',
      'light #f8f8f8 #eeeeee #d2d2d2 #3568ff', 'dark #07111f #0d1b2d #394a62 #558cff',
    ])

    await act(async () => { choices[1]!.click() })
    expect(document.documentElement.dataset.colourTheme).toBe('cinnabar')
    expect(window.localStorage.getItem('meridian.colour-theme')).toBe('cinnabar')
    expect(document.getElementById('meridian-colour-theme')!.textContent).toContain('--accent:#a64436')
    expect(choices.map((choice) => choice.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false'])
    expect(modePreviews().map((colours) => colours.split(' ').at(-1))).toEqual(['#a64436', '#b35041', '#a64436', '#b35041'])

    await act(async () => { choices[0]!.click() })
    expect(document.documentElement.dataset.colourTheme).toBeUndefined()
    expect(document.getElementById('meridian-colour-theme')).toBeNull()
    expect(window.localStorage.getItem('meridian.colour-theme')).toBe('default')
  })

  it('外观主题在五个内置主题之后列出能读的自定义主题文件,用它自己的名字;读不了的文件只显示文件名和原因标签', async () => {
    const luodian = BUILT_IN_COLOUR_THEMES.find((theme) => theme.id === 'luodian')!
    const celadon = { ...luodian, id: 'celadon', name: '青瓷', basedOn: 'luodian', light: { ...luodian.light, accent: '#3f7a6a' } }
    await act(async () => {
      root.render(
        <MessagesProvider>
          <ColourThemeFilesContext.Provider value={{
            files: [
              { state: 'unreadable', file: 'broken.json', reason: 'syntax' },
              { state: 'unreadable', file: 'pale.json', reason: 'format', path: 'light.accent' },
              { state: 'readable', file: 'celadon.json', theme: celadon },
            ],
            refresh: async () => {},
          }}>
            <Settings />
          </ColourThemeFilesContext.Provider>
        </MessagesProvider>,
      )
    })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="appearance"]')!.click()
    })

    const themes = dialog.querySelector('[role="radiogroup"][aria-label="外观主题"]')!
    const choices = [...themes.querySelectorAll<HTMLButtonElement>('.appearance-choice')]
    expect(choices.map((choice) => choice.textContent)).toEqual(['默认', '朱漆', '螺钿', '秋叶', '流霞', '青瓷'])
    expect(choices[5]!.querySelector<HTMLElement>('.appearance-mini.light')!.style.getPropertyValue('--ap-accent')).toBe('#3f7a6a')
    const problems = [...themes.querySelectorAll('.appearance-problem')]
    expect(problems.map((problem) => [
      problem.querySelector('.inline-message--line.inline-message--error[role="alert"]')?.textContent,
      problem.querySelector('.appearance-label')?.textContent,
    ]))
      .toEqual([['不是 JSON', 'broken.json'], ['格式不符 · light.accent', 'pale.json']])
    expect(themes.lastElementChild).toBe(problems[1])

    await act(async () => { choices[5]!.click() })
    expect(window.localStorage.getItem('meridian.colour-theme')).toBe('celadon')
    expect(document.documentElement.dataset.colourTheme).toBe('celadon')
    expect(choices[5]!.getAttribute('aria-checked')).toBe('true')
  })

  it('外观主题的小标题里是「＋ 主题」,主题卡后面不再有加号卡;点它编辑页换掉设置的两栏,返回回到外观', async () => {
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="appearance"]')!.click()
    })
    expect(dialog.querySelector('[role="radiogroup"][aria-label="外观主题"]')!.nextElementSibling).toBeNull()
    const heading = [...dialog.querySelectorAll('.section-heading')].find((held) => held.firstChild?.textContent === '外观主题')!
    const add = heading.querySelector<HTMLButtonElement>('.section-heading-actions > .add-action')!
    expect([add.getAttribute('aria-label'), add.textContent]).toEqual(['新建外观主题', '主题'])

    await act(async () => { add.click() })
    expect(dialog.querySelector('[data-setcat]')).toBeNull()
    expect(dialog.querySelector('.split-nav .modal-title')!.textContent).toBe('外观主题')
    expect([...dialog.querySelectorAll('[data-module]')]).toHaveLength(13)

    await act(async () => { dialog.querySelector<HTMLButtonElement>('button[aria-label="返回"]')!.click() })
    expect(dialog.querySelector('[data-module]')).toBeNull()
    expect(dialog.querySelector('[data-setcat="appearance"]')!.classList.contains('on')).toBe(true)
  })

  /** Renders Settings on its Appearance pane with `themes` as the custom theme files, and returns the dialog. */
  const appearanceWith = async (themes: ColourTheme[]) => {
    await act(async () => {
      root.render(
        <MessagesProvider>
          <ColourThemeFilesContext.Provider value={{
            files: themes.map((theme) => ({ state: 'readable', file: `${theme.id}.json`, theme })), refresh: api.refreshThemes,
          }}>
            <Settings />
          </ColourThemeFilesContext.Provider>
        </MessagesProvider>,
      )
    })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="appearance"]')!.click() })
    return dialog
  }
  /** Opens the … menu of the custom theme card named `name` and returns its items. */
  const openThemeMenu = async (dialog: Element, name: string) => {
    await act(async () => {
      dialog.querySelector(`button[aria-label="管理「${name}」"]`)!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    return [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
  }
  /** Picks Delete in the … menu of the card named `name`; the menu closes, then the confirmation opens. */
  const pickDelete = async (dialog: Element, name: string) => {
    await act(async () => { (await openThemeMenu(dialog, name))[1]!.click() })
    await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).not.toBeNull())
  }
  const luodian = BUILT_IN_COLOUR_THEMES.find((theme) => theme.id === 'luodian')!
  const celadon: ColourTheme = { ...luodian, id: 'celadon', name: '青瓷', basedOn: 'luodian', light: { ...luodian.light, accent: '#3f7a6a' } }
  const ink: ColourTheme = { ...luodian, id: 'ink', name: '墨' }

  it('自定义主题卡的 … 菜单里是编辑和删除,内置主题卡没有;编辑打开这个主题的编辑页', async () => {
    const dialog = await appearanceWith([celadon])
    expect(dialog.querySelector('[role="radiogroup"][aria-label="外观主题"]')!.querySelectorAll('.appearance-choice')).toHaveLength(6)
    expect(dialog.querySelectorAll('button[aria-label^="管理"]')).toHaveLength(1)
    expect(dialog.querySelector('[data-colour-theme="celadon"]')!.closest('[data-row-actions]')!
      .querySelector('.row-actions button[aria-label="管理「青瓷」"]')).not.toBeNull()

    const items = await openThemeMenu(dialog, '青瓷')
    expect(items.map((item) => item.textContent)).toEqual(['编辑…', '删除'])
    await act(async () => { items[0]!.click() })
    expect(dialog.querySelector<HTMLInputElement>('input[aria-label="名称"]')!.value).toBe('青瓷')
    expect(dialog.querySelector<HTMLInputElement>('input[aria-label="色值"]')!.value).toBe(celadon.light.ground.toUpperCase())
  })

  it('删除先关掉菜单再问确认;取消后菜单也不在,焦点回到 … 按钮;确认后删掉主题文件,删的是正在用的主题就退回默认,删别的不动当前主题', async () => {
    window.localStorage.setItem('meridian.colour-theme', 'celadon')
    const dialog = await appearanceWith([celadon, ink])

    await pickDelete(dialog, '墨')
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.querySelector('[role="alertdialog"] .modal-title')!.textContent).toBe('删除外观主题「墨」？')
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((button) => button.textContent === '取消')!.click() })
    expect([document.querySelector('[role="alertdialog"]'), document.querySelector('[role="menu"]')]).toEqual([null, null])
    expect(api.deleteTheme).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(document.activeElement).toBe(dialog.querySelector('button[aria-label="管理「墨」"]')))

    await pickDelete(dialog, '墨')
    await act(async () => { document.querySelector<HTMLButtonElement>('[role="alertdialog"] .btn.pri.danger')!.click() })
    expect(api.deleteTheme).toHaveBeenLastCalledWith('ink')
    expect(api.refreshThemes).toHaveBeenCalled()
    expect(window.localStorage.getItem('meridian.colour-theme')).toBe('celadon')

    await pickDelete(dialog, '青瓷')
    await act(async () => { document.querySelector<HTMLButtonElement>('[role="alertdialog"] .btn.pri.danger')!.click() })
    expect(api.deleteTheme).toHaveBeenLastCalledWith('celadon')
    expect(window.localStorage.getItem('meridian.colour-theme')).toBe('default')
    expect(document.documentElement.dataset.colourTheme).toBeUndefined()
  })

  it('删除失败时外观页报出原因,当前主题不动', async () => {
    window.localStorage.setItem('meridian.colour-theme', 'celadon')
    api.deleteTheme.mockRejectedValue(new CallError('themes.delete', 'not-found'))
    const dialog = await appearanceWith([celadon])
    await pickDelete(dialog, '青瓷')
    await act(async () => { document.querySelector<HTMLButtonElement>('[role="alertdialog"] .btn.pri.danger')!.click() })
    expect(dialog.querySelector('.split-main-head')!.textContent).toContain('这一项已不存在')
    expect(window.localStorage.getItem('meridian.colour-theme')).toBe('celadon')
  })

  it('编辑页有没保存的修改时,返回、右上角关闭、Esc 和点遮罩都先问同一个确认:取消留在编辑页,确认才离开;没改过就直接离开', async () => {
    api.setOpen.mockClear()
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const settings = document.querySelector<HTMLElement>('[role="dialog"]')!
    await act(async () => { settings.querySelector<HTMLElement>('[data-setcat="appearance"]')!.click() })
    await act(async () => { settings.querySelector<HTMLButtonElement>('.add-action[aria-label="新建外观主题"]')!.click() })
    const close = settings.querySelector<HTMLButtonElement>(':scope > .modal-close')!
    await act(async () => { close.click() })
    expect(api.setOpen).toHaveBeenCalledExactlyOnceWith(false)
    api.setOpen.mockClear()

    await act(async () => { settings.querySelector<HTMLElement>('[data-module="ground"]')!.click() })
    const hex = settings.querySelector<HTMLInputElement>('input[aria-label="色值"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(hex, '#f1f6f4')
      hex.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const confirmation = () => document.querySelector('[role="alertdialog"] .modal-title')?.textContent ?? null
    const answer = (label: string) => act(async () => {
      [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((button) => button.textContent === label)!.click()
    })
    const attempts: [string, () => void | Promise<void>][] = [
      ['返回', () => settings.querySelector<HTMLButtonElement>('button[aria-label="返回"]')!.click()],
      ['关闭', () => close.click()],
      ['Esc', () => hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
      ['遮罩', async () => {
        // Radix starts listening for a press outside the dialog one task after the dialog mounts, and
        // dismisses on the click that ends the press.
        await new Promise((settled) => setTimeout(settled, 0))
        const scrim = document.querySelector('.scrim')!
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          scrim.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }))
        }
        await new Promise((settled) => setTimeout(settled, 0))
      }],
    ]
    for (const [how, attempt] of attempts) {
      await act(async () => { await attempt() })
      expect(confirmation(), how).toBe('放弃未保存的修改？')
      await answer('取消')
      expect([confirmation(), settings.querySelectorAll('[data-module]').length], how).toEqual([null, 13])
    }
    expect(api.setOpen).not.toHaveBeenCalled()

    await act(async () => { hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await answer('放弃修改')
    expect(api.setOpen).toHaveBeenCalledExactlyOnceWith(false)

    await act(async () => { settings.querySelector<HTMLButtonElement>('button[aria-label="返回"]')!.click() })
    await answer('放弃修改')
    expect(settings.querySelector('[data-module]')).toBeNull()
    expect(settings.querySelector('[data-setcat="appearance"]')!.classList.contains('on')).toBe(true)
  })

  it('每个设置页只有标题和控件，标题下不写介绍句子', async () => {
    api.libraryLocation.mockResolvedValue({
      root: '/tmp/meridian', source: 'configured', locked: false, restartRequired: false, openError: null,
    })
    api.libraryBackups.mockResolvedValue([{ id: 'b1', path: '/tmp/meridian-backup', createdAt: '2026-09-15T10:28:00.000Z' }])
    const categories: SettingsCategory[] = [
      'appearance', 'storage', 'api', 'research', 'model', 'extensions', 'delivery', 'delivery-watch', 'delivery-discovery',
    ]
    for (const category of categories) {
      api.requestedCategory = category
      await act(async () => { root.render(<MessagesProvider key={category}><Settings /></MessagesProvider>) })
      const pane = document.querySelector('.setdlg .split-main')!
      expect([...pane.querySelectorAll('.settings-intro, .storage-card .section-heading + p, .storage-note')].map((p) => p.textContent), category)
        .toEqual([])
    }
  })

  it('库位置固定时只有来源标签和按不了的选择，不另写一句；要重启时写重启后生效和立即重启', async () => {
    api.requestedCategory = 'storage'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const card = () => document.querySelector('.setdlg .storage-card')!
    const states = () => [...card().querySelectorAll(':scope > .tag, :scope > [role="status"] > *')].map((node) => node.textContent)
    expect([states(), card().querySelector('.section-heading .tag')?.textContent, card().querySelector<HTMLButtonElement>('.storage-root button')?.disabled])
      .toEqual([[], '测试数据', true])
    api.libraryLocation.mockResolvedValue({
      root: '/tmp/meridian', source: 'configured', locked: false, restartRequired: true, openError: null,
    })
    await act(async () => { root.render(<MessagesProvider key="pending"><Settings /></MessagesProvider>) })
    expect(states()).toEqual(['重启后生效', '立即重启'])
    const pending = card().querySelector('.storage-pending')!
    expect([pending.matches('.inline-message--box.inline-message--warning[role="status"]'),
      pending.querySelector('.inline-message-action .btn.pri')?.textContent]).toEqual([true, '立即重启'])
    expect(card().querySelector('p')).toBeNull()
  })

  it('存储位置使用共享目录字段，不再另放一个选择按钮', async () => {
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="storage"]')!.click()
    })

    const directory = dialog.querySelector('.storage-root .directory-field')!
    expect(directory.querySelector<HTMLInputElement>('input')?.value).toBe('/tmp/meridian')
    expect(directory.querySelector('input')?.hasAttribute('readonly')).toBe(true)
    expect(directory.querySelector<HTMLButtonElement>('[aria-label="选择论文库根目录…"]')?.disabled)
      .toBe(true)
    expect(directory.querySelector('svg path')?.getAttribute('d')).toBe('M3 6h6l2 2h10v10H3z')
    expect(dialog.querySelector('.storage-root code')).toBeNull()
    expect(dialog.textContent).not.toContain('选择根目录…')
  })

  it('库位置和归档的对话还没读到时都显示同一种载入占位，不写读取中的句子，也不说没有', async () => {
    const never = () => new Promise<never>(() => {})
    api.libraryLocation.mockImplementation(never)
    api.libraryBackups.mockImplementation(never)
    api.chatList.mockImplementationOnce(never)
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="storage"]')!.click() })
    expect(dialog.querySelectorAll('.split-main .loading-placeholder')).toHaveLength(1)
    expect(dialog.querySelector('.split-main .empty-state')).toBeNull()
    expect(dialog.querySelector('.split-main')!.textContent).not.toMatch(/正在读取/)

    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="archived"]')!.click() })
    expect(dialog.querySelector('.split-main .loading-placeholder')).not.toBeNull()
    expect(dialog.querySelector('.split-main .empty-state')).toBeNull()
  })

  it('每个设置页只显示自己那次读取的错误：对话列表读不到时，存储页不报，归档的对话页报', async () => {
    api.chatList.mockImplementationOnce(async () => { throw new CallError('chat.list', 'newer-version') })
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="storage"]')!.click() })
    expect(dialog.querySelector('.split-main [role="alert"]')).toBeNull()

    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="archived"]')!.click() })
    expect(dialog.querySelector('.split-main [role="alert"]')?.textContent).toBe('需要更新 App')
  })

  it('还没有备份时备份这一节整节不显示', async () => {
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="storage"]')!.click() })
    expect([...dialog.querySelectorAll('.section-heading')].map((node) => node.textContent))
      .not.toContain('论文库备份 · 0')
    expect(dialog.querySelector('.split-main .empty-state')).toBeNull()
  })

  it('库打不开时显示所选目录与原因的标签，错误里不带路径，切换和重置仍然可用', async () => {
    api.libraryLocation.mockResolvedValueOnce({
      root: '/tmp/broken-library', source: 'fallback', locked: false, restartRequired: false,
      openError: 'not-library',
    })
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="storage"]')!.click()
    })

    expect(dialog.textContent).not.toContain('正在读取库位置')
    expect(dialog.querySelector('.page-error')?.textContent).toBe('不是 Meridian 论文库')
    expect(dialog.querySelector<HTMLInputElement>('.storage-root input')?.value)
      .toBe('/tmp/broken-library')
    expect(dialog.querySelector<HTMLButtonElement>('[aria-label="选择论文库根目录…"]')?.disabled)
      .toBe(false)
    expect(dialog.querySelector<HTMLButtonElement>('.storage-reset .btn.danger')?.disabled).toBe(false)
  })

  it('备份可直接切换，当前库会由 Core 保存后重启', async () => {
    api.libraryLocation.mockResolvedValueOnce({
      root: '/tmp/meridian', source: 'configured', locked: false, restartRequired: false, openError: null,
    })
    api.libraryBackups.mockResolvedValueOnce([{
      id: 'meridian-backup-20260915-182838Z',
      path: '/tmp/meridian-backup-20260915-182838Z',
      createdAt: '2026-09-15T18:28:38.000Z',
    }])
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="storage"]')!.click()
    })

    expect(dialog.querySelector('.storage-backup-list')).not.toBeNull()
    const at = new Date('2026-09-15T18:28:38.000Z')
    expect([...dialog.querySelectorAll('.storage-backup-row .item-title .date-time-display .date-chip')].map((chip) => chip.textContent))
      .toEqual([`${at.getMonth() + 1}月${at.getDate()}日`, `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`])
    expect(dialog.querySelector('.storage-backup-row .item-meta .storage-backup-path')?.textContent)
      .toBe('/tmp/meridian-backup-20260915-182838Z')
    const switchButton = [...dialog.querySelectorAll<HTMLButtonElement>('.storage-backup-row .item-trailing .btn')]
      .find((button) => button.textContent === '切换')!
    await act(async () => { switchButton.click() })

    expect(api.switchBackup).toHaveBeenCalledWith('meridian-backup-20260915-182838Z')
    expect(api.restartApp).toHaveBeenCalledOnce()
  })

  it('永久删除备份前要求确认，成功后从列表移除，不另弹通知', async () => {
    api.libraryLocation.mockResolvedValueOnce({
      root: '/tmp/meridian', source: 'configured', locked: false, restartRequired: false, openError: null,
    })
    api.libraryBackups.mockResolvedValueOnce([{
      id: 'meridian-backup-20260915-182838Z',
      path: '/tmp/meridian-backup-20260915-182838Z',
      createdAt: '2026-09-15T18:28:38.000Z',
    }])
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="storage"]')!.click()
    })
    const deleteButton = [...dialog.querySelectorAll<HTMLButtonElement>('.storage-backup-row .item-trailing .btn')]
      .find((button) => button.textContent === '删除')!
    await act(async () => { deleteButton.click() })
    expect(api.deleteBackup).not.toHaveBeenCalled()
    expect(document.querySelector('.modal.confirm')?.textContent).toContain('备份文件夹不能恢复')

    const confirm = [...document.querySelectorAll<HTMLButtonElement>('.modal.confirm .btn')]
      .find((button) => button.textContent === '删除')!
    await act(async () => { confirm.click() })
    expect(api.deleteBackup).toHaveBeenCalledWith('meridian-backup-20260915-182838Z')
    expect(dialog.querySelector('.storage-backup-list')).toBeNull()
    expect(dialog.textContent).not.toContain('论文库备份 ·')
    expect(api.success).not.toHaveBeenCalled()
  })

  it('确认删除备份后确认框关上，删除还没完成时那一行的删除按钮在原处转圈、按不动，名字是正在删除', async () => {
    api.libraryLocation.mockResolvedValueOnce({
      root: '/tmp/meridian', source: 'configured', locked: false, restartRequired: false, openError: null,
    })
    api.libraryBackups.mockResolvedValueOnce([{
      id: 'meridian-backup-20260915-182838Z',
      path: '/tmp/meridian-backup-20260915-182838Z',
      createdAt: '2026-09-15T18:28:38.000Z',
    }])
    let finish = () => {}
    api.deleteBackup.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(null) }))
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="storage"]')!.click() })
    await act(async () => { dialog.querySelector<HTMLButtonElement>('.storage-backup-row .item-trailing .btn.danger')!.click() })
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('.modal.confirm .btn')]
      .find((button) => button.textContent === '删除')!
    await act(async () => { confirm.click() })

    expect(document.querySelector('.modal.confirm')).toBeNull()
    const trigger = dialog.querySelector<HTMLButtonElement>('.storage-backup-row .item-trailing .btn.danger')!
    expect([
      trigger.getAttribute('aria-label'), trigger.textContent, trigger.querySelector('.ring.spin') !== null, trigger.disabled,
      trigger.getAttribute('aria-busy'),
    ]).toEqual(['正在删除…', '删除', true, true, 'true'])
    await act(async () => { finish() })
    expect(dialog.querySelector('.storage-backup-list')).toBeNull()
  })

  it('确认重置论文库后确认框关上，重置还没完成时重置按钮在原处转圈、按不动，名字是正在重置，完成后才重启', async () => {
    api.libraryLocation.mockResolvedValueOnce({
      root: '/tmp/meridian', source: 'configured', locked: false, restartRequired: false, openError: null,
    })
    let finish = () => {}
    api.resetLibrary.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({}) }))
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="storage"]')!.click() })
    await act(async () => { dialog.querySelector<HTMLButtonElement>('.storage-reset .btn.danger')!.click() })
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('.modal.confirm .btn')]
      .find((button) => button.textContent === '重置并重启')!
    await act(async () => { confirm.click() })

    expect(document.querySelector('.modal.confirm')).toBeNull()
    const trigger = dialog.querySelector<HTMLButtonElement>('.storage-reset .btn.danger')!
    expect([
      trigger.getAttribute('aria-label'), trigger.textContent, trigger.querySelector('.ring.spin') !== null, trigger.disabled,
      trigger.getAttribute('aria-busy'),
    ]).toEqual(['正在重置…', '重置库…', true, true, 'true'])
    expect(api.restartApp).not.toHaveBeenCalled()
    await act(async () => { finish() })
    expect(api.restartApp).toHaveBeenCalledOnce()
  })

  // With every dialog layer at one z-index (shared/dialog-surface.test.ts), document order decides
  // which paints on top.
  it('设置里弹出的确认框与它的遮罩都排在设置之后,用对话框的面', async () => {
    api.libraryLocation.mockResolvedValueOnce({
      root: '/tmp/meridian', source: 'configured', locked: false, restartRequired: false, openError: null,
    })
    api.libraryBackups.mockResolvedValueOnce([{
      id: 'meridian-backup-20260915-182838Z',
      path: '/tmp/meridian-backup-20260915-182838Z',
      createdAt: '2026-09-15T18:28:38.000Z',
    }])
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const settings = document.querySelector<HTMLElement>('[role="dialog"]')!
    await act(async () => { settings.querySelector<HTMLElement>('[data-setcat="storage"]')!.click() })
    const deleteButton = [...settings.querySelectorAll<HTMLButtonElement>('.storage-backup-row .item-trailing .btn')]
      .find((button) => button.textContent === '删除')!
    await act(async () => { deleteButton.click() })

    const confirm = document.querySelector<HTMLElement>('[role="alertdialog"]')!
    const scrims = [...document.querySelectorAll<HTMLElement>('.scrim')]
    expect(scrims).toHaveLength(2)
    const after = (later: Node, earlier: Node) => (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect([after(scrims[1]!, settings), after(confirm, scrims[1]!)]).toEqual([true, true])
    expect([...confirm.classList]).toEqual(['modal', 'confirm'])
  })

  it('设置用对话框统一的宽面,右上角有关闭按钮,点它关掉设置', async () => {
    api.setOpen.mockClear()
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const settings = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect([settings.classList.contains('modal'), settings.classList.contains('wide')]).toEqual([true, true])
    const close = settings.querySelector<HTMLButtonElement>(':scope > .modal-close')!
    await act(async () => { close.click() })
    expect(api.setOpen).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('模型设置明确区分服务商和协议，并使用共享字段外观', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    expect(dialog.querySelector('select')).toBeNull()
    expect((await openPicker(dialog, '模型服务')).map((item) => item.textContent))
      .toEqual(['OpenAI', 'Anthropic', 'Google Gemini', 'OpenAI 兼容 API', 'Claude 订阅', 'ChatGPT 订阅'])
    await closePicker()
    expect(dialog.querySelector('[aria-label="模型协议"]')?.textContent).toContain('Responses API')
    expect(dialog.querySelectorAll('.model-settings-card .form-control-field').length).toBe(3)
    expect(dialog.querySelector('[aria-label="模型接口地址"]')).toBeNull()

    await pick(dialog, '模型服务', 'OpenAI 兼容 API')
    expect((await openPicker(dialog, '兼容服务模板')).map((item) => item.textContent)).toEqual([
      '模板',
      'DeepSeek · 云端',
      'OpenRouter · 云端聚合',
      'Ollama · 本地',
      'LM Studio · 本地',
      '其他兼容服务',
    ])
    await closePicker()
    expect(dialog.querySelector('[aria-label="模型协议"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型接口地址"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型认证方式"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型名称"]')).toBeNull()

    await pick(dialog, '兼容服务模板', '其他兼容服务')

    expect((await openPicker(dialog, '模型协议')).map((item) => item.textContent))
      .toEqual(['Responses API', 'Chat Completions API'])
    await closePicker()
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型接口地址"]')?.placeholder)
      .toBe('https://api.example.com/v1')
  })

  it('已保存的 API Key 只显示掩码和末四位', async () => {
    api.modelSettings.mockResolvedValueOnce({
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-test', authentication: 'api-key', apiKeyConfigured: true,
      apiKeyLastFour: 'c123', configured: true,
      profiles: [{
        provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-test', authentication: 'api-key', apiKeyConfigured: true,
        apiKeyLastFour: 'c123', configured: true,
      }],
      subscription: { active: null, models: { claude: '', codex: '' }, error: undefined },
    })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    const saved = dialog.querySelector<HTMLButtonElement>('[aria-label="模型 API Key 已保存，末四位 c123"]')!
    expect(saved.textContent).toBe('••••••••c123')
    expect(saved.querySelector('.service-key-mask')?.textContent).toBe('••••••••')
    expect(saved.querySelector('.service-key-tail')?.textContent).toBe('c123')
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型 API Key"]')).toBeNull()
    expect(dialog.textContent).not.toContain('API Key 由操作系统凭据库加密保护')

    await act(async () => { saved.click() })
    const field = dialog.querySelector<HTMLInputElement>('[aria-label="模型 API Key"]')!
    expect(field.value).toBe('')
    expect(field.type).toBe('password')
  })

  it('已存的模型配置读不进来时只显示原因，不叫人检查后重新保存', async () => {
    const unreadable = { ...(await api.modelSettings()), error: 'key-unreadable' as const }
    api.modelSettings.mockResolvedValueOnce(unreadable)
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    expect(dialog.querySelector('.service-error')?.textContent).toBe('没能读取已存的密钥')
    expect(dialog.textContent).not.toContain('key-unreadable')
  })

  it('用最多一个输出 token 测试当前已保存的模型连接', async () => {
    api.modelSettings.mockResolvedValueOnce({
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-test', authentication: 'api-key', apiKeyConfigured: true,
      apiKeyLastFour: 'c123', configured: true,
      profiles: [{
        provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-test', authentication: 'api-key', apiKeyConfigured: true,
        apiKeyLastFour: 'c123', configured: true,
      }],
      subscription: { active: null, models: { claude: '', codex: '' }, error: undefined },
    })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    const test = [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '测试连接')!
    expect(test.disabled).toBe(false)
    await act(async () => { test.click() })

    expect(api.checkModelConnection).toHaveBeenCalledOnce()
    expect(dialog.textContent).toContain('连接成功 · 最多 1 个输出 token')

    const model = dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(model, 'unsaved-model')
      model.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(test.disabled).toBe(true)
    expect(dialog.textContent).not.toContain('连接成功')
  })

  it('模型连接失败时同时显示结论和经过清理的诊断信息', async () => {
    api.modelSettings.mockResolvedValueOnce({
      provider: 'openai-compatible', protocol: 'chat-completions',
      baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash',
      authentication: 'api-key', apiKeyConfigured: true,
      apiKeyLastFour: 'd18b', configured: true,
      profiles: [{
        provider: 'openai-compatible', protocol: 'chat-completions',
        baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash',
        authentication: 'api-key', apiKeyConfigured: true,
        apiKeyLastFour: 'd18b', configured: true,
      }],
      subscription: { active: null, models: { claude: '', codex: '' }, error: undefined },
    })
    api.checkModelConnection.mockResolvedValueOnce({
      state: 'failed', reason: 'model-or-endpoint',
      detail: 'HTTP 404: model deepseek-flash was not found',
      modelCalls: 1, maxOutputTokens: 1,
    })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    const test = [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '测试连接')!
    await act(async () => { test.click() })

    const status = dialog.querySelector('.service-connection-status')!
    expect(status.querySelector('.inline-message-text > div')?.textContent).toBe('没有找到模型或接口')
    expect(status.textContent).toContain('详情: HTTP 404: model deepseek-flash was not found')
  })

  it('切换模型服务时恢复每个服务各自保存的模型和密钥末四位', async () => {
    api.modelSettings.mockResolvedValueOnce({
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-saved', authentication: 'api-key', apiKeyConfigured: true,
      apiKeyLastFour: '1111', configured: true,
      profiles: [{
        provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-saved', authentication: 'api-key', apiKeyConfigured: true,
        apiKeyLastFour: '1111', configured: true,
      }, {
        provider: 'anthropic', protocol: 'messages', baseUrl: 'https://api.anthropic.com',
        model: 'claude-saved', authentication: 'api-key', apiKeyConfigured: true,
        apiKeyLastFour: '2222', configured: true,
      }],
      subscription: { active: null, models: { claude: '', codex: '' }, error: undefined },
    })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'Anthropic')
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.value)
      .toBe('claude-saved')
    expect(dialog.querySelector<HTMLButtonElement>(
      '[aria-label="模型 API Key 已保存，末四位 2222"]',
    )?.textContent).toBe('••••••••2222')

    await pick(dialog, '模型服务', 'OpenAI')
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.value)
      .toBe('gpt-saved')
    expect(dialog.querySelector<HTMLButtonElement>(
      '[aria-label="模型 API Key 已保存，末四位 1111"]',
    )?.textContent).toBe('••••••••1111')
    expect(api.updateModelSettings).not.toHaveBeenCalled()
  })

  it('用一个 OpenAI 兼容入口保存任意第三方的标准协议配置', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    const fill = async (label: string, value: string) => {
      const field = dialog.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        setter.call(field, value)
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    await pick(dialog, '模型服务', 'OpenAI 兼容 API')
    await pick(dialog, '兼容服务模板', '其他兼容服务')
    await pick(dialog, '模型协议', 'Chat Completions API')
    await fill('模型接口地址', 'https://third-party.example/v1')
    await fill('模型名称', 'third-party-model')
    await fill('模型 API Key', 'third-party-secret')
    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')!.click()
    })

    expect(api.updateModelSettings).toHaveBeenCalledWith({
      provider: 'openai-compatible',
      protocol: 'chat-completions',
      baseUrl: 'https://third-party.example/v1',
      model: 'third-party-model',
      authentication: 'api-key',
      apiKey: 'third-party-secret',
    })
  })

  it('服务卡片的头部只写服务名，科研数据源旁只留申请 key 的链接', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    for (const provider of ['OpenAI', 'Anthropic', 'Google Gemini', 'OpenAI 兼容 API']) {
      await pick(dialog, '模型服务', provider)
      expect([dialog.querySelector('.service-card .section-heading')?.firstChild?.textContent, dialog.querySelector('.service-card .section-heading-meta')])
        .toEqual([provider, null])
    }
    expect(dialog.querySelector('.model-template-help')).toBeNull()

    api.requestedCategory = 'research'
    await act(async () => { root.render(<MessagesProvider key="research"><Settings /></MessagesProvider>) })
    expect(document.querySelector('.setdlg .service-card .section-heading-meta')?.textContent).toBe('申请 key')
  })

  it('服务卡片的头部在字段的行之前,不在行里:字段之间的空隙不叠到头部下面', async () => {
    /** The kinds of a card's first two parts, by their first class. */
    const head = () => [...document.querySelector('.setdlg .service-card')!.children].slice(0, 2).map((part) => part.className.split(' ')[0])
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    expect(head()).toEqual(['section-heading', 'field-rows'])
    api.requestedCategory = 'research'
    await act(async () => { root.render(<MessagesProvider key="research"><Settings /></MessagesProvider>) })
    expect(head()).toEqual(['section-heading', 'field-rows'])
  })

  it('常用模板只要求用户填写模型 ID 和需要的密钥', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'OpenAI 兼容 API')
    await pick(dialog, '兼容服务模板', 'DeepSeek · 云端')

    expect(dialog.querySelector('[aria-label="模板连接信息"]')?.textContent)
      .toContain('Chat Completions API · API Key')
    expect(dialog.querySelector('[aria-label="模板连接信息"]')?.textContent)
      .toContain('https://api.deepseek.com')
    expect(dialog.querySelector('[aria-label="模型协议"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型接口地址"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型认证方式"]')).toBeNull()
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.placeholder)
      .toBe('模型 ID')
    expect(dialog.querySelector('[aria-label="模型 API Key"]')).not.toBeNull()

    await pick(dialog, '兼容服务模板', 'Ollama · 本地')
    expect(dialog.querySelector('[aria-label="模板连接信息"]')?.textContent)
      .toContain('Responses API · 无需认证')
    expect(dialog.querySelector('[aria-label="模型 API Key"]')).toBeNull()
  })

  /** Types `value` into the field named `label` in `dialog`. */
  const fill = async (dialog: Element, label: string, value: string) => {
    const field = dialog.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  /** The label and the text of each field row of the model card. */
  const modelRows = (dialog: Element) => [...dialog.querySelectorAll('.model-settings-card .field-row')]
    .map((row) => [row.querySelector('.field-row-label')?.textContent, row.querySelector('.field-row-field')?.textContent])
  const testButton = (dialog: Element) => [...dialog.querySelectorAll<HTMLButtonElement>('.model-settings-card button')]
    .find((button) => button.textContent === '测试连接')!

  it('选 Claude 订阅时显示找到的 CLI 版本和完成色的已用订阅登录，不要 API Key；保存后测试连接不调用模型也成功', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'Claude 订阅')

    expect(api.subscriptionStatus).toHaveBeenCalledWith('claude')
    expect(dialog.querySelector('.model-settings-card .section-heading')?.firstChild?.textContent).toBe('Claude 订阅')
    expect(modelRows(dialog)).toEqual([
      ['模型服务', 'Claude 订阅'], ['CLI', 'Claude Code 2.1.3'], ['登录', '已用订阅登录'], ['模型 ID', ''],
    ])
    expect(dialog.querySelector('.model-settings-card .field-row .tag')?.classList.contains('tag--done')).toBe(true)
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.placeholder).toBe('默认')
    expect(dialog.querySelector('[aria-label="模型 API Key"]')).toBeNull()
    expect(dialog.querySelector('.model-settings-card .service-status-pill')?.textContent).toBe('未配置')
    expect(testButton(dialog).disabled).toBe(true)

    await act(async () => { dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')!.click() })
    expect(api.updateSubscription).toHaveBeenCalledWith({ cli: 'claude', model: '' })
    expect(api.updateModelSettings).not.toHaveBeenCalled()
    expect(dialog.querySelector('.model-settings-card .service-status-pill')?.textContent).toBe('已配置')

    api.checkModelConnection.mockResolvedValueOnce({ state: 'connected', modelCalls: 0, maxOutputTokens: 1 })
    await act(async () => { testButton(dialog).click() })
    expect(api.checkModelConnection).toHaveBeenCalledOnce()
    expect(dialog.querySelector('.service-connection-status')?.textContent).toBe('连接成功 · 未调用模型')
    expect(api.subscriptionStatus).toHaveBeenCalledTimes(2)
  })

  it('订阅的连接测试失败时，标题说出 CLI 的问题：没有找到、版本不受支持或未用订阅登录', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await pick(dialog, '模型服务', 'Claude 订阅')
    await act(async () => { dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')!.click() })

    const headlines = []
    for (const [reason, detail] of [
      ['cli-missing', '没有找到 claude 命令'], ['cli-unsupported', '这个版本的 claude 不支持 Meridian 需要的选项，请更新'],
      ['cli-signed-out', 'claude 还没有登录'],
    ] as const) {
      api.checkModelConnection.mockResolvedValueOnce({ state: 'failed', reason, detail, modelCalls: 0, maxOutputTokens: 1 })
      await act(async () => { testButton(dialog).click() })
      const status = dialog.querySelector('.model-settings-card .service-connection-status')!
      headlines.push([status.querySelector('.inline-message-text > div')?.textContent, status.textContent?.includes(detail)])
    }
    expect(headlines).toEqual([['没有找到 CLI', true], ['CLI 版本不受支持', true], ['未用订阅登录', true]])
  })

  it('订阅的模型按 CLI 各存一份，选 ChatGPT 订阅时用 Codex 和它自己的模型', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'ChatGPT 订阅')
    await fill(dialog, '模型名称', 'gpt-5-codex')
    await act(async () => { dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')!.click() })

    expect(api.subscriptionStatus).toHaveBeenCalledWith('codex')
    expect(modelRows(dialog)[1]).toEqual(['CLI', 'Codex 2.1.3'])
    expect(api.updateSubscription).toHaveBeenCalledWith({ cli: 'codex', model: 'gpt-5-codex' })
  })

  it('没有找到 CLI 时 CLI 一行是一条提醒行，没有登录一行', async () => {
    api.subscriptionStatus.mockResolvedValueOnce({ state: 'missing' })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'Claude 订阅')

    const line = dialog.querySelector('.model-settings-card .field-row .inline-message')
    expect([line?.classList.contains('inline-message--line'), line?.classList.contains('inline-message--warning'), line?.textContent])
      .toEqual([true, true, '没有找到'])
    expect(modelRows(dialog).map(([label]) => label)).toEqual(['模型服务', 'CLI', '模型 ID'])
  })

  it.each([
    ['2.0.1', '2.0.1 · 版本不受支持'],
    [null, '版本不受支持'],
  ] as const)('CLI 不支持 Meridian 要的选项时 CLI 一行和没找到一样是一条提醒行，带上版本 %s；没有登录一行，也不能存成在用的模型', async (version, text) => {
    api.subscriptionStatus.mockResolvedValueOnce({ state: 'unsupported', version })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'Claude 订阅')

    const line = dialog.querySelector('.model-settings-card .field-row .inline-message')
    expect([line?.classList.contains('inline-message--line'), line?.classList.contains('inline-message--warning'), line?.textContent])
      .toEqual([true, true, text])
    expect(modelRows(dialog).map(([label]) => label)).toEqual(['模型服务', 'CLI', '模型 ID'])
    expect(dialog.querySelector('.model-settings-card .command-tray')).toBeNull()
    expect(dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')?.disabled).toBe(true)

    await pick(dialog, '模型服务', 'OpenAI')
    expect(dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')?.disabled).toBe(false)
  })

  /** Whether the model card's Save can be pressed. */
  const canSave = (dialog: Element) => dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')?.disabled === false

  it('订阅只有在它的 CLI 找到且支持时才能存成在用的模型：没找到、还在查、查不出来都不能存', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    api.subscriptionStatus.mockResolvedValueOnce({ state: 'missing' })
    await pick(dialog, '模型服务', 'Claude 订阅')
    expect(canSave(dialog)).toBe(false)

    api.subscriptionStatus.mockReturnValueOnce(new Promise(() => {}))
    await pick(dialog, '模型服务', 'ChatGPT 订阅')
    expect(dialog.querySelector('.model-settings-card .field-row .loading-placeholder')).not.toBeNull()
    expect(canSave(dialog)).toBe(false)

    api.subscriptionStatus.mockRejectedValueOnce(new CallError('harness.subscriptionStatus', 'unavailable'))
    await pick(dialog, '模型服务', 'Claude 订阅')
    expect(canSave(dialog)).toBe(false)

    await pick(dialog, '模型服务', 'ChatGPT 订阅')
    expect(canSave(dialog)).toBe(true)
  })

  it('测试连接后再查 CLI 查不出来时，先前找到的结果不算数，也不能存', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await pick(dialog, '模型服务', 'Claude 订阅')
    await act(async () => { dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')!.click() })

    api.subscriptionStatus.mockRejectedValueOnce(new CallError('harness.subscriptionStatus', 'unavailable'))
    await act(async () => { testButton(dialog).click() })

    expect(dialog.querySelector('.model-settings-card .field-row .inline-message--error')).not.toBeNull()
    expect(canSave(dialog)).toBe(false)
  })

  it('读不出 CLI 的版本时 CLI 一行只写它的名字', async () => {
    api.subscriptionStatus.mockResolvedValueOnce({ state: 'found', version: null, signIn: 'subscription', models: [] })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'ChatGPT 订阅')

    expect(modelRows(dialog)[1]).toEqual(['CLI', 'Codex'])
  })

  it.each([
    ['signed-out', '未登录'],
    ['other', '未用订阅登录'],
    ['unknown', '读不出登录状态'],
  ] as const)('CLI 登录方式是 %s 时登录一行是提醒色的标签', async (signIn, text) => {
    api.subscriptionStatus.mockResolvedValueOnce({ state: 'found', version: '2.1.3', signIn, models: [] })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'Claude 订阅')

    const tag = dialog.querySelector('.model-settings-card .field-row .tag')!
    expect([tag.textContent, tag.classList.contains('tag--warning')]).toEqual([text, true])
  })

  it('已选订阅时打开模型设置就是这个订阅和它的模型；切回 API 服务恢复它保存的配置，但它不在用，不能测试', async () => {
    api.modelSettings.mockResolvedValueOnce({
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-saved', authentication: 'api-key', apiKeyConfigured: true,
      apiKeyLastFour: '1111', configured: true,
      profiles: [{
        provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-saved', authentication: 'api-key', apiKeyConfigured: true,
        apiKeyLastFour: '1111', configured: true,
      }],
      subscription: { active: 'codex', models: { claude: 'opus', codex: 'gpt-5-codex' }, error: undefined },
    })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    expect(dialog.querySelector('[aria-label="模型服务"]')?.textContent).toBe('ChatGPT 订阅')
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.value).toBe('gpt-5-codex')
    expect(dialog.querySelector('.model-settings-card .service-status-pill')?.textContent).toBe('已配置')
    expect(testButton(dialog).disabled).toBe(false)

    await pick(dialog, '模型服务', 'Claude 订阅')
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.value).toBe('opus')
    expect(testButton(dialog).disabled).toBe(true)

    await pick(dialog, '模型服务', 'OpenAI')
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.value).toBe('gpt-saved')
    expect(dialog.querySelector('[aria-label="模型 API Key 已保存，末四位 1111"]')).not.toBeNull()
    expect(modelRows(dialog).map(([label]) => label)).not.toContain('CLI')
    expect(testButton(dialog).disabled).toBe(true)
  })

  /** The text of each candidate row the open model list shows. */
  const modelCandidates = () => [...document.querySelectorAll('.pickhits .rrow')].map((row) => row.textContent)
  /** Focuses the model field of `dialog`, which opens its list. */
  const focusModel = async (dialog: Element) => {
    await act(async () => { dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')!.focus() })
  }
  const keyOnModel = async (dialog: Element, key: string) => {
    await act(async () => {
      dialog.querySelector('[aria-label="模型名称"]')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  }

  it('订阅没用订阅登录时卡片里有一条登录命令，和扩展的安装命令同一种：复制后按钮就地亮出对勾', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    api.subscriptionStatus.mockResolvedValueOnce({ state: 'found', version: '2.1.3', signIn: 'signed-out', models: [] })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'Claude 订阅')

    const tray = dialog.querySelector('.model-settings-card .command-tray')!
    expect([tray.querySelector('.command-tray-heading')?.textContent, tray.querySelector('.command-tray-summary code')?.textContent])
      .toEqual(['登录命令', 'claude auth login'])
    const copy = tray.querySelector<HTMLButtonElement>('button[aria-label="复制 Claude Code 登录命令"]')!
    await act(async () => { copy.click() })
    expect(writeText).toHaveBeenCalledWith('claude auth login')
    expect(copy.getAttribute('aria-label')).toBe('已复制')
  })

  it.each([
    ['other', 'codex login'],
    ['unknown', 'codex login'],
    ['subscription', null],
  ] as const)('Codex 登录方式是 %s 时登录命令是 %s', async (signIn, command) => {
    api.subscriptionStatus.mockResolvedValueOnce({ state: 'found', version: '0.163.0', signIn, models: [] })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'ChatGPT 订阅')

    expect(dialog.querySelector('.model-settings-card .command-tray code')?.textContent ?? null).toBe(command)
  })

  it('没有找到 CLI 时不给登录命令', async () => {
    api.subscriptionStatus.mockResolvedValueOnce({ state: 'missing' })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'Claude 订阅')

    expect(dialog.querySelector('.model-settings-card .command-tray')).toBeNull()
  })

  it('订阅的模型是一个候选字段：聚焦就列出默认和 CLI 接受的模型，勾着当前的；点一个就选它', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await pick(dialog, '模型服务', 'Claude 订阅')
    expect(modelCandidates()).toEqual([])

    await focusModel(dialog)
    expect(modelCandidates()).toEqual(['默认', 'opus', 'sonnet'])
    expect([...document.querySelectorAll('.pickhits .rrow')].map((row) => row.querySelector('.ck svg') !== null))
      .toEqual([true, false, false])

    await act(async () => { [...document.querySelectorAll<HTMLElement>('.pickhits .rrow')][1]!.click() })
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.value).toBe('opus')
    expect(modelCandidates()).toEqual([])
    await act(async () => { dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')!.click() })
    expect(api.updateSubscription).toHaveBeenCalledWith({ cli: 'claude', model: 'opus' })
  })

  it('在模型字段里打字只留含它的模型，不在里面的名字有一行新建；回车用它，Esc 收起列表', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await pick(dialog, '模型服务', 'Claude 订阅')
    await focusModel(dialog)

    await fill(dialog, '模型名称', 'son')
    expect(modelCandidates()).toEqual(['sonnet', 'son'])
    expect(document.querySelector('.pickhits .rrow.mk')?.getAttribute('aria-label')).toBe('使用 son')

    await fill(dialog, '模型名称', 'claude-fable-5')
    expect(modelCandidates()).toEqual(['claude-fable-5'])
    await keyOnModel(dialog, 'Enter')
    expect(modelCandidates()).toEqual([])
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.value).toBe('claude-fable-5')

    await fill(dialog, '模型名称', 'op')
    expect(modelCandidates()).toEqual(['opus', 'op'])
    await keyOnModel(dialog, 'Escape')
    expect(modelCandidates()).toEqual([])
    await act(async () => { dialog.querySelector<HTMLButtonElement>('.service-actions .btn.pri')!.click() })
    expect(api.updateSubscription).toHaveBeenCalledWith({ cli: 'claude', model: 'op' })
  })

  it('打开模型列表时亮着的是当前的模型，直接回车不换模型', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await pick(dialog, '模型服务', 'Claude 订阅')
    await focusModel(dialog)
    await act(async () => { [...document.querySelectorAll<HTMLElement>('.pickhits .rrow')][2]!.click() })

    await act(async () => { dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')!.blur() })
    await focusModel(dialog)
    expect(document.querySelector('.pickhits .rrow.on')?.textContent).toBe('sonnet')
    await keyOnModel(dialog, 'Enter')
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.value).toBe('sonnet')
  })

  it('CLI 不列模型时模型列表只有默认', async () => {
    api.subscriptionStatus.mockResolvedValueOnce({ state: 'found', version: '0.163.0', signIn: 'subscription', models: [] })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await pick(dialog, '模型服务', 'ChatGPT 订阅')

    await focusModel(dialog)

    expect(modelCandidates()).toEqual(['默认'])
  })

  it('读不到 CLI 的状态时原因写在 CLI 一行里，不在屏头', async () => {
    api.subscriptionStatus.mockRejectedValueOnce(new CallError('harness.subscriptionStatus', 'unavailable'))
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    await pick(dialog, '模型服务', 'Claude 订阅')

    const line = dialog.querySelector('.model-settings-card .field-row .inline-message--error')
    expect(line?.textContent).not.toBe('')
    expect(dialog.querySelector('.page-error')).toBeNull()
  })

  it('存的订阅选择读不出来时只显示原因', async () => {
    api.modelSettings.mockResolvedValueOnce({
      ...(await api.modelSettings()), subscription: { active: null, models: { claude: '', codex: '' }, error: 'newer-version' },
    })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })

    expect(document.querySelector('.setdlg .service-error')?.textContent).toBe('需要更新 App')
  })

  const newer = (method: 'extensions.status' | 'library.location' | 'chat.list' | 'harness.modelSettings' | 'delivery.semanticKey') =>
    new CallError(method, 'newer-version')
  const render = (revision = api.revision) => {
    api.revision = revision
    return act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
  }
  const shownFailure = () => {
    const dialog = document.querySelector('.setdlg')!
    return [
      dialog.querySelector('.split-main-head .page-error')?.textContent ?? null,
      dialog.querySelector('.split-main-body .page-error')?.textContent ?? null,
      dialog.querySelectorAll('.split-main-body .loading-placeholder').length,
    ]
  }

  it('读扩展状态失败时，扩展一栏不停在读取占位上，屏头写出原因；下一次读成功时原因收起', async () => {
    api.requestedCategory = 'extensions'
    api.extensionStatus.mockRejectedValueOnce(newer('extensions.status'))
    await render()
    expect(shownFailure()).toEqual(['需要更新 App', null, 0])
    await render(1)
    expect(shownFailure()).toEqual([null, null, 0])
    expect(document.querySelector('.setdlg .split-main-body')!.textContent).toContain('Codex')
  })

  it('读论文库位置失败时，原因写在论文库那张卡片里，不再停在读取占位上，也不在屏头重复', async () => {
    api.requestedCategory = 'storage'
    api.libraryLocation.mockRejectedValueOnce(newer('library.location'))
    await render()
    expect(shownFailure()).toEqual([null, '需要更新 App', 0])
    expect(document.querySelector('.setdlg .storage-card .page-error')?.textContent).toBe('需要更新 App')
  })

  it('读对话列表失败时，归档的对话一栏不停在读取占位上，屏头写出原因', async () => {
    api.requestedCategory = 'archived'
    api.chatList.mockRejectedValueOnce(newer('chat.list'))
    await render()
    expect(shownFailure()).toEqual(['需要更新 App', null, 0])
  })

  it('前一次读取的失败晚到，不盖过后一次已经读成功的', async () => {
    api.requestedCategory = 'extensions'
    let failEarlier: (cause: unknown) => void = () => {}
    api.extensionStatus.mockImplementationOnce(() => new Promise((_, reject) => { failEarlier = reject }))
    await render()
    await render(1)
    await act(async () => { failEarlier(newer('extensions.status')) })
    expect(shownFailure()).toEqual([null, null, 0])
  })

  it('读模型设置失败时，模型一栏写出原因，不停在读取占位上；回到这一栏再读成功时原因收起', async () => {
    api.requestedCategory = 'model'
    api.modelSettings.mockRejectedValueOnce(newer('harness.modelSettings'))
    await render()
    expect(shownFailure()).toEqual([null, '需要更新 App', 0])
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="research"]')!.click() })
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="model"]')!.click() })
    expect(shownFailure()).toEqual([null, null, 0])
    expect(dialog.querySelector('[aria-label="模型协议"]')).not.toBeNull()
  })

  it('读 Semantic Scholar key 失败时，这一栏写出原因，而不是什么都不显示', async () => {
    api.requestedCategory = 'research'
    api.semanticKey.mockRejectedValueOnce(newer('delivery.semanticKey'))
    await render()
    expect(shownFailure()).toEqual([null, '需要更新 App', 0])
  })
})
