// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatSendResult, HarnessModelSettings, PaperRow } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/**
 * Core as the chat screens see it: a send marks its chat as generating until the reply arrives or
 * the chat is stopped, and the jobs status reports the chats it is generating in.
 */
const core = vi.hoisted(() => {
  const replies = new Map<string, (result: ChatSendResult) => void>()
  return {
    replies,
    /** The reply in chat `id` arrives. */
    answer: (id: string) => {
      const reply = replies.get(id)!
      replies.delete(id)
      reply({ id, state: 'complete' })
    },
    send: vi.fn((id: string) => new Promise<ChatSendResult>((resolve) => { replies.set(id, resolve) })),
    cancel: vi.fn((id: string) => {
      const reply = replies.get(id)
      replies.delete(id)
      reply?.({ id, state: 'cancelled' })
      return Promise.resolve({ id, cancelled: reply !== undefined })
    }),
    status: vi.fn(() => Promise.resolve({
      writes: 0, uploads: [], downloads: [], fetch: { state: 'idle', checkedAt: null, reason: null },
      generating: [...replies.keys()], generatingWiki: [], wikiFailures: {},
    })),
    /** Whether the model settings set up a model. */
    configured: true,
    modelSettings: vi.fn((): Promise<Partial<HarnessModelSettings>> => Promise.resolve({
      configured: core.configured, subscription: { active: null, models: { claude: '', codex: '' } },
      models: [{ id: 'model-1', source: { kind: 'api', profile: 'openai' }, model: 'gpt-5.5', configured: true }], defaultModel: 'model-1', sources: [{ source: { kind: 'api', profile: 'openai' }, provider: 'openai', entries: ['model-1'], defaultEntry: 'model-1' }],
    })),
  }
})

vi.mock('../ipc.js', () => ({
  appMenu: { platform: () => 'darwin' },
  chat: {
    send: core.send, cancel: core.cancel, messages: () => Promise.resolve([]), writing: () => Promise.resolve(null),
    model: () => Promise.resolve({ model: 'model-1' }),
    forPaper: (paperId: string) => Promise.resolve({
      id: `chat-${paperId}`, title: 'Paper One', archived: false, messageCount: 0, paperId,
    }),
  },
  feed: { append: () => Promise.resolve() },
  idea: { create: () => Promise.resolve({ id: 'idea-1' }) },
  harness: { modelSettings: core.modelSettings, subscriptionStatus: () => Promise.resolve({ state: 'missing' }) },
  jobs: { status: core.status },
  papers: { list: () => Promise.resolve({ rows: [], total: 0 }) },
  project: { list: () => Promise.resolve([]) },
  wiki: { cards: () => Promise.resolve([]) },
}))

/** What the shell hands both screens; each value keeps its identity across renders, as the shell's do. */
const shell = vi.hoisted(() => ({
  notice: { success: vi.fn(), refusal: vi.fn() },
  jump: { jump: null, open: vi.fn(), returnTo: vi.fn() },
  // The Chat screen has the reader's paper chat open, as the chat list or a search hit opens it.
  session: { id: 'chat-paper-1', title: 'Paper One', archived: false, select: vi.fn() },
  revision: { revision: 0, bump: vi.fn() },
  settings: { open: false, openCategory: vi.fn() },
  grip: { id: 'rrgrip', label: '论文对话宽度', value: 300, min: 240, max: 480, onResize: vi.fn(), onReset: vi.fn() },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => shell.notice,
  useCrumbTail: () => {},
  useJump: () => shell.jump,
  useScreenEntry: () => 0,
  useChatSession: () => shell.session,
  useVaultRevision: () => shell.revision,
  useSettingsOpen: () => shell.settings,
  usePaperChatGrip: () => shell.grip,
  usePaperChatCollapsed: () => false,
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (op: Promise<unknown>) => {
    await op
    return true
  },
}))

const { Chat } = await import('./Chat.js')
const { PaperChat } = await import('../components/chat/PaperChat.js')
const { GenerationsContext, useCoreGenerations } = await import('../hooks/useGenerations.js')
const { ModelStatusContext, useCoreModelStatus } = await import('../hooks/useModelStatus.js')
const { useJobsPoll } = await import('../shell/useJobs.js')

const PAPER: PaperRow = {
  id: 'paper-1', title: 'Paper One', venue: '', topics: [], methods: [], datasets: [], metrics: [],
  pageState: 'draft', readState: '未读', projects: [],
  pageCount: 8, noteCount: 0, conclusionCount: 0,
  updated: '2026-09-14', custom: {},
}

/** The shell around both screens: the jobs poll and the generations it reports, and the model status. */
function Shell({ children }: { children: ReactNode }) {
  const { status, refresh } = useJobsPoll(shell.revision.bump)
  return (
    <GenerationsContext.Provider value={useCoreGenerations(status, refresh)}>
      <ModelStatusContext.Provider value={useCoreModelStatus(shell.settings.open)}>{children}</ModelStatusContext.Provider>
    </GenerationsContext.Provider>
  )
}

/** Types `text` into the composer whose editable text is `field`. */
function typeInto(field: HTMLElement, text: string): void {
  const view = EditorView.findFromDOM(field.closest<HTMLElement>('.cm-editor')!)!
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length }, userEvent: 'input.type' })
}

const readerControl = () => document.querySelector<HTMLButtonElement>('.paper-chat .send')!
const chatControl = () => document.querySelector<HTMLButtonElement>('#sendBtn')!

/** Lets every pending call to Core answer and the screens render what it answered. */
const settle = () => act(async () => {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve()
})

describe('一条会话在生成，打开它的每一屏都知道', () => {
  let root: Root | null = null

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    core.replies.clear()
    core.configured = true
    shell.settings.open = false
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(<MessagesProvider><Shell><PaperChat paper={PAPER} /><Chat /></Shell></MessagesProvider>)
    })
    await settle()
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.unstubAllGlobals()
  })


  /** Asks a question in the reader's paper chat and leaves its reply generating. */
  const askInReader = async () => {
    act(() => typeInto(document.querySelector<HTMLElement>('[aria-label="向当前论文提问"]')!, '关键假设是什么？'))
    act(() => readerControl().click())
    await settle()
    expect(core.send).toHaveBeenCalledExactlyOnceWith('chat-paper-1', [{ kind: 'text', text: '关键假设是什么？' }])
  }

  it('阅读器里问的问题还在生成时，对话屏打开同一条会话也显示停止，输入框不可再发', async () => {
    await askInReader()
    expect(readerControl().getAttribute('aria-label')).toBe('停止生成')
    expect(chatControl().getAttribute('aria-label')).toBe('停止生成')
    expect(document.querySelector('#composer')!.getAttribute('contenteditable')).toBe('false')
  })

  it('在对话屏按停止，停的是阅读器里正在生成的那条会话，两屏都回到发送', async () => {
    await askInReader()
    act(() => chatControl().click())
    await settle()
    expect(core.cancel).toHaveBeenCalledExactlyOnceWith('chat-paper-1')
    expect([readerControl().getAttribute('aria-label'), chatControl().getAttribute('aria-label')]).toEqual(['发送', '发送'])
  })

  it('Core 在生成一条不是这个窗口发出的会话时（例如窗口重新载入后），对话屏也显示停止，按停止就停下', async () => {
    act(() => root!.unmount())
    core.replies.set('chat-paper-1', () => {})
    root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root!.render(<MessagesProvider><Shell><Chat /></Shell></MessagesProvider>) })
    await settle()
    expect(chatControl().getAttribute('aria-label')).toBe('停止生成')

    act(() => chatControl().click())
    await settle()
    expect(core.cancel).toHaveBeenCalledExactlyOnceWith('chat-paper-1')
    expect(chatControl().getAttribute('aria-label')).toBe('发送')
  })

  it('回答到了，两屏都回到发送', async () => {
    await askInReader()
    await act(async () => { core.answer('chat-paper-1') })
    await settle()
    expect([readerControl().getAttribute('aria-label'), chatControl().getAttribute('aria-label')]).toEqual(['发送', '发送'])
  })
})

describe('「AI 未连接」在每个输入框里都一样', () => {
  let root: Root | null = null
  const tags = () => [...document.querySelectorAll('.cbox')].map((box) => box.querySelector('.tag')?.textContent ?? null)
  const render = () => act(async () => {
    root!.render(<MessagesProvider><Shell><PaperChat paper={PAPER} /><Chat /></Shell></MessagesProvider>)
  })

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    core.replies.clear()
    shell.settings.open = false
    root = createRoot(document.body.appendChild(document.createElement('div')))
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.unstubAllGlobals()
  })

  it('没配置模型时阅读器和对话屏的输入框一开始就都显示,设置里配好、关上设置,两边一起消失', async () => {
    core.configured = false
    await render()
    await settle()
    expect(tags()).toEqual(['AI 未连接', 'AI 未连接'])

    shell.settings.open = true
    await render()
    core.configured = true
    shell.settings.open = false
    await render()
    await settle()
    expect(tags()).toEqual([null, null])
  })

  it('一屏发送时 Core 说没有模型,两屏一起显示', async () => {
    core.configured = true
    await render()
    await settle()
    expect(tags()).toEqual([null, null])
    core.configured = false
    core.send.mockResolvedValueOnce({ id: 'chat-paper-1', state: 'failed', reason: 'no-model' })
    act(() => typeInto(document.querySelector<HTMLElement>('[aria-label="向当前论文提问"]')!, '关键假设是什么？'))
    act(() => readerControl().click())
    await settle()
    expect(tags()).toEqual(['AI 未连接', 'AI 未连接'])
  })
})
