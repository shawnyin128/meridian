// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, PaperRow } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const withMessages = (node: ReactNode) => <MessagesProvider>{node}</MessagesProvider>

const api = vi.hoisted(() => ({
  send: vi.fn(() => Promise.resolve({ id: 'chat-paper-1', state: 'complete' })),
  cancel: vi.fn(() => Promise.resolve({ id: 'chat-paper-1', cancelled: true })),
  forPaper: vi.fn(() => Promise.resolve({
    id: 'chat-paper-1', title: 'Paper One', archived: false, messageCount: 0, paperId: 'paper-1',
  })),
  messages: vi.fn<() => Promise<ChatMessage[]>>(() => Promise.resolve([])),
  createIdea: vi.fn(() => Promise.resolve({ id: 'idea-1' })),
  recordAction: vi.fn(() => Promise.reject(new Error('未在本测试调用'))),
  listProjects: vi.fn(() => Promise.resolve([{
    id: 'draft', name: '草稿树项目', status: '进行中', priority: 'p1', topic: '推理', focus: '验证',
    conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0,
    milestones: [], recentEvents: [],
  }])),
  createConclusion: vi.fn(() => Promise.resolve({})),
  feedAppend: vi.fn(() => Promise.resolve()),
  bump: vi.fn(),
  banner: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../ipc.js', () => ({
  chat: {
    send: api.send, cancel: api.cancel, forPaper: api.forPaper, messages: api.messages,
    recordAction: api.recordAction,
  },
  idea: { create: api.createIdea },
  feed: { append: api.feedAppend },
  project: { list: api.listProjects, createConclusion: api.createConclusion },
}))

vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => api.banner,
  useToast: () => api.toast,
  useVaultRevision: () => ({ revision: 0, bump: api.bump }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (op: Promise<unknown>) => {
    await op
    api.bump()
    return true
  },
}))

const { PaperChat } = await import('../components/chat/PaperChat.js')

const PAPER: PaperRow = {
  id: 'paper-1', title: 'Paper One', venue: '', topics: [], methods: [], datasets: [], metrics: [],
  pageState: 'draft', readState: '未读', projects: [],
  pageCount: 8, noteCount: 0, conclusionCount: 0,
  updated: '2026-09-14', custom: {},
}

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof window.HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PaperChat', () => {
  let root: Root | null = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('按论文取得持久会话并把输入追加到同一条会话', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={PAPER} />))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(api.forPaper).toHaveBeenCalledWith('paper-1')
    expect(api.messages).toHaveBeenCalledWith('chat-paper-1')
    expect(host.querySelector('aside')?.getAttribute('aria-label')).toBe('当前论文对话')

    const input = host.querySelector<HTMLInputElement>('[aria-label="向当前论文提问"]')!
    act(() => setValue(input, '  关键假设是什么？  '))
    await act(async () => { host.querySelector<HTMLButtonElement>('.paper-chat .send')!.click() })

    expect(api.send).toHaveBeenCalledWith('chat-paper-1', '关键假设是什么？')
    expect(input.value).toBe('')
  })

  it('提交未完成时发送箭头变为可停止的旋转控件', async () => {
    let finish = () => {}
    api.send.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ id: 'chat-paper-1', state: 'complete' })
    }))
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={PAPER} />))
      await Promise.resolve()
      await Promise.resolve()
    })

    const input = host.querySelector<HTMLInputElement>('[aria-label="向当前论文提问"]')!
    act(() => setValue(input, 'What is the mechanism?'))
    act(() => host.querySelector<HTMLButtonElement>('.paper-chat .send')!.click())
    const control = host.querySelector<HTMLButtonElement>('.paper-chat .send')!
    expect(control.getAttribute('aria-label')).toBe('正在生成，点击停止')
    expect(control.querySelector('.generation-spinner')).not.toBeNull()
    expect(control.querySelector('.generation-stop')).not.toBeNull()

    act(() => control.click())
    expect(control.getAttribute('aria-label')).toBe('发送')
    expect(api.cancel).toHaveBeenCalledWith('chat-paper-1')
    await act(async () => { finish(); await Promise.resolve() })
  })

  it('论文对话把用户明确整理的标题和正文存为可回看的想法', async () => {
    api.messages.mockResolvedValueOnce([{
      id: 'm1', role: 'you', runs: [{ kind: 'text', text: '先讨论机制' }], actions: [],
    }])
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(withMessages(<PaperChat paper={PAPER} />))
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.paper-chat .qa')!.click()
      await Promise.resolve()
    })
    const fields = document.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.idea-dialog .form-control')
    act(() => {
      setValue(fields[0] as HTMLInputElement, '可验证的新方向')
      setValue(fields[1] as HTMLTextAreaElement, '把讨论后的机制和实验假设明确写下来')
    })
    await act(async () => {
      [...document.body.querySelectorAll<HTMLButtonElement>('button')]
        .find((candidate) => candidate.textContent === '保存想法')!.click()
    })
    expect(api.createIdea).toHaveBeenCalledWith(
      'chat-paper-1', '可验证的新方向', '把讨论后的机制和实验假设明确写下来',
    )
    expect(document.body.textContent).not.toContain('存为结论')
  })
})
