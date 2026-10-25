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

const opened = vi.hoisted(() => vi.fn())
vi.mock('../../shell/AppShell.js', () => ({ useJump: () => ({ jump: null, open: opened, returnTo: vi.fn(), enter: vi.fn() }) }))

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

  const show = (message: ChatMessage, writing = false) => act(() => root!.render(
    <MessagesProvider><ChatMessageView message={message} onAct={() => {}} writing={writing} /></MessagesProvider>,
  ))
  /** The label and the text of the answer on screen. */
  const answerParts = () => [...host.querySelector('.msg.ai')!.children].map((part) => [part.className, part.textContent])

  it('模型回答是标签下面的一段正文，不是气泡', () => {
    show({ id: 'm1', role: 'ai', runs: [{ kind: 'text', text: '接受率决定加速比。' }], actions: [] })
    const answer = host.querySelector('.msg.ai')!
    expect([...answer.children].map((part) => [part.className, part.textContent])).toEqual([
      ['tag tag--label tag--neutral source-label msg-who', 'agent'],
      ['answer', '接受率决定加速比。'],
    ])
  })

  it('模型回答的标签写出回答它的模型和走的路：订阅还是 API；模型没报名字的订阅回答写 CLI 的名字', () => {
    const said = (model: ChatMessage['model']): ChatMessage => ({
      id: 'm1', role: 'ai', runs: [{ kind: 'text', text: '接受率决定加速比。' }], actions: [], model,
    })
    show(said({ route: 'subscription', cli: 'claude', id: 'claude-opus-5-5[1m]' }))
    expect(answerParts()[0]).toEqual(['tag tag--label tag--neutral source-label msg-who', 'Claude Opus 5.5 · 订阅'])
    show(said({ route: 'subscription', cli: 'codex' }))
    expect(answerParts()[0]![1]).toBe('Codex · 订阅')
    show(said({ route: 'api', id: 'gpt-5.5' }))
    expect(answerParts()[0]![1]).toBe('GPT-5.5 · API')
  })

  it('还没写出字的回答在标签下面转着运行圈，旁边写「思考中…」；写出字后就是那些字', () => {
    const model = { route: 'subscription' as const, cli: 'claude' as const, id: 'claude-opus-5-5[1m]' }
    show({ id: 'answer-so-far', role: 'ai', runs: [], actions: [], model }, true)
    expect(answerParts()).toEqual([
      ['tag tag--label tag--neutral source-label msg-who', 'Claude Opus 5.5 · 订阅'],
      ['answer', '思考中…'],
    ])
    const thinking = host.querySelector('.answer .inline-message')!
    expect(['role', 'aria-label', 'aria-busy'].map((name) => thinking.getAttribute(name))).toEqual(['status', null, 'true'])
    expect(thinking.querySelector('.inline-message-text')!.textContent).toBe('思考中…')
    expect(thinking.querySelector('.inline-message-lead svg.ring.spin')).not.toBeNull()

    show({ id: 'answer-so-far', role: 'ai', runs: [{ kind: 'text', text: 'EAGLE 快' }], actions: [], model }, true)
    expect(answerParts()[1]).toEqual(['answer', 'EAGLE 快'])
    expect(host.querySelector('.inline-message')).toBeNull()
  })

  it('发出的消息里的引用和输入框里一样是共享的 chip，夹在前后的字中间，点它打开它点名的实体', () => {
    show({
      id: 'm3', role: 'you', actions: [],
      runs: [
        { kind: 'text', text: '看看 ' }, { kind: 'mention', text: '@草稿树项目', target: { kind: 'project', id: 'draft' } },
        { kind: 'text', text: ' 这条线还剩什么' },
      ],
    })
    const bubble = host.querySelector('.msg.you .bubble')!
    expect(bubble.textContent).toBe('看看 @草稿树项目 这条线还剩什么')
    expect([...bubble.querySelectorAll('.tag')].map((pill) => [pill.className, pill.textContent]))
      .toEqual([['tag tag--chip tag--neutral', '@草稿树项目']])
    const link = bubble.querySelector<HTMLAnchorElement>('.tag a.entity-link')!
    expect(link.getAttribute('href')).toBe('#project:draft')
    act(() => link.click())
    expect(opened).toHaveBeenCalledExactlyOnceWith('project', 'draft')
  })

  it('引用的论文在阅读器里打开，Wiki 页在 Wiki 里打开', () => {
    show({
      id: 'm5', role: 'you', actions: [],
      runs: [
        { kind: 'mention', text: '@EAGLE', target: { kind: 'paper', id: '2401-15077' } }, { kind: 'text', text: ' 和 ' },
        { kind: 'mention', text: '@KV cache 量化', target: { kind: 'page', id: 'methods/kv-quantization' } },
      ],
    })
    expect([...host.querySelectorAll('.bubble .tag a.entity-link')].map((link) => link.getAttribute('href')))
      .toEqual(['#reader:2401-15077', '#wiki:methods/kv-quantization'])
  })

  it('引用的实体已经不在库里时，它只是一段文字，不是 chip，也不是链接', () => {
    show({
      id: 'm6', role: 'you', actions: [],
      runs: [{ kind: 'text', text: '看看 ' }, { kind: 'mention', text: '@删掉的项目' }, { kind: 'text', text: ' 还剩什么' }],
    })
    const bubble = host.querySelector('.msg.you .bubble')!
    expect([bubble.textContent, bubble.querySelector('.tag'), bubble.querySelector('a, button')])
      .toEqual(['看看 @删掉的项目 还剩什么', null, null])
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

  /** The text status line `text` shows in `language`. */
  const statusIn = (language: 'zh' | 'en', text: string) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    // The language is read when the App mounts, so each language gets a fresh mount.
    act(() => root!.unmount())
    root = createRoot(host)
    show({ id: 's1', role: 'status', runs: [{ kind: 'text', text }], actions: [] })
    return host.querySelector('.msg .event')!.textContent
  }

  /** Every status line the App has written, as stored, with what an English UI shows for it. */
  const WRITTEN: [stored: string, english: string][] = [
    ['AI 尚未接入，请先在设置中配置模型与 API Key。', 'AI is not set up yet. Set up a model and an API key in settings first.'],
    ['生成失败：已停止生成', 'Generation failed: Generation stopped'],
    ['生成失败：AI 服务已停止，请重新发送', 'Generation failed: The AI service stopped. Send again'],
    ['生成失败：对话上下文过大或请求格式不受支持', 'Generation failed: The chat context is too large, or the request format is not supported'],
    ['生成失败：模型服务调用失败', 'Generation failed: The model call failed'],
    ['生成失败：模型的回答读不出来', 'Generation failed: The model’s answer could not be read'],
    ['生成失败：AI 服务停了', 'Generation failed: The AI service stopped'],
    ['生成失败：对话太长，或这次请求模型不支持', 'Generation failed: The chat is too long, or the model does not support this request'],
    ['生成失败：还没有连上模型', 'Generation failed: No model is connected yet'],
    ['生成失败：AI 服务出了错', 'Generation failed: The AI service ran into an error'],
    ['生成失败：模型服务请求过多（429），请稍后重新确认任务', 'Generation failed: Too many requests to the model service (429). Confirm the task again later'],
    ['生成失败：模型服务拒绝认证（401），请检查设置', 'Generation failed: The model service refused authentication (401). Check settings'],
    ['生成失败：模型服务拒绝认证（403），请检查设置', 'Generation failed: The model service refused authentication (403). Check settings'],
    ['生成失败：模型服务返回 HTTP 502', 'Generation failed: The model service returned HTTP 502'],
    ['生成失败：模型服务请求超时', 'Generation failed: The model service timed out'],
    ['生成失败：操作系统安全凭据库不可用，API Key 未保存', 'Generation failed: The operating system credential vault is unavailable. The API key was not saved'],
    ['生成失败：未检测到安全的系统密码库，API Key 未保存', 'Generation failed: No secure system credential vault was found. The API key was not saved'],
    ['生成失败：保存的 API Key 密文无效', 'Generation failed: The saved API key is invalid'],
    ['生成失败：系统凭据库操作失败', 'Generation failed: The system credential vault operation failed'],
    ['生成失败：系统凭据库响应超时', 'Generation failed: The system credential vault did not respond in time'],
  ]

  it('英文界面里，App 存下的中文状态行(0.0.19.0 及以前存的也一样)显示成英文', () => {
    expect(WRITTEN.map(([stored]) => statusIn('en', stored))).toEqual(WRITTEN.map(([, english]) => english))
  })

  it('中文界面里，App 存下的每一种状态行都照存下的原样显示', () => {
    expect(WRITTEN.map(([stored]) => statusIn('zh', stored))).toEqual(WRITTEN.map(([stored]) => stored))
  })

  it('App 没写过的话照原样显示;生成失败的原因 App 没写过时,只把“生成失败”换成界面的语言', () => {
    expect([
      statusIn('en', 'agent 留下的一句话'),
      statusIn('en', '生成失败：Unsupported Harness model provider'),
      statusIn('zh', '生成失败：Unsupported Harness model provider'),
      statusIn('en', '生成失败：模型服务返回 HTTP 五百'),
    ]).toEqual([
      'agent 留下的一句话',
      'Generation failed: Unsupported Harness model provider',
      '生成失败：Unsupported Harness model provider',
      'Generation failed: 模型服务返回 HTTP 五百',
    ])
  })
})
