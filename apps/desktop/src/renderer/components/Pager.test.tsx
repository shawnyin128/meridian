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

  const show = (onPage = vi.fn(), total = 100, size = 20) => act(() => root.render(
    <MessagesProvider>
      <Pager total={total} page={2} size={size} onPage={onPage} />
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

  it('一页装得下全部条目时不出现，多出一条就出现，且没有每页条数的选择', () => {
    show(vi.fn(), 25, 25)
    expect(host.querySelector('.pagebar')).toBeNull()
    show(vi.fn(), 26, 25)
    expect(host.querySelector('.pagebar')).not.toBeNull()
    expect(host.querySelector('.pagebar .segmented-control')).toBeNull()
    expect([...host.querySelectorAll('.pager .pgbtn')].map((button) => button.textContent)).toEqual(['1', '2'])
  })

  it('放在一节里时紧跟在该节列表后，不进页脚', () => {
    act(() => root.render(
      <MessagesProvider>
        <Pager placement="section" total={30} page={1} size={10} onPage={vi.fn()} />
      </MessagesProvider>,
    ))
    expect(host.firstElementChild!.className).toBe('pagebar')
    expect(host.querySelector('.desk-foot')).toBeNull()
  })
})
