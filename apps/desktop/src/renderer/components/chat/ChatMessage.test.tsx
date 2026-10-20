// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ChatMessageView } from './ChatMessage.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('ChatMessageView', () => {
  let root: Root | null = null
  let host: HTMLElement

  beforeEach(() => {
    // FadeText measures whether its text fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root!.unmount())
    root = null
  })

  const show = (message: ChatMessage) => act(() => root!.render(
    <MessagesProvider><ChatMessageView message={message} onAct={() => {}} /></MessagesProvider>,
  ))

  it('模型回答是标签下面的一段正文，不是气泡', () => {
    show({ id: 'm1', role: 'ai', runs: [{ kind: 'text', text: '接受率决定加速比。' }], actions: [] })
    const answer = host.querySelector('.msg.ai')!
    expect([...answer.children].map((part) => [part.className, part.textContent])).toEqual([
      ['tag tag--label tag--neutral source-label msg-who', 'agent'],
      ['answer', '接受率决定加速比。'],
    ])
  })

  it('状态行以图标开头，没有身份标签', () => {
    show({ id: 'm2', role: 'status', runs: [{ kind: 'text', text: 'AI 尚未接入。' }], actions: [] })
    const line = host.querySelector('.msg .event')!
    expect([...line.children].map((part) => [part.className, part.textContent])).toEqual([
      ['event-icon', ''],
      ['', 'AI 尚未接入。'],
    ])
    expect(line.querySelector('.event-icon svg')).not.toBeNull()
    expect(host.querySelector('.source-label')).toBeNull()
  })
})
