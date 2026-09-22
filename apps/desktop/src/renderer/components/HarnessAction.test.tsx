// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HarnessPlan } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { HarnessAction } from './HarnessAction.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const withMessages = (node: ReactNode) => <MessagesProvider>{node}</MessagesProvider>

const plan = (configured = true): HarnessPlan => ({
  id: 'plan-1', workflow: 'paper-wiki', targetId: 'p1', scopeDigest: 'digest',
  action: 'create', label: '生成 Wiki',
  scope: {
    paperTitle: 'Paper', paperPages: 12, highlights: 2, annotatedHighlights: 1,
    notes: 3, hasRemark: true, existingWikiChars: 0,
  },
  model: { provider: configured ? 'Demo' : '未配置', name: configured ? 'Local' : '未配置', configured, billable: false },
  expiresAt: '2026-09-17T12:10:00.000Z',
})

describe('HarnessAction', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
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
    expect(document.body.textContent).toContain('本地或演示流程，不会产生 API 费用')
    expect(document.body.textContent).toContain('当前论文')
    expect(document.body.textContent).not.toContain('预计输入')
    expect(document.body.textContent).not.toContain('运行上限')
    act(() => Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '开始生成')!.click())
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('shows the plan but cannot start when no model is configured', () => {
    const start = vi.fn()
    act(() => root!.render(withMessages(<HarnessAction plan={plan(false)} running={false} onStart={start}
      onCancel={vi.fn()} />)))
    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(button.disabled).toBe(false)
    act(() => button.click())
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('AI 尚未连接')
    const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent === '尚未连接模型')!
    expect(confirm.disabled).toBe(true)
    act(() => confirm.click())
    expect(start).not.toHaveBeenCalled()
  })

  it('replaces the start gate with one explicit stop action while running', () => {
    const cancel = vi.fn()
    act(() => root!.render(withMessages(<HarnessAction plan={plan()} running onStart={vi.fn()}
      onCancel={cancel} />)))
    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(button.getAttribute('aria-label')).toBe('正在生成，点击停止')
    expect(button.querySelector('.generation-spinner')).not.toBeNull()
    expect(button.querySelector('.generation-stop')).not.toBeNull()
    act(() => button.click())
    expect(cancel).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })
})
