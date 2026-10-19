// @vitest-environment jsdom
import { act, createRef } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMBEDDED_LIST_ROW_LIMIT, RowActions, StructuredList, StructuredRow } from './StructuredList.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('StructuredList', () => {
  it('uses a button only for an actionable row', () => {
    const interactive = renderToStaticMarkup(
      <StructuredList><StructuredRow onActivate={() => undefined}>项目</StructuredRow></StructuredList>,
    )
    const staticRow = renderToStaticMarkup(
      <StructuredList><StructuredRow>项目</StructuredRow></StructuredList>,
    )
    expect(interactive).toContain('<button')
    expect(staticRow).toContain('<div class="structured-row"')
  })

  it('keeps a composite row a div so the controls inside it are never nested in a button', () => {
    const html = renderToStaticMarkup(
      <StructuredRow composite onActivate={() => undefined}><button type="button">归档</button></StructuredRow>,
    )
    expect(html).toBe(
      '<div class="structured-row structured-row--composite" data-row-actions=""><button type="button">归档</button></div>',
    )
  })

  it('marks the row whose detail is open with the shared selected variant', () => {
    expect(renderToStaticMarkup(<StructuredRow selected onActivate={() => undefined}>项目</StructuredRow>))
      .toContain('class="structured-row structured-row--selected"')
    expect(renderToStaticMarkup(<StructuredRow onActivate={() => undefined}>项目</StructuredRow>))
      .not.toContain('structured-row--selected')
  })

  it('accepts a route-specific column contract', () => {
    const html = renderToStaticMarkup(
      <StructuredRow columns="100px minmax(0, 1fr)">项目</StructuredRow>,
    )
    expect(html).toContain('grid-template-columns:100px minmax(0, 1fr)')
  })

  it('accepts a DOM ref for a static composite row', () => {
    const row = createRef<HTMLDivElement>()
    const html = renderToStaticMarkup(<StructuredRow rowRef={row}>项目</StructuredRow>)
    expect(html).toContain('class="structured-row"')
  })

  it('fades a list that scrolls inside itself toward the edge whose rows are hidden', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    // Every row draws a 38px box, stacked from the top of its list, so the list caps itself at five rows.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rows = [...this.closest('.structured-list')!.querySelectorAll('.structured-row')]
      return { top: 0, bottom: 38 * (rows.indexOf(this) + 1) } as DOMRect
    })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const rows = Array.from({ length: EMBEDDED_LIST_ROW_LIMIT + 2 }, (_, at) => <StructuredRow key={at}>{at}</StructuredRow>)
    act(() => root.render(<StructuredList variant="embedded">{rows}</StructuredList>))
    const list = host.querySelector<HTMLElement>('.structured-list--scrollable')!
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
      <StructuredList variant="embedded">
        <StructuredRow>想法一</StructuredRow>
        <StructuredRow>想法二</StructuredRow>
      </StructuredList>,
    )
    expect(html).toContain('class="structured-list structured-list--embedded"')
    expect(html.match(/class="structured-row"/g)).toHaveLength(2)
  })

  it('行尾的操作放进一个槽，行自己就是这个槽的宿主，按钮行不当宿主', () => {
    const html = renderToStaticMarkup(
      <StructuredRow composite onActivate={() => undefined}>
        <span>想法</span>
        <RowActions><button type="button">删除</button></RowActions>
      </StructuredRow>,
    )
    expect(html).toContain('data-row-actions=""')
    expect(html).toContain('<span class="row-actions"><button type="button">删除</button></span>')
    expect(renderToStaticMarkup(<StructuredRow onActivate={() => undefined}>想法</StructuredRow>))
      .not.toContain('data-row-actions')
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
      const list = this.closest('.structured-list')!
      const shown = [...list.querySelectorAll<HTMLElement>('[data-h]')].filter((row) => row.closest('[hidden]') === null)
      const until = shown.indexOf(this) + 1
      const bottom = 100 + shown.slice(0, until).reduce((sum, row) => sum + Number(row.dataset.h), 0)
      return { top: this === list ? 100 : bottom - Number(this.dataset.h), bottom } as DOMRect
    })
  }

  const mount = async (rows: number[], tail?: ReactNode) => {
    await act(async () => root.render(
      <StructuredList variant="embedded">
        {rows.map((h, index) => <StructuredRow key={index} data-h={h}>{`行 ${index + 1}`}</StructuredRow>)}
        {tail}
      </StructuredList>,
    ))
    return host.querySelector<HTMLElement>('.structured-list')!
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
    expect(list.classList.contains('structured-list--scrollable')).toBe(false)
    expect(list.style.maxHeight).toBe('')
  })

  it('第六行起在列表里滚动，高度正好是前五行实际渲染的高度', async () => {
    const list = await mount([41, 41, 41, 41, 41, 41])
    expect(list.classList.contains('structured-list--scrollable')).toBe(true)
    expect(list.style.maxHeight).toBe('205px')
  })

  it('行高不一时也按前五行量，不按固定行高算', async () => {
    const list = await mount([170, 120, 170, 96, 170, 170, 170])
    expect(list.style.maxHeight).toBe('726px')
  })

  it('分组里的行也算行，收起的分组里的行不算', async () => {
    const group = (hidden: boolean) => (
      <div className="collapsible-group" data-h={0}>
        <div hidden={hidden}>
          {[0, 1, 2].map((index) => <StructuredRow key={index} data-h={38}>{`已归档 ${index + 1}`}</StructuredRow>)}
        </div>
      </div>
    )
    const open = await mount([41, 41, 41], group(false))
    expect(open.style.maxHeight).toBe(`${41 * 3 + 38 * 2}px`)
    const folded = await mount([41, 41, 41], group(true))
    expect(folded.classList.contains('structured-list--scrollable')).toBe(false)
  })
})

describe('双击行', () => {
  let root: Root
  let host: HTMLDivElement

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

  /** Whether the press number `detail` on `target` had its default, the text selection, prevented. */
  const pressed = (target: Element, detail: number) => {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('能打开东西的行，双击的第二下按下不选中字；第一下照常，拖选也照常', () => {
    act(() => root.render(
      <StructuredList>
        <StructuredRow onActivate={() => undefined}><span className="probe">打开</span></StructuredRow>
        <StructuredRow composite onActivate={() => undefined}><span className="probe">打开</span></StructuredRow>
      </StructuredList>,
    ))
    const [button, composite] = [...host.querySelectorAll('.probe')]
    expect([pressed(button!, 1), pressed(button!, 2), pressed(composite!, 1), pressed(composite!, 2)])
      .toEqual([false, true, false, true])
  })

  it('不能打开的行和行里的输入框，双击照常选中字', () => {
    act(() => root.render(
      <StructuredList>
        <StructuredRow><span className="probe">一段结论</span></StructuredRow>
        <StructuredRow composite onActivate={() => undefined}><input className="field" /></StructuredRow>
      </StructuredList>,
    ))
    expect([pressed(host.querySelector('.probe')!, 2), pressed(host.querySelector('.field')!, 2)]).toEqual([false, false])
  })
})
