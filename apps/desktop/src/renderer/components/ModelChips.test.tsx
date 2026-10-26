// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatModelChoice, HarnessModelEntry, HarnessModelSettings, HarnessModelSourceGroup, HarnessSubscriptionStatus,
} from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const core = vi.hoisted(() => ({
  /** The model settings Core answers with. */
  settings: null as unknown as HarnessModelSettings,
  choice: { source: null } as ChatModelChoice,
  setModel: vi.fn(),
  /** Answers each CLI's status read; a test replaces one to hold it. */
  status: vi.fn(),
  openCategory: vi.fn(),
  refusal: vi.fn(),
}))
vi.mock('../ipc.js', () => ({
  chat: { model: () => Promise.resolve(core.choice), setModel: core.setModel },
  harness: { modelSettings: () => Promise.resolve(core.settings), subscriptionStatus: core.status },
}))
vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: core.refusal }),
  useSettingsOpen: () => ({ open: false, openCategory: core.openCategory }),
}))

const { ModelChips } = await import('./ModelChips.js')
const { ModelStatusContext, useCoreModelStatus } = await import('../hooks/useModelStatus.js')

const OPENAI = { kind: 'api', profile: 'openai' } as const
const ANTHROPIC = { kind: 'api', profile: 'anthropic' } as const
const LOCAL = { kind: 'api', profile: 'openai-compatible:http://127.0.0.1:11434/v1' } as const
const CLAUDE = { kind: 'cli', cli: 'claude' } as const
const CODEX = { kind: 'cli', cli: 'codex' } as const
const entry = (id: string, source: HarnessModelEntry['source'], model: string, extra: Partial<HarnessModelEntry> = {}): HarnessModelEntry =>
  ({ id, source, model, configured: true, ...extra })
/**
 * Two OpenAI models without a key, two Anthropic API models whose source switches to the second, a
 * local service, Claude's opus at high, the default, and sonnet, and Codex's own default model.
 */
const MODELS = [
  entry('gpt', OPENAI, 'gpt-6.1', { effort: 'medium', configured: false }), entry('gpt-mini', OPENAI, 'gpt-6.1-mini', { configured: false }),
  entry('api-opus', ANTHROPIC, 'claude-opus-5-5'), entry('api-sonnet', ANTHROPIC, 'claude-sonnet-5'),
  entry('qwen', LOCAL, 'qwen3:32b'),
  entry('opus', CLAUDE, 'opus', { effort: 'high' }), entry('sonnet', CLAUDE, 'sonnet'),
  entry('codex', CODEX, ''),
]
const SOURCES: HarnessModelSourceGroup[] = [
  { source: OPENAI, provider: 'openai', entries: ['gpt', 'gpt-mini'], defaultEntry: 'gpt' },
  { source: ANTHROPIC, provider: 'anthropic', entries: ['api-opus', 'api-sonnet'], defaultEntry: 'api-sonnet' },
  { source: LOCAL, provider: 'openai-compatible', host: '127.0.0.1:11434', entries: ['qwen'], defaultEntry: 'qwen' },
  { source: CLAUDE, entries: ['opus', 'sonnet'], defaultEntry: 'opus' },
  { source: CODEX, entries: ['codex'], defaultEntry: 'codex' },
]
const SETTINGS = {
  configured: true, subscription: { active: 'claude', models: { claude: 'opus', codex: '' } },
  models: MODELS, defaultModel: 'opus', sources: SOURCES,
} as unknown as HarnessModelSettings
const STATUS: Record<'claude' | 'codex', HarnessSubscriptionStatus> = {
  claude: { state: 'found', version: '2.1.300', signIn: 'subscription', models: ['opus', 'sonnet'], efforts: { '': { levels: ['low', 'medium', 'high', 'xhigh', 'max'] } } },
  codex: { state: 'found', version: '0.130.0', signIn: 'subscription', models: [], efforts: { '': { levels: ['low', 'medium', 'high', 'xhigh'], default: 'medium' } } },
}
/**
 * SETTINGS with only the models `runs` names able to run and `defaultModel` the default, whose CLI,
 * if it has one, is the subscription older Apps read as chosen, as Core mirrors it.
 */
const settingsWhere = (runs: readonly string[], defaultModel: string) => {
  const source = MODELS.find((model) => model.id === defaultModel)!.source
  return {
    ...SETTINGS, configured: runs.includes(defaultModel), defaultModel,
    subscription: { ...SETTINGS.subscription, active: source.kind === 'cli' ? source.cli : null },
    models: MODELS.map((model) => ({ ...model, configured: runs.includes(model.id) })),
  } as HarnessModelSettings
}

/** The shell's model status, as AppShell shares it. */
function Shell({ children }: { children: ReactNode }) {
  return <ModelStatusContext.Provider value={useCoreModelStatus(false)}>{children}</ModelStatusContext.Provider>
}

describe('输入框下面的服务来源、模型和推理强度', () => {
  let host: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    core.status.mockImplementation((cli: 'claude' | 'codex') => Promise.resolve(STATUS[cli]))
    core.setModel.mockImplementation((_chat: string, source: string, model?: string, effort?: string) => Promise.resolve({ source, ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }) }))
  })
  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  /** Shows anew the pickers of chat `chat-1`, which runs on `choice`, with Core's model settings `settings`, and lets Core answer every read. */
  const mount = async (choice: ChatModelChoice, settings: HarnessModelSettings = SETTINGS) => {
    if (root !== null) act(() => root!.unmount())
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    core.choice = choice
    core.settings = settings
    await act(async () => {
      root!.render(<MessagesProvider><Shell><ModelChips chat="chat-1" /></Shell></MessagesProvider>)
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve()
    })
  }
  const pickers = () => [...host.querySelectorAll<HTMLButtonElement>('button.choice-text')]
  /** The pickers as they read: each one's text. */
  const read = () => pickers().map((picker) => picker.textContent)
  const open = (at: number) => act(() => {
    pickers()[at]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  })
  /** The open menu's options: each one's text, its end mark included, and whether it is checked. */
  const options = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    .map((option) => [option.textContent, option.getAttribute('aria-checked') === 'true'])
  const choose = async (text: string) => {
    const option = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]')]
      .find((candidate) => candidate.textContent === text)!
    await act(async () => {
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
  }

  it('三个选择器是带小箭头的文字，不是标签：服务来源、模型、推理强度', async () => {
    await mount({ source: 'sonnet', effort: 'max' })
    expect(read()).toEqual(['Claude 订阅', 'sonnet', 'max'])
    expect(pickers().map((picker) => [picker.className, picker.querySelector('svg') !== null])).toEqual([
      ['choice-text', true], ['choice-text', true], ['choice-text', true],
    ])
    expect(pickers().map((picker) => picker.getAttribute('aria-label'))).toEqual(['服务来源：Claude 订阅', '模型：sonnet', '推理强度：max'])
  })

  it('换服务来源时这条对话改跑 Core 给那个来源定的模型，不带这条对话自己的推理强度', async () => {
    await mount({ source: 'sonnet', effort: 'max' })
    open(0)
    expect(options()).toEqual([
      ['Anthropic API', false], ['Ollama 本地', false], ['Claude 订阅', true], ['ChatGPT 订阅', false],
    ])
    await choose('Anthropic API')
    expect(core.setModel).toHaveBeenCalledExactlyOnceWith('chat-1', 'api-sonnet', undefined, undefined)
    expect(read()).toEqual(['Anthropic API', 'claude-sonnet-5', '默认'])
  })

  it('模型只列能照现在的设置跑的，加上这条对话现在用的那个；全局默认的那个行尾标默认；最后是模型设置…', async () => {
    await mount({ source: 'gpt' })
    expect(read()).toEqual(['OpenAI API', 'gpt-6.1', 'medium'])
    open(0)
    expect(options().map(([text]) => text)).toEqual(['OpenAI API', 'Anthropic API', 'Ollama 本地', 'Claude 订阅', 'ChatGPT 订阅'])
    await mount({ source: 'gpt' })
    open(1)
    expect(options()).toEqual([['gpt-6.1', true]])

    await mount({ source: 'sonnet' })
    open(1)
    expect(options()).toEqual([['opus默认', false], ['sonnet', true]])
    await choose('模型设置…')
    expect(core.openCategory).toHaveBeenCalledExactlyOnceWith('model')
  })

  it('换模型时去掉这条对话自己的推理强度', async () => {
    await mount({ source: 'sonnet', effort: 'max' })
    open(1)
    await choose('opus默认')
    expect(core.setModel).toHaveBeenCalledExactlyOnceWith('chat-1', 'opus', undefined, undefined)
    expect(read()).toEqual(['Claude 订阅', 'opus', 'high'])
  })

  it('推理强度的默认标在模型自己配的强度上；选它就不留这条对话自己的强度', async () => {
    await mount({ source: 'opus', effort: 'max' })
    open(2)
    expect(options()).toEqual([['low', false], ['medium', false], ['high默认', false], ['xhigh', false], ['max', true]])
    await choose('high默认')
    expect(core.setModel).toHaveBeenCalledExactlyOnceWith('chat-1', 'opus', undefined, undefined)
  })

  it('模型没配强度时，默认标在 CLI 目录写明的默认级别上；目录也不知道时第一项是默认', async () => {
    await mount({ source: 'codex' })
    expect(read()).toEqual(['ChatGPT 订阅', '默认模型', 'medium'])
    open(2)
    expect(options()).toEqual([['low', false], ['medium默认', true], ['high', false], ['xhigh', false]])

    await mount({ source: 'sonnet' })
    open(2)
    expect(options()).toEqual([['默认', true], ['low', false], ['medium', false], ['high', false], ['xhigh', false], ['max', false]])
    await choose('low')
    expect(core.setModel).toHaveBeenCalledExactlyOnceWith('chat-1', 'sonnet', undefined, 'low')

    await mount({ source: 'api-sonnet' })
    open(2)
    expect(options().map(([text]) => text)).toEqual(['默认', 'low', 'medium', 'high', 'xhigh', 'max'])

    await mount({ source: 'qwen' })
    expect(read()).toEqual(['Ollama 本地', 'qwen3:32b'])
  })

  it('CLI 的级别还在读时推理强度里转着运行圈、打不开；这条对话自己的强度已知时直接显示它', async () => {
    let answer: (status: HarnessSubscriptionStatus) => void = () => {}
    core.status.mockImplementation(() => new Promise((resolve) => { answer = resolve }))
    await mount({ source: 'codex' })
    const effort = () => pickers()[2]!
    expect([effort().querySelector('.ring.spin') !== null, effort().getAttribute('aria-busy'), effort().disabled]).toEqual([true, 'true', true])
    await act(async () => { answer(STATUS.codex) })
    expect([effort().textContent, effort().getAttribute('aria-busy'), effort().disabled]).toEqual(['medium', null, false])

    core.status.mockImplementation(() => new Promise(() => {}))
    await mount({ source: 'sonnet', effort: 'max' })
    expect([effort().textContent, effort().getAttribute('aria-busy')]).toEqual(['max', 'true'])
  })

  it('全局默认的模型跑不了、别的模型能跑时，照样是三个选择器，停在这条对话现在用的模型上，它自己选的能跑的模型也一样', async () => {
    const settings = settingsWhere(['api-opus', 'api-sonnet', 'qwen', 'opus', 'sonnet', 'codex'], 'gpt')
    await mount({ source: 'gpt' }, settings)
    expect([read(), host.textContent?.includes('AI 未连接')]).toEqual([['OpenAI API', 'gpt-6.1', 'medium'], false])
    open(1)
    expect(options()).toEqual([['gpt-6.1默认', true]])

    await mount({ source: 'sonnet', effort: 'max' }, settings)
    expect([read(), host.textContent?.includes('AI 未连接')]).toEqual([['Claude 订阅', 'sonnet', 'max'], false])
  })

  it('一个能跑的模型都没有时才是共享的「AI 未连接」，这条对话自己选的模型也一样跑不了', async () => {
    await mount({ source: 'sonnet' }, settingsWhere([], 'gpt'))
    expect(pickers()).toEqual([])
    expect(host.textContent).toBe('AI 未连接')
  })
})
