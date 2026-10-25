// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { ModalDialog, ModalTitle } from './ModalDialog.js'
import { Notice, NOTICE_MS, type NoticeContent } from './Notice.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let root: Root

/** Renders the notice host with `notice`, as AppShell does after each notify call. */
function show(notice: NoticeContent | null) {
  act(() => { root.render(<Notice notice={notice} />) })
}

const card = () => document.querySelector<HTMLElement>('#notice')!
const shown = () => card().classList.contains('show')
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

describe('Notice', () => {
  it('把每条提示放进一直在场的 status 区域，屏幕阅读器会读出来', () => {
    show(null)
    const live = document.querySelector('[role="status"]')
    expect(live).not.toBeNull()
    show({ id: 1, tone: 'success', text: '已移入垃圾桶' })
    expect(document.querySelector('[role="status"]')).toBe(live)
    expect(live!.textContent).toBe('已移入垃圾桶')
  })

  it('成功和拒绝是同一个提示的两种语气', () => {
    show({ id: 1, tone: 'success', text: '已保存' })
    const first = card()
    expect(first.dataset['tone']).toBe('success')
    show({ id: 2, tone: 'refusal', text: '项目不存在：repro' })
    expect(card()).toBe(first)
    expect(card().dataset['tone']).toBe('refusal')
    expect(card().textContent).toBe('项目不存在：repro')
  })

  it('停留五秒才淡出，淡出后文字还在、也不再进 Tab 顺序', () => {
    show({ id: 1, tone: 'success', text: '已保存' })
    wait(NOTICE_MS - 1)
    expect(shown()).toBe(true)
    expect(card().hasAttribute('inert')).toBe(false)
    wait(1)
    expect(shown()).toBe(false)
    expect(card().hasAttribute('inert')).toBe(true)
    expect(card().textContent).toBe('已保存')
    expect(NOTICE_MS).toBeGreaterThanOrEqual(5000)
  })

  it('指针停在提示上时暂停计时，移开后只走剩下的时间', () => {
    show({ id: 1, tone: 'success', text: '已保存' })
    wait(3000)
    act(() => { card().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    wait(60_000)
    expect(shown()).toBe(true)
    act(() => { card().dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })
    wait(NOTICE_MS - 3000 - 1)
    expect(shown()).toBe(true)
    wait(1)
    expect(shown()).toBe(false)
  })

  it('焦点在提示的操作上时也暂停计时', () => {
    show({ id: 1, tone: 'success', text: '已忽略', action: { label: '撤销', onAction: vi.fn() } })
    act(() => { card().querySelector('button')!.focus() })
    wait(60_000)
    expect(shown()).toBe(true)
    act(() => { card().querySelector('button')!.blur() })
    wait(NOTICE_MS)
    expect(shown()).toBe(false)
  })

  it('同样的文字再报一次，也从头再停留五秒', () => {
    show({ id: 1, tone: 'success', text: '已保存' })
    wait(4000)
    show({ id: 2, tone: 'success', text: '已保存' })
    wait(4000)
    expect(shown()).toBe(true)
  })

  it('只有一个可选操作：点一下执行一次，提示随之收起', () => {
    show({ id: 1, tone: 'success', text: '已移入垃圾桶' })
    expect(card().querySelectorAll('button')).toHaveLength(0)
    const onAction = vi.fn()
    show({ id: 2, tone: 'success', text: '已移入垃圾桶', action: { label: '撤销', onAction } })
    const buttons = card().querySelectorAll('button')
    expect([...buttons].map((button) => button.textContent)).toEqual(['撤销'])
    act(() => { buttons[0]!.click() })
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(shown()).toBe(false)
  })

  it('模态框开着时，屏上其余部分对屏幕阅读器隐掉，提示和它的撤销仍读得到', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    act(() => {
      root.render(
        <MessagesProvider>
          <div id="screen">论文</div>
          <Notice notice={{ id: 1, tone: 'success', text: '已移入垃圾桶', action: { label: '撤销', onAction: () => {} } }} />
          <ModalDialog open onOpenChange={() => {}} size="wide"><ModalTitle>设置</ModalTitle></ModalDialog>
        </MessagesProvider>,
      )
    })
    expect(document.querySelector('#screen')!.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(card().querySelector('button')!.closest('[aria-hidden="true"]')).toBeNull()
    vi.unstubAllGlobals()
  })
})
