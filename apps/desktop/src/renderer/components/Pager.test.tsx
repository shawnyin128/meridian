// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { Pager } from './Pager.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('Pager', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const show = (onPage = vi.fn()) => act(() => root.render(
    <MessagesProvider>
      <Pager total={100} page={2} size={20} sizes={[20, 30, 50]} onPage={onPage} onSize={vi.fn()} />
    </MessagesProvider>,
  ))

  it('页码和上一页、下一页是一个 Tab 停靠点，方向键在它们之间走', async () => {
    show()
    const pager = host.querySelector<HTMLElement>('.pager')!
    expect([...pager.querySelectorAll<HTMLElement>('*'), pager].filter((element) => element.tabIndex >= 0)).toEqual([pager])
    await act(async () => { pager.focus() })
    expect(document.activeElement!.getAttribute('aria-label')).toBe('上一页')
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      await new Promise((done) => setTimeout(done, 0))
    })
    expect(document.activeElement!.getAttribute('aria-label')).toBe('第 1 页')
  })

  it('当前页报 aria-current="page"，每个页码按页命名，上一页和下一页是有名字的图标按钮', () => {
    const onPage = vi.fn()
    show(onPage)
    const pages = [...host.querySelectorAll<HTMLButtonElement>('.pager .pgbtn')]
    expect(pages.map((button) => [button.textContent, button.getAttribute('aria-label'), button.getAttribute('aria-current')]))
      .toEqual([['1', '第 1 页', null], ['2', '第 2 页', 'page'], ['3', '第 3 页', null], ['5', '第 5 页', null]])
    const [previous, next] = ['上一页', '下一页'].map((name) => host.querySelector<HTMLButtonElement>(`.pager [aria-label="${name}"]`)!)
    expect([previous!, next!].map((button) => [button.classList.contains('icbtn'), button.querySelector('svg') !== null, button.textContent]))
      .toEqual([[true, true, ''], [true, true, '']])
    act(() => next!.click())
    expect(onPage).toHaveBeenCalledWith(3)
  })
})
