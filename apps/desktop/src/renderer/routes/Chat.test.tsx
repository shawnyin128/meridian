// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  send: vi.fn(() => Promise.resolve({ id: 'chat-1', state: 'complete' })),
  cancel: vi.fn(() => Promise.resolve({ id: 'chat-1', cancelled: true })),
  listProjects: vi.fn(() => Promise.resolve([{
    id: 'draft', name: '草稿树项目', status: '进行中', priority: 'p1', topic: '推理', focus: '验证',
    conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0,
    milestones: [], recentEvents: [],
  }])),
  listPapers: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),
}))

const session = vi.hoisted(() => ({ id: 'chat-1' }))

vi.mock('../ipc.js', () => ({
  chat: { send: api.send, messages: () => Promise.resolve([]), cancel: api.cancel, create: vi.fn() },
  feed: { append: vi.fn() },
  idea: { create: vi.fn() },
  papers: { list: api.listPapers },
  project: { list: api.listProjects },
  wiki: { cards: () => Promise.resolve([]) },
}))

vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => vi.fn(),
  useToast: () => vi.fn(),
  useCrumbTail: () => {},
  useJump: () => ({ jump: null, open: vi.fn(), returnTo: vi.fn() }),
  useChatSession: () => ({ id: session.id, title: '讨论', archived: false, select: vi.fn() }),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (op: Promise<unknown>) => {
    await op
    return true
  },
}))

const { Chat } = await import('./Chat.js')

function setValue(input: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('Chat composer', () => {
  let root: Root | null = null
  let composer: HTMLTextAreaElement

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    session.id = 'chat-1'
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(<MessagesProvider><Chat /></MessagesProvider>)
      await Promise.resolve()
      await Promise.resolve()
    })
    const field = host.querySelector('#composer')
    expect(field).toBeInstanceOf(window.HTMLTextAreaElement)
    composer = field as HTMLTextAreaElement
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    act(() => { composer.dispatchEvent(event) })
    return event
  }

  /** Opens chat `id` from the sidebar: the Chat screen stays mounted and shows another session. */
  const openChat = async (id: string) => {
    session.id = id
    await act(async () => {
      root!.render(<MessagesProvider><Chat /></MessagesProvider>)
      await Promise.resolve()
    })
  }

  it('回车发送，Shift+回车换行，输入法组字时的回车不发送', async () => {
    act(() => setValue(composer, '为什么'))
    expect(press('Enter', { shiftKey: true }).defaultPrevented).toBe(false)
    expect(press('Enter', { isComposing: true }).defaultPrevented).toBe(false)
    expect(api.send).not.toHaveBeenCalled()

    expect(press('Enter').defaultPrevented).toBe(true)
    await act(async () => { await Promise.resolve() })
    expect(api.send).toHaveBeenCalledWith('chat-1', '为什么')
  })

  it('@ 候选开着时输入法组字的 Esc 不收起候选，组完字后的 Esc 才收起', () => {
    act(() => setValue(composer, '@'))
    expect(document.querySelector('#cRes')).not.toBeNull()
    press('Escape', { isComposing: true })
    expect(document.querySelector('#cRes')).not.toBeNull()
    press('Escape')
    expect(document.querySelector('#cRes')).toBeNull()
  })

  it('有 @ 候选时回车填入候选而不发送；没有候选时上下键留给光标在行间移动', () => {
    act(() => setValue(composer, '@'))
    expect(document.querySelector('#cRes')).not.toBeNull()
    expect(press('Enter').defaultPrevented).toBe(true)
    expect(composer.value).toBe('@草稿树项目 ')
    expect(api.send).not.toHaveBeenCalled()

    act(() => setValue(composer, '第一行\n第二行'))
    expect(press('ArrowUp').defaultPrevented).toBe(false)
    expect(press('ArrowDown').defaultPrevented).toBe(false)
  })

  it('草稿属于它的对话：换到另一条对话后回车不把它发过去，输入框是空的，切回来草稿还在', async () => {
    act(() => setValue(composer, '只问第一条'))
    await openChat('chat-2')
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(api.send).not.toHaveBeenCalled()
    expect(composer.value).toBe('')

    await openChat('chat-1')
    expect(composer.value).toBe('只问第一条')
  })

  it('@ 候选只留在打开它的那条对话里', async () => {
    act(() => setValue(composer, '@'))
    expect(document.querySelector('#cRes')).not.toBeNull()
    await openChat('chat-2')
    expect(document.querySelector('#cRes')).toBeNull()
  })

  /** Sends `text` from the open chat and leaves its reply generating until the returned call. */
  const sendPending = (text: string) => {
    let finish = () => {}
    api.send.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ id: session.id, state: 'complete' })
    }))
    act(() => setValue(composer, text))
    press('Enter')
    return async () => { await act(async () => { finish(); await Promise.resolve() }) }
  }
  const control = () => document.querySelector<HTMLButtonElement>('#sendBtn')!

  it('一条对话还在生成时，换到另一条对话照常可以输入和发送', async () => {
    const finish = sendPending('第一条的问题')
    expect(control().getAttribute('aria-label')).toBe('正在生成，点击停止')

    await openChat('chat-2')
    expect(composer.disabled).toBe(false)
    expect(control().getAttribute('aria-label')).toBe('发送')
    act(() => setValue(composer, '第二条的问题'))
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(api.send).toHaveBeenLastCalledWith('chat-2', '第二条的问题')
    await finish()
  })

  it('停止停的是正在生成的那条对话，别的对话不显示停止', async () => {
    const finish = sendPending('第一条的问题')
    await openChat('chat-2')
    expect(control().getAttribute('aria-label')).toBe('发送')

    await openChat('chat-1')
    expect(control().getAttribute('aria-label')).toBe('正在生成，点击停止')
    act(() => control().click())
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith('chat-1')
    expect(control().getAttribute('aria-label')).toBe('发送')
    await finish()
  })
})
