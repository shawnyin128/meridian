// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HarnessModelConnectionCheckResult, LibraryBackup, LibraryLocation, SemanticKeyCheckResult, SemanticKeyStatus,
} from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import type { SettingsCategory } from '../shell/AppShell.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

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
  })),
  updateModelSettings: vi.fn(async () => ({
    provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'gpt-test',
    authentication: 'api-key', apiKeyConfigured: true, apiKeyLastFour: 'cret', configured: true,
    profiles: [{
      provider: 'openai', protocol: 'responses', baseUrl: 'https://api.openai.com/v1', model: 'gpt-test',
      authentication: 'api-key', apiKeyConfigured: true, apiKeyLastFour: 'cret', configured: true,
    }],
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
    root: '/tmp/meridian', source: 'fixture' as const, locked: true, restartRequired: false,
  })),
  libraryBackups: vi.fn(async (): Promise<LibraryBackup[]> => []),
  switchBackup: vi.fn(async () => ({
    root: '/tmp/meridian', backupRoot: '/tmp/meridian-backup-current',
  })),
  deleteBackup: vi.fn(async () => null),
  restartApp: vi.fn(),
  banner: vi.fn(),
}))

vi.mock('../ipc.js', () => ({
  appMenu: {
    chooseLibraryRoot: vi.fn(async () => null), restartApp: api.restartApp,
  },
  chat: { list: vi.fn(async () => []), setArchived: vi.fn(async () => {}) },
  library: {
    location: api.libraryLocation,
    backups: api.libraryBackups,
    switchBackup: api.switchBackup,
    deleteBackup: api.deleteBackup,
    configure: vi.fn(), reset: vi.fn(),
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
  },
  extensions: { status: api.extensionStatus, pluginVersion: api.pluginVersion, checkLatest: api.checkLatest },
}))
vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => api.banner,
  useJump: () => ({ open: vi.fn() }),
  useSettingsOpen: () => ({
    open: true, requestedCategory: api.requestedCategory, setOpen: api.setOpen, openCategory: vi.fn(),
  }),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))
vi.mock('./Watches.js', () => ({ WatchSettings: () => <div data-testid="watch-settings">关注配置</div> }))
vi.mock('../components/settings/DiscoverySettings.js', () => ({
  DiscoverySettings: () => <div data-testid="discovery-settings">发现方向配置</div>,
}))

const { Settings } = await import('./Settings.js')

describe('Settings', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.appearance
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
    api.updateDeliverySettings.mockClear()
    api.updateModelSettings.mockClear()
    api.checkModelConnection.mockClear()
    api.semanticKey.mockClear()
    api.semanticKey.mockResolvedValue({ configured: false })
    api.setSemanticKey.mockClear()
    api.setSemanticKey.mockResolvedValue({ configured: false })
    api.checkSemanticKey.mockClear()
    api.checkSemanticKey.mockResolvedValue({ state: 'connected' })
    api.extensionStatus.mockClear()
    api.libraryLocation.mockClear()
    api.libraryLocation.mockResolvedValue({
      root: '/tmp/meridian', source: 'fixture', locked: true, restartRequired: false,
    })
    api.libraryBackups.mockClear()
    api.libraryBackups.mockResolvedValue([])
    api.switchBackup.mockClear()
    api.deleteBackup.mockClear()
    api.restartApp.mockClear()
    api.banner.mockClear()
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
    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('.delivery-setting-control .btn')!.click()
    })
    expect(api.updateDeliverySettings).toHaveBeenCalledWith({ maxItemsPerRun: 12 })
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

  it('科研数据源总览显示 Semantic Scholar 当已配置 key', async () => {
    api.semanticKey.mockResolvedValueOnce({ configured: true, lastFour: 'ab12' })
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => { dialog.querySelector<HTMLElement>('[data-setcat="api"]')!.click() })
    expect(dialog.querySelector('[data-api="research"] .api-state')?.textContent).toBe('Semantic Scholar')
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

  it('未配置 key 时科研卡片显示未配置，测试连接不可用', async () => {
    api.requestedCategory = 'research'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    const card = dialog.querySelector('.semantic-key-card')!
    expect(card.querySelector('.service-status-pill')?.textContent).toBe('未配置')
    const buttons = [...card.querySelectorAll<HTMLButtonElement>('button')]
    expect(buttons.find((b) => b.textContent === '测试连接')!.disabled).toBe(true)
    expect(buttons.find((b) => b.textContent === '保存配置')!.disabled).toBe(true)
    expect(buttons.some((b) => b.textContent === '清除已保存的 Key')).toBe(false)
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
    expect(card.querySelector('.service-connection-status')?.textContent).toContain('连接成功')

    api.checkSemanticKey.mockResolvedValueOnce({
      state: 'failed', reason: 'authentication', detail: 'HTTP 401',
    })
    await act(async () => { test.click() })
    const status = card.querySelector('.service-connection-status')!
    expect(status.textContent).toContain('认证失败，请检查 API Key。')
    expect(status.textContent).toContain('HTTP 401')
  })

  it('扩展设置显示 Core 检查结果:已安装的给更新命令,未安装的给安装命令', async () => {
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
    expect(dialog.querySelector('[data-extension="codex"] .extension-command-summary span')?.textContent)
      .toBe('更新命令')
    expect(dialog.querySelector('[data-extension="claude-code"] code')?.textContent)
      .toBe('claude install command')
    expect(dialog.querySelector('[data-extension-tutorial]')?.textContent)
      .toContain('在 Coding Agent 中使用 Meridian')
    // The first row is the plugin version the skills and MCP share, not the app's own version.
    const pluginRow = dialog.querySelector('[data-plugin-version="0.0.1"]')!
    expect(pluginRow.querySelector('h3')?.textContent).toBe('Meridian Plugin')
    expect(pluginRow.querySelector('.extension-state')?.textContent).toBe('最新 0.0.1')
    expect(pluginRow.querySelector('p')?.textContent).toContain('还没联网检查过')
    api.pluginVersion.mockResolvedValueOnce({ version: '0.0.2', checkedAt: '2026-09-22T08:00:00.000Z' })
    await act(async () => {
      pluginRow.querySelector<HTMLButtonElement>('button')!.click()
    })
    expect(api.checkLatest).toHaveBeenCalledOnce()
    const checked = dialog.querySelector('[data-plugin-version="0.0.2"]')!
    expect(checked.querySelector('.extension-state')?.textContent).toBe('最新 0.0.2')
    expect(checked.querySelector('p')?.textContent).toContain('上次检查')

    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('[aria-label="复制 Claude Code 安装命令"]')!.click()
    })
    expect(writeText).toHaveBeenCalledWith('claude install command')
    expect(api.banner).toHaveBeenCalledWith('Claude Code 命令已复制')

    const firstPrompt = dialog.querySelector('.extension-prompt p')?.textContent ?? ''
    await act(async () => {
      dialog.querySelector<HTMLButtonElement>('.extension-prompt button')!.click()
    })
    expect(writeText).toHaveBeenLastCalledWith(firstPrompt)
    expect(api.banner).toHaveBeenLastCalledWith('提示词已复制')
  })

  it('外观设置用三张预览卡选择浅色、深色或跟随系统', async () => {
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    await act(async () => {
      dialog.querySelector<HTMLElement>('[data-setcat="appearance"]')!.click()
    })

    const choices = [...dialog.querySelectorAll<HTMLButtonElement>('.appearance-choice')]
    expect(choices.map((choice) => choice.textContent)).toEqual(['浅色', '深色', '跟随系统'])
    expect(dialog.querySelectorAll('.appearance-preview')).toHaveLength(3)
    expect(dialog.querySelectorAll('.appearance-preview.system .appearance-mini')).toHaveLength(2)
    expect(choices[2]!.getAttribute('aria-checked')).toBe('true')

    await act(async () => { choices[1]!.click() })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('meridian.appearance')).toBe('dark')
    expect(choices[1]!.getAttribute('aria-checked')).toBe('true')

    await act(async () => { choices[0]!.click() })
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(document.documentElement.dataset.appearance).toBe('light')
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
    expect(directory.querySelector<HTMLButtonElement>('[aria-label="选择论文库根目录"]')?.disabled)
      .toBe(true)
    expect(directory.querySelector('svg path')?.getAttribute('d')).toBe('M3 6h6l2 2h10v10H3z')
    expect(dialog.querySelector('.storage-root code')).toBeNull()
    expect(dialog.textContent).not.toContain('选择根目录…')
  })

  it('备份可直接切换，当前库会由 Core 保存后重启', async () => {
    api.libraryLocation.mockResolvedValueOnce({
      root: '/tmp/meridian', source: 'configured', locked: false, restartRequired: false,
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
    expect(dialog.querySelector('.storage-backup-copy span')?.textContent)
      .toBe('/tmp/meridian-backup-20260915-182838Z')
    const switchButton = [...dialog.querySelectorAll<HTMLButtonElement>('.storage-backup-actions .btn')]
      .find((button) => button.textContent === '切换')!
    await act(async () => { switchButton.click() })

    expect(api.switchBackup).toHaveBeenCalledWith('meridian-backup-20260915-182838Z')
    expect(api.restartApp).toHaveBeenCalledOnce()
  })

  it('永久删除备份前要求确认，成功后从列表移除', async () => {
    api.libraryLocation.mockResolvedValueOnce({
      root: '/tmp/meridian', source: 'configured', locked: false, restartRequired: false,
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
    const deleteButton = [...dialog.querySelectorAll<HTMLButtonElement>('.storage-backup-actions .btn')]
      .find((button) => button.textContent === '删除')!
    await act(async () => { deleteButton.click() })
    expect(api.deleteBackup).not.toHaveBeenCalled()
    expect(document.querySelector('.cfpop')?.textContent).toContain('永久删除')

    const confirm = [...document.querySelectorAll<HTMLButtonElement>('.cfpop .btn')]
      .find((button) => button.textContent === '删除')!
    await act(async () => { confirm.click() })
    expect(api.deleteBackup).toHaveBeenCalledWith('meridian-backup-20260915-182838Z')
    expect(dialog.querySelector('.storage-backup-list')).toBeNull()
    expect(dialog.textContent).toContain('暂无论文库备份')
    expect(api.banner).toHaveBeenCalledWith('备份已删除')
  })

  it('模型设置明确区分服务商和协议，并使用共享字段外观', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    const provider = dialog.querySelector<HTMLSelectElement>('[aria-label="模型服务"]')!
    expect([...provider.options].map((option) => option.textContent))
      .toEqual(['OpenAI', 'Anthropic', 'Google Gemini', 'OpenAI 兼容 API'])
    expect(dialog.querySelector('[aria-label="模型协议"]')?.textContent).toContain('Responses API')
    expect(dialog.querySelectorAll('.model-settings-card .form-control-field').length).toBe(3)
    expect(dialog.querySelector('[aria-label="模型接口地址"]')).toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
      setter.call(provider, 'openai-compatible')
      provider.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const templates = dialog.querySelector<HTMLSelectElement>('[aria-label="兼容服务模板"]')!
    expect([...templates.options].map((option) => option.textContent)).toEqual([
      '选择常用服务…',
      'DeepSeek（云端）',
      'OpenRouter（云端聚合）',
      'Ollama（本地）',
      'LM Studio（本地）',
      '其他兼容服务（手动配置）',
    ])
    expect(dialog.querySelector('[aria-label="模型协议"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型接口地址"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型认证方式"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型名称"]')).toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
      setter.call(templates, 'custom')
      templates.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const protocol = dialog.querySelector<HTMLSelectElement>('[aria-label="模型协议"]')!
    expect([...protocol.options].map((option) => option.textContent))
      .toEqual(['Responses API', 'Chat Completions API'])
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型接口地址"]')?.placeholder)
      .toBe('例如 https://api.example.com/v1')
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
    })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    const test = [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '测试连接')!
    expect(test.disabled).toBe(false)
    expect(test.title).toBe('发送 1 次请求，最多生成 1 个输出 token。')
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
    expect(status.textContent).toContain('没有找到模型或接口。')
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
    })
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!

    const provider = dialog.querySelector<HTMLSelectElement>('[aria-label="模型服务"]')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
      setter.call(provider, 'anthropic')
      provider.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.value)
      .toBe('claude-saved')
    expect(dialog.querySelector<HTMLButtonElement>(
      '[aria-label="模型 API Key 已保存，末四位 2222"]',
    )?.textContent).toBe('••••••••2222')

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
      setter.call(provider, 'openai')
      provider.dispatchEvent(new Event('change', { bubbles: true }))
    })
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

    const select = async (label: string, value: string) => {
      const field = dialog.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
        setter.call(field, value)
        field.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }
    const fill = async (label: string, value: string) => {
      const field = dialog.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        setter.call(field, value)
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    await select('模型服务', 'openai-compatible')
    await select('兼容服务模板', 'custom')
    await select('模型协议', 'chat-completions')
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

  it('常用模板只要求用户填写模型 ID 和需要的密钥', async () => {
    api.requestedCategory = 'model'
    await act(async () => { root.render(<MessagesProvider><Settings /></MessagesProvider>) })
    const dialog = document.querySelector('.setdlg')!
    const setSelect = async (label: string, value: string) => {
      const field = dialog.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
        setter.call(field, value)
        field.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }

    await setSelect('模型服务', 'openai-compatible')
    await setSelect('兼容服务模板', 'deepseek')

    expect(dialog.querySelector('[aria-label="模板连接信息"]')?.textContent)
      .toContain('Chat Completions API · API Key')
    expect(dialog.querySelector('[aria-label="模板连接信息"]')?.textContent)
      .toContain('https://api.deepseek.com')
    expect(dialog.querySelector('[aria-label="模型协议"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型接口地址"]')).toBeNull()
    expect(dialog.querySelector('[aria-label="模型认证方式"]')).toBeNull()
    expect(dialog.querySelector<HTMLInputElement>('[aria-label="模型名称"]')?.placeholder)
      .toBe('输入 DeepSeek 模型 ID')
    expect(dialog.querySelector('[aria-label="模型 API Key"]')).not.toBeNull()

    await setSelect('兼容服务模板', 'ollama')
    expect(dialog.querySelector('[aria-label="模板连接信息"]')?.textContent)
      .toContain('Responses API · 无需认证')
    expect(dialog.querySelector('[aria-label="模型 API Key"]')).toBeNull()
  })
})
