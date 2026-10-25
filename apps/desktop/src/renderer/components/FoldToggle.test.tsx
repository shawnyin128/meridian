// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FoldCaret } from './FoldCaret.js'
import { FoldToggle } from './FoldToggle.js'
import { Toolbar } from './Toolbar.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('FoldCaret', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('读屏跳过它；开着时没有收起的标记，收起时带上', () => {
    act(() => root.render(<FoldCaret open />))
    const caret = host.querySelector<HTMLElement>('.fold-caret')!
    expect([caret.getAttribute('aria-hidden'), caret.className]).toEqual(['true', 'fold-caret'])
    expect(caret.querySelector('svg path')!.getAttribute('d')).toBe('M6 9l6 6 6-6')
    act(() => root.render(<FoldCaret open={false} />))
    expect(caret.className).toBe('fold-caret is-closed')
  })
})

describe('FoldToggle', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('带标签的折叠钮是一个按钮：标签在前、箭头跟在后面，报出展开与否和它折叠的区域', () => {
    const onToggle = vi.fn()
    const render = (open: boolean) => act(() => root.render(
      <FoldToggle open={open} onToggle={onToggle} controls="group-body" className="group-toggle">主题 · 3</FoldToggle>,
    ))
    render(true)
    const toggle = host.querySelector<HTMLButtonElement>('button.fold-toggle')!
    expect(toggle.className).toBe('fold-toggle group-toggle')
    expect([toggle.getAttribute('aria-expanded'), toggle.getAttribute('aria-controls')]).toEqual(['true', 'group-body'])
    expect([toggle.firstChild!.textContent, toggle.lastElementChild!.className]).toEqual(['主题 · 3', 'fold-caret'])
    expect(toggle.querySelector('.fold-caret')!.classList.contains('is-closed')).toBe(false)
    act(() => toggle.click())
    expect(onToggle).toHaveBeenCalledOnce()
    render(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.querySelector('.fold-caret')!.classList.contains('is-closed')).toBe(true)
  })

  it('点它只折叠，不会点到它所在的那一行', () => {
    const onToggle = vi.fn()
    const onRow = vi.fn()
    act(() => root.render(
      <div onClick={onRow}>
        <FoldToggle open onToggle={onToggle}>标签</FoldToggle>
        <FoldToggle variant="caret" label="收起" open onToggle={onToggle} />
      </div>,
    ))
    for (const toggle of host.querySelectorAll<HTMLButtonElement>('.fold-toggle')) act(() => toggle.click())
    expect([onToggle.mock.calls.length, onRow.mock.calls.length]).toEqual([2, 0])
  })

  it('只有箭头的折叠钮是行内图标按钮，由 label 命名，同样报出展开与否和它折叠的区域', () => {
    act(() => root.render(<FoldToggle variant="caret" label="收起/展开「论文推送」" open={false} onToggle={vi.fn()} controls="g-inboxsub" />))
    const toggle = host.querySelector<HTMLButtonElement>('button.fold-toggle')!
    expect(toggle.matches('.icbtn.xs')).toBe(true)
    expect(toggle.getAttribute('aria-label')).toBe('收起/展开「论文推送」')
    expect([toggle.getAttribute('aria-expanded'), toggle.getAttribute('aria-controls')]).toEqual(['false', 'g-inboxsub'])
    expect([...toggle.children].map((child) => child.className)).toEqual(['fold-caret is-closed'])
  })

  it('end 跟在箭头后面，比如排在行尾的计数', () => {
    act(() => root.render(<FoldToggle open onToggle={vi.fn()} end={<span className="n">3</span>}>关注·关键词</FoldToggle>))
    const toggle = host.querySelector<HTMLButtonElement>('button.fold-toggle')!
    expect([toggle.firstChild!.textContent, ...[...toggle.children].map((child) => child.className)]).toEqual(['关注·关键词', 'fold-caret', 'n'])
  })

  it('给了 label 的带标签折叠钮由 label 命名，标签照样显示', () => {
    act(() => root.render(<FoldToggle label="展开详情" open={false} onToggle={vi.fn()}>安装命令</FoldToggle>))
    const toggle = host.querySelector<HTMLButtonElement>('button.fold-toggle')!
    expect([toggle.getAttribute('aria-label'), toggle.textContent]).toEqual(['展开详情', '安装命令'])
  })

  it('标签里有自己控件的折叠钮铺在箭头和标签上，由标签命名；标签里的链接不在按钮里，排在按钮后面', () => {
    const onToggle = vi.fn()
    const onOpen = vi.fn()
    act(() => root.render(
      <FoldToggle variant="composite" open={false} onToggle={onToggle} controls="diff" className="row-toggle">
        改了 <a href="#project:draft" onClick={onOpen}>draft</a>
      </FoldToggle>,
    ))
    const box = host.querySelector<HTMLElement>('.fold-toggle')!
    const toggle = box.querySelector<HTMLButtonElement>('button')!
    const link = host.querySelector('a')!
    expect([...box.children].map((child) => child.className)).toEqual(['fold-toggle-press row-toggle', 'fold-toggle-label', 'fold-caret is-closed'])
    expect(document.getElementById(toggle.getAttribute('aria-labelledby')!)!.textContent).toBe('改了 draft')
    expect([toggle.getAttribute('aria-expanded'), toggle.getAttribute('aria-controls')]).toEqual(['false', 'diff'])
    expect(toggle.contains(link)).toBe(false)
    expect(toggle.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    act(() => link.click())
    expect([onOpen.mock.calls.length, onToggle.mock.calls.length]).toEqual([1, 0])
    act(() => toggle.click())
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('在工具栏里，折叠钮是工具栏的一个控件，用方向键走到', () => {
    act(() => root.render(
      <Toolbar orientation="vertical">
        <div>
          <FoldToggle open onToggle={vi.fn()}>收件</FoldToggle>
          <FoldToggle variant="caret" label="收起" open onToggle={vi.fn()} />
        </div>
      </Toolbar>,
    ))
    const toggles = [...host.querySelectorAll<HTMLButtonElement>('.fold-toggle')]
    expect(toggles.map((toggle) => toggle.hasAttribute('data-radix-collection-item'))).toEqual([true, true])
  })
})
