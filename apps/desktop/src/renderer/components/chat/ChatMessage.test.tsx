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

  it('发出的消息里的引用和输入框里一样是共享的 chip，夹在前后的字中间', () => {
    show({
      id: 'm3', role: 'you', actions: [],
      runs: [{ kind: 'text', text: '看看 ' }, { kind: 'mention', text: '@草稿树项目' }, { kind: 'text', text: ' 这条线还剩什么' }],
    })
    const bubble = host.querySelector('.msg.you .bubble')!
    expect(bubble.textContent).toBe('看看 @草稿树项目 这条线还剩什么')
    expect([...bubble.querySelectorAll('.tag')].map((pill) => [pill.className, pill.textContent]))
      .toEqual([['tag tag--chip tag--neutral', '@草稿树项目']])
  })

  it('0.0.18.0 存下的引用是正文里的字，照原样显示成文字', () => {
    show({ id: 'm4', role: 'you', actions: [], runs: [{ kind: 'text', text: '@推测解码 里说加速比取决于接受率，长回答也是这样吗？' }] })
    const bubble = host.querySelector('.msg.you .bubble')!
    expect([bubble.textContent, bubble.querySelector('.tag')]).toEqual(['@推测解码 里说加速比取决于接受率，长回答也是这样吗？', null])
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
