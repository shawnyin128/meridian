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
    expect([state.tagName, state.className]).toEqual(['BUTTON', 'tag tag--label tag--warn'])
    act(() => state.click())
    expect(settings.openCategory).toHaveBeenCalledWith('model')
  })

  it('cannot start a plan prepared with a model once the shell says no model is set up, and says so', () => {
    const start = vi.fn()
    act(() => root!.render(withMessages(<HarnessAction plan={plan()} running={false} onStart={start} onCancel={vi.fn()} />, false)))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())
    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent === '开始生成')!
    expect([confirm.disabled, document.querySelector('.modal-actions .tag')?.textContent]).toEqual([true, 'AI 未连接'])
  })

  it('replaces the start gate with one explicit stop action while running, in the neutral tone', () => {
    const cancel = vi.fn()
    act(() => root!.render(withMessages(<HarnessAction plan={plan()} running onStart={vi.fn()}
      onCancel={cancel} />)))
    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(button.getAttribute('aria-label')).toBe('正在生成，点击停止')
    expect(button.className).toBe('btn generation-control is-running harness-trigger')
    expect(button.querySelector('.ring.spin')).not.toBeNull()
    expect(button.querySelector('.generation-stop')).not.toBeNull()
    act(() => button.click())
    expect(cancel).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })
})
