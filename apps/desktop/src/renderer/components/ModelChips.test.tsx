// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ChatModelChoice, HarnessModelEntry, HarnessModelSettings, HarnessModelSourceGroup, HarnessSourceModels,
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
  /** Answers with the models each source offers, as Core keeps them; a test replaces it to hold one. */
  sourceModels: vi.fn(),
  openCategory: vi.fn(),
  refusal: vi.fn(),
}))
vi.mock('../ipc.js', () => ({
  chat: { model: () => Promise.resolve(core.choice), setModel: core.setModel },
  harness: { modelSettings: () => Promise.resolve(core.settings), sourceModels: core.sourceModels },
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
 * One configuration per source: OpenAI's gpt-6.1 at medium without a key, Anthropic's
 * claude-sonnet-5, a local service, Claude's opus at high, the default, and Codex's own default model.
 */
const MODELS = [
  entry('api:openai', OPENAI, 'gpt-6.1', { effort: 'medium', configured: false }),
  entry('api:anthropic', ANTHROPIC, 'claude-sonnet-5'),
  entry('api:local', LOCAL, 'qwen3:32b'),
  entry('cli:claude', CLAUDE, 'opus', { effort: 'high' }),
  entry('cli:codex', CODEX, ''),
]
const group = (source: HarnessModelSourceGroup['source'], id: string, extra: Partial<HarnessModelSourceGroup> = {}): HarnessModelSourceGroup =>
  ({ source, entries: [id], defaultEntry: id, ...extra })
const SETTINGS = {
  configured: true, subscription: { active: 'claude', models: { claude: 'opus', codex: '' } },
  models: MODELS, defaultModel: 'cli:claude',
  sources: [
    group(OPENAI, 'api:openai', { provider: 'openai' }), group(ANTHROPIC, 'api:anthropic', { provider: 'anthropic' }),
    group(LOCAL, 'api:local', { provider: 'openai-compatible', host: '127.0.0.1:11434' }),
    group(CLAUDE, 'cli:claude'), group(CODEX, 'cli:codex'),
  ],
} as unknown as HarnessModelSettings
const CLAUDE_LEVELS = { levels: ['low', 'medium', 'high', 'xhigh', 'max'] }
/** What Core keeps of each source's models: OpenAI's list could not be read, the others could. */
const OFFERS: Record<string, HarnessSourceModels> = {
  'api:openai': { source: 'api:openai', models: [{ id: 'gpt-6.1', efforts: { levels: ['low', 'medium', 'high'] } }], error: 'unavailable' },
  'api:anthropic': {
    source: 'api:anthropic',
    models: [{ id: 'claude-sonnet-5', efforts: CLAUDE_LEVELS }, { id: 'claude-opus-5-5', efforts: CLAUDE_LEVELS }],
  },
  'api:local': { source: 'api:local', models: [{ id: 'qwen3:32b', efforts: { levels: [] } }] },
  'cli:claude': {
    source: 'cli:claude',
    models: [{ id: 'opus', efforts: CLAUDE_LEVELS }, { id: 'sonnet', efforts: CLAUDE_LEVELS }],
  },
  'cli:codex': {
    source: 'cli:codex',
    models: [
      { id: '', efforts: { levels: ['low', 'medium', 'high', 'xhigh'], default: 'medium' } },
      { id: 'gpt-6.1', efforts: { levels: ['low', 'medium', 'high', 'xhigh'], default: 'medium' } },
      { id: 'gpt-6.1-mini', efforts: { levels: ['low', 'medium', 'high'], default: 'low' } },
    ],
  },
}
/** SETTINGS with only the sources `runs` names able to run and `defaultModel` the default. */
const settingsWhere = (runs: readonly string[], defaultModel: string) => ({
  ...SETTINGS, configured: runs.includes(defaultModel), defaultModel,
  models: MODELS.map((model) => ({ ...model, configured: runs.includes(model.id) })),
}) as HarnessModelSettings

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
    core.sourceModels.mockImplementation((source: string) => Promise.resolve(OFFERS[source]))
    core.setModel.mockImplementation((_chat: string, source: string, model?: string, effort?: string) => Promise.resolve({
      source, ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }),
    }))
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
  const pickers = () => [...host.querySelectorAll<HTMLButtonElement>('button.choice-capsule')]
  /** The open menu's commands, after its options. */
  const commands = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => item.textContent)
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

  it('三个选择器是带小箭头的胶囊，不是标签：服务来源、模型、推理强度，开始时是来源自己的默认', async () => {
    await mount({ source: 'cli:claude' })
    expect(read()).toEqual(['Claude 订阅', 'opus', 'high'])
    expect(pickers().map((picker) => [picker.className, picker.querySelector('svg:not(.ring)') !== null])).toEqual([
      ['choice-capsule', true], ['choice-capsule', true], ['choice-capsule', true],
    ])
    expect(pickers().map((picker) => picker.getAttribute('aria-label'))).toEqual(['服务来源：Claude 订阅', '模型：opus', '推理强度：high'])
  })

  it('服务来源只列能跑的，加上这条对话现在用的那个，最后是模型设置…；换来源时只送来源，从它的默认模型和强度开始', async () => {
    await mount({ source: 'cli:claude', model: 'sonnet', effort: 'max' })
    open(0)
    expect(options()).toEqual([['Anthropic API', false], ['Ollama 本地', false], ['Claude 订阅', true], ['ChatGPT 订阅', false]])
    expect(commands()).toEqual(['模型设置…'])
    await choose('模型设置…')
    expect(core.openCategory).toHaveBeenCalledExactlyOnceWith('model')

    await mount({ source: 'cli:claude', model: 'sonnet', effort: 'max' })
    open(0)
    await choose('ChatGPT 订阅')
    expect(core.setModel).toHaveBeenCalledExactlyOnceWith('chat-1', 'cli:codex', undefined, undefined)
    expect(read()).toEqual(['ChatGPT 订阅', '默认模型', 'medium'])

    await mount({ source: 'api:openai' })
    open(0)
    expect(options().map(([text]) => text)).toEqual(['OpenAI API', 'Anthropic API', 'Ollama 本地', 'Claude 订阅', 'ChatGPT 订阅'])
  })

  it('模型只列来源提供的每一个模型，来源的默认模型排第一、行尾标默认；CLI 自己的默认模型名字已说是默认，不再标', async () => {
    await mount({ source: 'cli:codex' })
    open(1)
    expect([options(), commands()]).toEqual([[['默认模型', true], ['gpt-6.1', false], ['gpt-6.1-mini', false]], []])

    await mount({ source: 'cli:claude' })
    open(1)
    expect(options()).toEqual([['opus默认', true], ['sonnet', false]])
  })

  it('来源的模型列表读不出来时照样提供默认模型，这条对话自己的模型不在其中时也列上它', async () => {
    await mount({ source: 'api:openai' })
    open(1)
    expect(options()).toEqual([['gpt-6.1默认', true]])

    await mount({ source: 'api:openai', model: 'gpt-5.5' })
    open(1)
    expect(options()).toEqual([['gpt-6.1默认', false], ['gpt-5.5', true]])
  })

  it('换模型时只送来源和模型，去掉这条对话自己的推理强度；选回来源的默认模型就不留自己的模型', async () => {
    await mount({ source: 'cli:claude', effort: 'max' })
    open(1)
    await choose('sonnet')
    expect(core.setModel).toHaveBeenCalledExactlyOnceWith('chat-1', 'cli:claude', 'sonnet', undefined)
    expect(read()).toEqual(['Claude 订阅', 'sonnet', '默认'])

    await mount({ source: 'cli:claude', model: 'sonnet', effort: 'low' })
    open(1)
    await choose('opus默认')
    expect(core.setModel).toHaveBeenLastCalledWith('chat-1', 'cli:claude', undefined, undefined)
    expect(read()).toEqual(['Claude 订阅', 'opus', 'high'])
  })

  it('推理强度的默认标在来源配给自己默认模型的强度上；选它就不留这条对话自己的强度', async () => {
    await mount({ source: 'cli:claude', effort: 'max' })
    open(2)
    expect(options()).toEqual([['low', false], ['medium', false], ['high默认', false], ['xhigh', false], ['max', true]])
    await choose('high默认')
    expect(core.setModel).toHaveBeenCalledExactlyOnceWith('chat-1', 'cli:claude', undefined, undefined)
  })

  it('换了别的模型或来源没配强度时，默认标在模型自己的默认级别上；都没有时第一项是默认，选级别时留着自己的模型', async () => {
    await mount({ source: 'cli:codex', model: 'gpt-6.1-mini' })
    open(2)
    expect(options()).toEqual([['low默认', true], ['medium', false], ['high', false]])

    await mount({ source: 'cli:codex' })
    open(2)
    expect(options()).toEqual([['low', false], ['medium默认', true], ['high', false], ['xhigh', false]])

    await mount({ source: 'cli:claude', model: 'sonnet' })
    open(2)
    expect(options()).toEqual([['默认', true], ['low', false], ['medium', false], ['high', false], ['xhigh', false], ['max', false]])
    await choose('low')
    expect(core.setModel).toHaveBeenCalledExactlyOnceWith('chat-1', 'cli:claude', 'sonnet', 'low')

    await mount({ source: 'api:local' })
    expect(read()).toEqual(['Ollama 本地', 'qwen3:32b'])
  })

  it('来源的模型还没读出来时，模型和强度里转着运行圈、打不开；已知的强度直接显示；打开菜单不再去读', async () => {
    let answer: (models: HarnessSourceModels) => void = () => {}
    core.sourceModels.mockImplementation(() => new Promise((resolve) => { answer = resolve }))
    await mount({ source: 'cli:codex' })
    const state = (at: number) => {
      const picker = pickers()[at]!
      return [picker.textContent, picker.querySelector('.ring.spin') !== null, picker.getAttribute('aria-busy'), picker.disabled]
    }
    expect([state(1), state(2)]).toEqual([['默认模型', true, 'true', true], ['', true, 'true', true]])
    await act(async () => { answer(OFFERS['cli:codex']!) })
    expect([state(1), state(2)]).toEqual([['默认模型', false, null, false], ['medium', false, null, false]])
    open(1)
    expect(core.sourceModels).toHaveBeenCalledExactlyOnceWith('cli:codex')

    core.sourceModels.mockImplementation(() => new Promise(() => {}))
    await mount({ source: 'cli:claude' })
    expect(state(2)).toEqual(['high', true, 'true', true])
  })

  it('API 来源用到时才读模型列表：打开它的模型菜单才去读、只读一次；读之前也列着默认模型，强度用服务商的级别，不转圈', async () => {
    await mount({ source: 'api:anthropic', model: 'claude-opus-5-5' })
    expect(core.sourceModels).not.toHaveBeenCalled()
    expect(read()).toEqual(['Anthropic API', 'claude-opus-5-5', '默认'])
    expect(pickers().map((picker) => picker.disabled)).toEqual([false, false, false])

    open(1)
    expect(options()).toEqual([['claude-sonnet-5默认', false], ['claude-opus-5-5', true]])
    await act(async () => { for (let turn = 0; turn < 5; turn += 1) await Promise.resolve() })
    expect(core.sourceModels).toHaveBeenCalledExactlyOnceWith('api:anthropic')
    open(2)
    expect(options()).toEqual([['默认', true], ['low', false], ['medium', false], ['high', false], ['xhigh', false], ['max', false]])
    expect(core.sourceModels).toHaveBeenCalledTimes(1)

    await mount({ source: 'cli:claude' })
    expect(core.sourceModels).toHaveBeenLastCalledWith('cli:claude')
  })

  it('全局默认的来源跑不了、别的能跑时，照样是三个选择器，停在这条对话现在用的来源上', async () => {
    const settings = settingsWhere(['api:anthropic', 'api:local', 'cli:claude', 'cli:codex'], 'api:openai')
    await mount({ source: 'api:openai' }, settings)
    expect([read(), host.textContent?.includes('AI 未连接')]).toEqual([['OpenAI API', 'gpt-6.1', 'medium'], false])
  })

  it('一个能跑的来源都没有时才是共享的「AI 未连接」', async () => {
    await mount({ source: 'cli:claude' }, settingsWhere([], 'api:openai'))
    expect(pickers()).toEqual([])
    expect(host.textContent).toBe('AI 未连接')
  })
})
