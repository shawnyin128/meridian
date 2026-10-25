// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Item, ItemOpen, RowActions } from './Item.js'
import { List } from './List.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('Item as a row', () => {
  it('uses a button only for an actionable row', () => {
    expect(renderToStaticMarkup(<List><Item onActivate={() => undefined}>项目</Item></List>)).toContain('<button')
    expect(renderToStaticMarkup(<List><Item>项目</Item></List>)).toContain('<div class="item item--row" data-row-actions=""')
  })

  it('keeps a composite row a div so the controls inside it are never nested in a button', () => {
    expect(renderToStaticMarkup(<Item composite onActivate={() => undefined}><button type="button">归档</button></Item>)).toBe(
      '<div class="item item--row item--actionable" data-row-actions=""><button type="button">归档</button></div>',
    )
  })

  it('marks the row whose detail is open with the shared selected variant', () => {
    expect(renderToStaticMarkup(<Item selected onActivate={() => undefined}>项目</Item>))
      .toContain('class="item item--row item--actionable item--selected"')
    expect(renderToStaticMarkup(<Item onActivate={() => undefined}>项目</Item>)).not.toContain('item--selected')
  })

  it('lays a row that brings its own columns out on them', () => {
    const html = renderToStaticMarkup(<Item columns="100px minmax(0, 1fr)">项目</Item>)
    expect(html).toContain('class="item item--row item--columns"')
    expect(html).toContain('grid-template-columns:100px minmax(0, 1fr)')
  })

  it('hands its DOM element to a ref when it is not a button', () => {
    const row = createRef<HTMLElement>()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<Item elementRef={row}>项目</Item>))
    expect(row.current?.className).toBe('item item--row')
    act(() => root.unmount())
  })

  it('行尾的操作放进一个槽，行自己就是这个槽的宿主，按钮行不当宿主', () => {
    const html = renderToStaticMarkup(
      <Item composite onActivate={() => undefined}>
        <span>想法</span>
        <RowActions><button type="button">删除</button></RowActions>
      </Item>,
    )
    expect(html).toContain('data-row-actions=""')
    expect(html).toMatch(/<span [^>]*class="row-actions"[^>]*><button type="button">删除<\/button><\/span>/)
    expect(renderToStaticMarkup(<Item onActivate={() => undefined}>想法</Item>)).not.toContain('data-row-actions')
  })
})

describe('Item as a card', () => {
  it('owns the shared card shell of projects, ideas, papers and the feed', () => {
    const html = renderToStaticMarkup(
      <Item density="card" className="domain-card" selected muted onActivate={() => undefined}>研究对象</Item>,
    )
    expect(html).toContain('<article class="item item--card item--actionable item--selected item--muted domain-card" data-row-actions=""')
  })

  it('an actionable card is composite: it is no button itself and holds the button that opens it', () => {
    const html = renderToStaticMarkup(
      <Item density="card" onActivate={() => undefined}>
        <ItemOpen>MoE 路由分析</ItemOpen><button type="button">更多</button>
      </Item>,
    )
    expect(html).not.toContain('role="button"')
    expect(html).not.toContain('tabindex=')
    expect(html).toContain('<button type="button" class="item-open">MoE 路由分析</button>')
  })

  it('opens once from its name button and once from a click elsewhere on the card', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const onActivate = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(
      <Item density="card" onActivate={onActivate} title={<ItemOpen>MoE 路由分析</ItemOpen>}>
        <p>统计各层路由的负载分布</p>
      </Item>,
    ))
    act(() => host.querySelector<HTMLButtonElement>('.item-open')!.click())
    expect(onActivate).toHaveBeenCalledTimes(1)
    act(() => host.querySelector('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onActivate).toHaveBeenCalledTimes(2)
    act(() => root.unmount())
    host.remove()
  })

  it('does not claim button semantics without an activation action', () => {
    const html = renderToStaticMarkup(<Item density="card">新建项目</Item>)
    expect(html).not.toContain('role="button"')
    expect(html).not.toContain('tabindex=')
    expect(html).not.toContain('item--actionable')
  })
})

describe('Item 的槽', () => {
  it('一行里依次是前导标记、标题和次要信息、行自己的格子、标签、行尾和操作槽，更多菜单在槽的最后', () => {
    const html = renderToStaticMarkup(
      <Item
        leading={<i>●</i>} title="KV 量化" meta="3 篇论文" tags={<b>P0</b>} trailing="10月24日"
        actions={<button type="button">删除</button>} menu={<button type="button">更多</button>}
      ><u>格子</u></Item>,
    )
    // The slot's toolbar attributes are Toolbar's; only the order of the slots matters here.
    expect(html.replace(/ role="toolbar"[^>]*/, '')).toBe('<div class="item item--row item--slotted" data-row-actions="">'
      + '<span class="item-leading"><i>●</i></span>'
      + '<span class="item-main"><span class="item-title">KV 量化</span><span class="item-meta">3 篇论文</span></span>'
      + '<u>格子</u><span class="item-tags"><b>P0</b></span><span class="item-trailing">10月24日</span>'
      + '<span class="row-actions item-actions"><button type="button">删除</button><button type="button">更多</button></span></div>')
  })

  it('卡片把槽排在头一行，正文在它下面，槽能放下标题元素；两行的行把次要信息放到标题下面', () => {
    expect(renderToStaticMarkup(<Item density="card" title="KV 量化" trailing="10月24日"><p>正文</p></Item>))
      .toBe('<article class="item item--card item--slotted" data-row-actions=""><div class="item-head">'
        + '<div class="item-main"><div class="item-title">KV 量化</div></div><div class="item-trailing">10月24日</div></div>'
        + '<p>正文</p></article>')
    expect(renderToStaticMarkup(<Item lines={2} title="KV 量化" meta="3 篇论文" />)).toContain('class="item item--row item--slotted item--two-line"')
  })

  it('标了颜色的卡片把颜色交给自己的前沿，离开列表的卡片和关掉的行各有一个样子', () => {
    expect(renderToStaticMarkup(<Item density="card" mark="var(--hl-yellow)">高亮</Item>))
      .toBe('<article class="item item--card item--marked" style="--item-mark:var(--hl-yellow)" data-row-actions="">高亮</article>')
    expect(renderToStaticMarkup(<Item density="card" leaving>论文</Item>)).toContain('class="item item--card item--leaving"')
    expect(renderToStaticMarkup(<Item muted title="方向" />)).toContain('class="item item--row item--slotted item--muted"')
  })

  it('空的槽不画', () => {
    expect(renderToStaticMarkup(<Item title="KV 量化" meta={null} tags={false} />))
      .toBe('<div class="item item--row item--slotted" data-row-actions=""><span class="item-main"><span class="item-title">KV 量化</span></span></div>')
  })
})

describe('双击行', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  /** Whether the press number `detail` on `target` had its default, the text selection, prevented. */
  const pressed = (target: Element, detail: number) => {
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('能打开东西的行，双击的第二下按下不选中字；第一下照常，拖选也照常', () => {
    act(() => root.render(
      <List>
        <Item onActivate={() => undefined}><span className="probe">打开</span></Item>
        <Item composite onActivate={() => undefined}><span className="probe">打开</span></Item>
      </List>,
    ))
    const [button, composite] = [...host.querySelectorAll('.probe')]
    expect([pressed(button!, 1), pressed(button!, 2), pressed(composite!, 1), pressed(composite!, 2)])
      .toEqual([false, true, false, true])
  })

  it('不能打开的行和行里的输入框，双击照常选中字', () => {
    act(() => root.render(
      <List>
        <Item><span className="probe">一段结论</span></Item>
        <Item composite onActivate={() => undefined}><input className="field" /></Item>
      </List>,
    ))
    expect([pressed(host.querySelector('.probe')!, 2), pressed(host.querySelector('.field')!, 2)]).toEqual([false, false])
  })
})
