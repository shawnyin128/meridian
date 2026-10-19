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
  listProjects: vi.fn(() => Promise.resolve([{
    id: 'draft', name: '草稿树项目', status: '进行中', priority: 'p1', topic: '推理', focus: '验证',
    conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0,
    milestones: [], recentEvents: [],
  }])),
  listPapers: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),
}))

vi.mock('../ipc.js', () => ({
  chat: { send: api.send, messages: () => Promise.resolve([]), cancel: vi.fn(), create: vi.fn() },
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
  useChatSession: () => ({ id: 'chat-1', title: '讨论', archived: false, select: vi.fn() }),
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
})
