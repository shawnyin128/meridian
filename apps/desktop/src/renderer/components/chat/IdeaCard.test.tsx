// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatIdeaPreview, ChatMessage } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  preview: vi.fn<(id: string, messageId: string, title: string, body: string) => Promise<unknown>>(),
  save: vi.fn<(id: string, messageId: string, title: string, body: string, fingerprint: string) => Promise<unknown>>(),
  opened: vi.fn(),
}))
vi.mock('../../ipc.js', () => ({
  chat: { ideaPreview: api.preview, saveIdea: api.save },
  wiki: { cards: async () => [] },
}))
vi.mock('../../shell/AppShell.js', () => ({
  useJump: () => ({ jump: null, open: api.opened, returnTo: vi.fn(), enter: vi.fn() }),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../../hooks/useVaultWrite.js', () => ({ useVaultWrite: () => async (op: Promise<unknown>) => { await op; return true } }))

const { ChatMessageView } = await import('./ChatMessage.js')

const DRAFT = { title: '按接受率调草稿树宽', body: '大 batch 下树宽跟着接受率走。\n还没定：B ≥ 32 的收益。', sources: ['m1', 'm4'] }
/** What Core previews for `title` and `body`: the idea, the project, the chat and rounds, and a fingerprint of them. */
const previewOf = (title: string, body: string, saved: string | null = null): ChatIdeaPreview => ({
  idea: { title, body, project: { id: 'spec', name: '推测解码加速' } },
  chat: '树宽', rounds: [1, 3], fingerprint: title === DRAFT.title ? '0123456789abcdef' : 'fedcba9876543210', saved,
})

describe('the idea draft under an answer', () => {
  let root: Root
  let host: HTMLElement

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    api.preview.mockReset().mockImplementation(async (_id, _message, title, body) => previewOf(title, body))
    api.save.mockReset().mockResolvedValue({ id: 'idea-7' })
  })
  afterEach(() => { act(() => root.unmount()) })

  const answer: ChatMessage = { id: 'msg-9', role: 'ai', runs: [{ kind: 'text', text: '整理好了。' }], actions: [], idea: DRAFT }
  const show = async (message: ChatMessage) => {
    await act(async () => root.render(<MessagesProvider><ChatMessageView chat="chat-3" message={message} onAct={() => {}} /></MessagesProvider>))
  }
  const toggle = () => [...host.querySelectorAll('button')].find((held) => held.textContent!.startsWith('将写入'))!
  const button = (name: string) => [...host.querySelectorAll('button')].find((held) => held.textContent === name)
  /** Each property's label and value, a value of several rows read one row per line. */
  const rows = () => [...host.querySelectorAll('.writes .property')].map((row) => {
    const value = row.querySelector('.property-value')!
    const lines = [...value.querySelectorAll('div')].map((line) => line.textContent)
    return [row.querySelector('.property-label')!.textContent, lines.length > 0 ? lines.join('\n') : value.textContent]
  })

  it('keeps 将写入 folded until it is opened, then shows the idea, its project and the rounds it came from', async () => {
    await show(answer)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('.writes')).toBeNull()

    await act(async () => toggle().click())
    expect(api.preview).toHaveBeenCalledWith('chat-3', 'msg-9', DRAFT.title, DRAFT.body)
    expect(rows()).toEqual([
      ['想法', DRAFT.title], ['正文', DRAFT.body], ['关联项目', '推测解码加速'], ['来源', '树宽\n来自 第 1、3 轮'],
    ])
  })

  it('takes the title edited in place, previews it anew, and confirms what it shows with that preview\'s fingerprint', async () => {
    await show(answer)
    await act(async () => toggle().click())
    await act(async () => button(DRAFT.title)!.click())
    const input = host.querySelector<HTMLTextAreaElement>('.writes textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '树宽跟着接受率走')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    expect(api.preview).toHaveBeenLastCalledWith('chat-3', 'msg-9', '树宽跟着接受率走', DRAFT.body)
    expect(rows()[0]).toEqual(['想法', '树宽跟着接受率走'])

    await act(async () => button('确认写入')!.click())
    expect(api.save).toHaveBeenCalledWith('chat-3', 'msg-9', '树宽跟着接受率走', DRAFT.body, 'fedcba9876543210')
  })

  it('names a saved draft\'s idea as a link, with nothing left to edit or confirm', async () => {
    api.preview.mockImplementation(async (_id, _message, title, body) => previewOf(title, body, 'idea-7'))
    await show(answer)
    expect(host.textContent).toContain('已存为想法')
    await act(async () => toggle().click())
    expect(button('确认写入')).toBeUndefined()
    expect(host.querySelector('.writes input, .writes textarea')).toBeNull()
    const idea = [...host.querySelectorAll<HTMLElement>('.writes a')].find((link) => link.textContent === DRAFT.title)!
    await act(async () => idea.click())
    expect(api.opened).toHaveBeenCalledWith('ideas', 'idea-7')
  })

  it('shows nothing under an answer without a draft', async () => {
    await show({ ...answer, idea: undefined })
    expect(host.querySelector('.writes')).toBeNull()
    expect(toggle()).toBeUndefined()
    expect(api.preview).not.toHaveBeenCalled()
  })
})
