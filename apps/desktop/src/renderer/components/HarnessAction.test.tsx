// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessPlan } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

const settings = vi.hoisted(() => ({ openCategory: vi.fn() }))
vi.mock('../shell/AppShell.js', () => ({ useSettingsOpen: () => ({ open: false, openCategory: settings.openCategory }) }))

const { HarnessAction } = await import('./HarnessAction.js')
const { ModelStatusContext } = await import('../hooks/useModelStatus.js')

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** `node` in the shell, whose model status says a model is set up while `connected`. */
const withMessages = (node: ReactNode, connected = true) => (
  <MessagesProvider>
    <ModelStatusContext.Provider value={{ connected, source: connected ? 'api' : null, track: (send) => send }}>
      {node}
    </ModelStatusContext.Provider>
  </MessagesProvider>
)

const plan = (configured = true, billable = false): HarnessPlan => ({
  id: 'plan-1', workflow: 'paper-wiki', targetId: 'p1', scopeDigest: 'digest',
  action: 'create', label: '生成 Wiki',
  scope: {
    paperTitle: 'Paper', paperPages: 12, highlights: 2, annotatedHighlights: 1,
    notes: 3, hasRemark: true, existingWikiChars: 0,
  },
  model: { provider: configured ? 'Demo' : '未配置', name: configured ? 'Local' : '未配置', configured, billable },
  expiresAt: '2026-09-17T12:10:00.000Z',
})

describe('HarnessAction', () => {
  let root: Root | null = null
  let host: HTMLDivElement

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
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('does not start on the feature button and starts only after the cost confirmation', () => {
    const start = vi.fn()
    act(() => root!.render(withMessages(<HarnessAction plan={plan()} running={false} onStart={start}
      onCancel={vi.fn()} />)))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())

    expect(start).not.toHaveBeenCalled()
    expect(document.querySelector('.modal-actions .tag')?.textContent).toBe('免费')
    expect(document.querySelector('.harness-cost-plan > p, .harness-cost-plan small')).toBeNull()
    expect(document.body.textContent).toContain('当前论文')
    expect(document.body.textContent).not.toContain('预计输入')
    expect(document.body.textContent).not.toContain('运行上限')
    act(() => Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '开始生成')!.click())
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('marks a paid run beside Start with its cost', () => {
    act(() => root!.render(withMessages(<HarnessAction plan={plan(true, true)} running={false} onStart={vi.fn()}
      onCancel={vi.fn()} />)))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(document.querySelector('.modal-actions .tag')?.textContent).toBe('会产生费用')
  })

  it('names the plan a subscription run counts against beside Start, and that its output has no limit', () => {
    const start = vi.fn()
    const subscription = (cli: 'claude' | 'codex'): HarnessPlan => ({
      ...plan(),
      model: { provider: cli === 'claude' ? 'Claude 订阅' : 'ChatGPT 订阅', name: '默认模型', configured: true, billable: false, cli },
    })
    const properties = () => [...document.querySelectorAll('.harness-cost-plan .property')]
      .map((row) => [row.querySelector('dt')?.textContent, row.querySelector('dd')?.textContent])
    act(() => root!.render(withMessages(<HarnessAction plan={subscription('claude')} running={false} onStart={start}
      onCancel={vi.fn()} />)))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())

    const state = document.querySelector<HTMLElement>('.modal-actions .tag')!
    expect([state.textContent, state.className]).toEqual(['计入 Claude 订阅额度', 'tag tag--label tag--neutral'])
    expect(properties()).toEqual([
      ['范围', '当前论文'], ['个人内容', '4 条带文字的笔记 · 1 篇随笔'], ['模型', 'Claude 订阅 · 默认模型'], ['输出上限', '不限'],
    ])
    expect(document.body.textContent).not.toMatch(/免费|会产生费用|token/)
    act(() => Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '开始生成')!.click())
    expect(start).toHaveBeenCalledOnce()

    act(() => root!.render(withMessages(<HarnessAction plan={subscription('codex')} running={false} onStart={start}
      onCancel={vi.fn()} />)))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(document.querySelector('.modal-actions .tag')?.textContent).toBe('计入 ChatGPT 订阅额度')
  })

  it('shows no output limit for a run on an API model', () => {
    act(() => root!.render(withMessages(<HarnessAction plan={plan(true, true)} running={false} onStart={vi.fn()}
      onCancel={vi.fn()} />)))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(document.body.textContent).not.toContain('输出上限')
  })

  it('shows the plan but cannot start when no model is configured', () => {
    const start = vi.fn()
    act(() => root!.render(withMessages(<HarnessAction plan={plan(false)} running={false} onStart={start}
      onCancel={vi.fn()} />, false)))
    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(button.disabled).toBe(false)
    act(() => button.click())
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(document.querySelector('.modal-actions .tag')?.textContent).toBe('AI 未连接')
    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent === '开始生成')!
    expect(confirm.disabled).toBe(true)
    act(() => confirm.click())
    expect(start).not.toHaveBeenCalled()
    const state = document.querySelector<HTMLElement>('.modal-actions .tag')!
    expect([state.tagName, state.className]).toEqual(['BUTTON', 'tag tag--label tag--warning'])
    act(() => state.click())
    expect(settings.openCategory).toHaveBeenCalledWith('model')
  })

  it('starts a plan Core prepared with a model even while the shell says no model is set up, as the demo library\'s model does', () => {
    const start = vi.fn()
    act(() => root!.render(withMessages(<HarnessAction plan={plan()} running={false} onStart={start} onCancel={vi.fn()} />, false)))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())
    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent === '开始生成')!
    expect([confirm.disabled, document.querySelector('.modal-actions .tag')?.textContent]).toEqual([false, '免费'])
    act(() => confirm.click())
    expect(start).toHaveBeenCalledOnce()
  })

  it('replaces the start gate with one explicit stop action while running, in the neutral tone', () => {
    const cancel = vi.fn()
    act(() => root!.render(withMessages(<HarnessAction plan={plan()} running onStart={vi.fn()}
      onCancel={cancel} />)))
    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(button.getAttribute('aria-label')).toBe('停止生成')
    expect(button.className).toBe('btn generation-control is-running harness-trigger')
    expect(button.querySelector('.ring.spin')).not.toBeNull()
    expect(button.querySelector('.generation-stop')).not.toBeNull()
    act(() => button.click())
    expect(cancel).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })
})
