// @vitest-environment jsdom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Item } from './Item.js'
import { EMBEDDED_LIST_ROW_LIMIT, List, ListColumn } from './List.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('List', () => {
  it('fades a list that scrolls inside itself toward the edge whose rows are hidden', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    // Every row draws a 38px box, stacked from the top of its list, so the list caps itself at five rows.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rows = [...this.closest('.list')!.querySelectorAll('.item')]
      return { top: 0, bottom: 38 * (rows.indexOf(this) + 1) } as DOMRect
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const rows = Array.from({ length: EMBEDDED_LIST_ROW_LIMIT + 2 }, (_, at) => <Item key={at}>{at}</Item>)
    act(() => root.render(<List variant="embedded">{rows}</List>))
    const list = host.querySelector<HTMLElement>('.list--scrollable')!
    Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => 190 })
    Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => 266 })
    Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => 0 })
    act(() => { list.dispatchEvent(new Event('scroll')) })
    expect(list.dataset.fade).toBe('bottom')
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('marks an embedded list so only its adjacent rows receive separators', () => {
    const html = renderToStaticMarkup(
      <List variant="embedded">
        <Item>想法一</Item>
        <Item>想法二</Item>
      </List>,
    )
    expect(html).toContain('class="list list--embedded"')
    expect(html.match(/class="item item--row"/g)).toHaveLength(2)
  })
})

describe('嵌入列表的五行上限', () => {
  let root: Root
  let host: HTMLDivElement

  /**
   * Lays rows out top to bottom from y=100 at the heights in their `data-h`, the way a browser
   * would; a row inside a folded group (`hidden`) draws no box.
   */
  const layOut = () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      return (this.closest('[hidden]') === null ? [{}] : []) as unknown as DOMRectList
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const list = this.closest('.list')!
      const shown = [...list.querySelectorAll<HTMLElement>('[data-h]')].filter((row) => row.closest('[hidden]') === null)
      const until = shown.indexOf(this) + 1
      const bottom = 100 + shown.slice(0, until).reduce((sum, row) => sum + Number(row.dataset.h), 0)
      return { top: this === list ? 100 : bottom - Number(this.dataset.h), bottom } as DOMRect
    })
  }

  const mount = async (rows: number[], tail?: ReactNode) => {
    await act(async () => root.render(
      <List variant="embedded">
        {rows.map((h, index) => <Item key={index} data-h={h}>{`行 ${index + 1}`}</Item>)}
        {tail}
      </List>,
    ))
    return host.querySelector<HTMLElement>('.list')!
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    layOut()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('五行以内不滚动，留在页面流里', async () => {
    const list = await mount(Array.from({ length: EMBEDDED_LIST_ROW_LIMIT }, () => 41))
    expect(list.classList.contains('list--scrollable')).toBe(false)
    expect(list.style.maxHeight).toBe('')
  })

  it('第六行起在列表里滚动，高度正好是前五行实际渲染的高度', async () => {
    const list = await mount([41, 41, 41, 41, 41, 41])
    expect(list.classList.contains('list--scrollable')).toBe(true)
    expect(list.style.maxHeight).toBe('205px')
  })

  it('行高不一时也按前五行量，不按固定行高算', async () => {
    const list = await mount([170, 120, 170, 96, 170, 170, 170])
    expect(list.style.maxHeight).toBe('726px')
  })

  it('铺满容器的列表不按五行封顶，在容器给的高度里滚动并淡出', async () => {
    await act(async () => root.render(
      <List variant="embedded" rows="fill">
        {[41, 41, 41, 41, 41, 41, 41].map((h, index) => <Item key={index} data-h={h}>{`行 ${index + 1}`}</Item>)}
      </List>,
    ))
    const list = host.querySelector<HTMLElement>('.list')!
    expect([...list.classList]).toEqual(['list', 'list--embedded', 'list--fill'])
    expect(list.style.maxHeight).toBe('')
    Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => 200 })
    Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => 287 })
    act(() => { list.dispatchEvent(new Event('scroll')) })
    expect(list.dataset.fade).toBe('bottom')
  })

  it('一栏列表在容器给的高度里一起滚动，裁掉的边淡出', async () => {
    await act(async () => root.render(
      <ListColumn className="groups">
        <List><Item data-h={41}>行 1</Item></List>
        <List><Item data-h={41}>行 2</Item></List>
      </ListColumn>,
    ))
    const column = host.querySelector<HTMLElement>('.list-column')!
    expect([column.className, column.querySelectorAll(':scope>.list').length]).toEqual(['list-column groups', 2])
    Object.defineProperty(column, 'clientHeight', { configurable: true, get: () => 60 })
    Object.defineProperty(column, 'scrollHeight', { configurable: true, get: () => 90 })
    Object.defineProperty(column, 'scrollTop', { configurable: true, get: () => 30 })
    act(() => { column.dispatchEvent(new Event('scroll')) })
    expect(column.dataset.fade).toBe('top')
  })

  it('分组里的行也算行，收起的分组里的行不算', async () => {
    const group = (hidden: boolean) => (
      <div className="collapsible-group" data-h={0}>
        <div hidden={hidden}>
          {[0, 1, 2].map((index) => <Item key={index} data-h={38}>{`已归档 ${index + 1}`}</Item>)}
        </div>
      </div>
    )
    const open = await mount([41, 41, 41], group(false))
    expect(open.style.maxHeight).toBe(`${41 * 3 + 38 * 2}px`)
    const folded = await mount([41, 41, 41], group(true))
    expect(folded.classList.contains('list--scrollable')).toBe(false)
  })
})

describe('List focus when its focused item goes away', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  /** A list of button rows named by `names`, with `outside` a button after the list. */
  // The list notices a removal in a mutation observer, which runs after the render's own task.
  const render = (names: string[], outside = false) => act(async () => root.render(
    <>
      <List>{names.map((name) => <Item key={name} title={name} onActivate={() => {}} />)}</List>
      {outside ? <button type="button" id="outside">外面</button> : null}
    </>,
  ))
  /** The text of what holds the focus, or null while nothing in the page does. */
  const focused = () => (document.activeElement === null || document.activeElement === document.body ? null : document.activeElement.textContent)
  const row = (name: string) => [...host.querySelectorAll<HTMLElement>('.item')].find((item) => item.textContent === name)!

  it('moves the focus to the item now in the removed one\'s place, or to the one before it when it was the last', async () => {
    await render(['甲', '乙', '丙'])
    row('乙').focus()
    await render(['甲', '丙'])
    expect(focused()).toBe('丙')
    await render(['甲'])
    expect(focused()).toBe('甲')
  })

  it('takes the focus on an item\'s first control when the item is not one itself', async () => {
    await act(async () => root.render(
      <List>
        {['甲', '乙'].map((name) => (
          <Item key={name} density="card" composite onActivate={() => {}}><button type="button">{`打开${name}`}</button></Item>
        ))}
      </List>,
    ))
    host.querySelectorAll<HTMLButtonElement>('button')[0]!.focus()
    await act(async () => root.render(
      <List><Item key="乙" density="card" composite onActivate={() => {}}><button type="button">打开乙</button></Item></List>,
    ))
    expect(focused()).toBe('打开乙')
  })

  it('leaves the focus where it went when it moved out of the list before the item went away', async () => {
    await render(['甲', '乙'], true)
    row('乙').focus()
    host.querySelector<HTMLButtonElement>('#outside')!.focus()
    await render(['甲'], true)
    expect(document.activeElement?.id).toBe('outside')
  })
})
