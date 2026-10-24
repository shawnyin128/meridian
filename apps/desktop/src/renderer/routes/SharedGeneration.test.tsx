// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatSendResult, PaperRow } from '../../shared/contract.js'
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
      generating: [...replies.keys()],
    })),
  }
})

vi.mock('../ipc.js', () => ({
  appMenu: { platform: () => 'darwin' },
  chat: {
    send: core.send, cancel: core.cancel, messages: () => Promise.resolve([]),
    forPaper: (paperId: string) => Promise.resolve({
      id: `chat-${paperId}`, title: 'Paper One', archived: false, messageCount: 0, paperId,
    }),
  },
  feed: { append: () => Promise.resolve() },
  idea: { create: () => Promise.resolve({ id: 'idea-1' }) },
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
const { useJobsPoll } = await import('../shell/useJobs.js')

const PAPER: PaperRow = {
  id: 'paper-1', title: 'Paper One', venue: '', topics: [], methods: [], datasets: [], metrics: [],
  pageState: 'draft', readState: '未读', projects: [],
  pageCount: 8, noteCount: 0, conclusionCount: 0,
  updated: '2026-09-14', custom: {},
}

/** The shell around both screens: the jobs poll and the generations it reports. */
function Shell({ children }: { children: ReactNode }) {
  const { status, refresh } = useJobsPoll(shell.revision.bump)
  return <GenerationsContext.Provider value={useCoreGenerations(status, refresh)}>{children}</GenerationsContext.Provider>
}

function setValue(input: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

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

  const readerControl = () => document.querySelector<HTMLButtonElement>('.paper-chat .send')!
  const chatControl = () => document.querySelector<HTMLButtonElement>('#sendBtn')!

  /** Asks a question in the reader's paper chat and leaves its reply generating. */
  const askInReader = async () => {
    act(() => setValue(document.querySelector<HTMLTextAreaElement>('[aria-label="向当前论文提问"]')!, '关键假设是什么？'))
    act(() => readerControl().click())
    await settle()
    expect(core.send).toHaveBeenCalledExactlyOnceWith('chat-paper-1', '关键假设是什么？')
  }

  it('阅读器里问的问题还在生成时，对话屏打开同一条会话也显示停止，输入框不可再发', async () => {
    await askInReader()
    expect(readerControl().getAttribute('aria-label')).toBe('正在生成，点击停止')
    expect(chatControl().getAttribute('aria-label')).toBe('正在生成，点击停止')
    expect(document.querySelector<HTMLTextAreaElement>('#composer')!.disabled).toBe(true)
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
    expect(chatControl().getAttribute('aria-label')).toBe('正在生成，点击停止')

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
