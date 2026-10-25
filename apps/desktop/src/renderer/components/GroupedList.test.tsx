// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Group, GroupedList } from './GroupedList.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('GroupedList', () => {
  it('不画自己的盒子：分组的标题和条目照旧排在列表外面的网格、栏或流里', () => {
    expect(renderToStaticMarkup(<GroupedList><Group title="今天">条目</Group></GroupedList>))
      .toBe('<div class="grouped-list"><div class="section-heading section-heading--group">今天</div>条目</div>')
  })

  it('一组先是分组这一级的标题，写着条数和右端的操作，再是它的条目，中间没有包裹', () => {
    expect(renderToStaticMarkup(
      <Group title="进行中" count={3} actions={<button type="button">新建</button>}><p>条目</p></Group>,
    )).toBe('<div class="section-heading section-heading--group"><span>进行中<span class="heading-count"> · 3</span></span>'
      + '<div class="section-heading-actions"><button type="button">新建</button></div></div><p>条目</p>')
  })

  it('能折叠的一组，标题本身是折叠钮：同一级的标题，箭头跟在标题和条数后面，报出展开与否和它折叠的内容；操作不在钮里', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onToggle = vi.fn()
    const render = (open: boolean, sticky: boolean) => act(() => root.render(
      <Group title="主题" count={2} fold={{ open, onToggle }} sticky={sticky} actions={<button type="button">全部忽略</button>}>
        内容
      </Group>,
    ))
    for (const sticky of [false, true]) {
      render(true, sticky)
      const heading = host.querySelector('.collapsible-group > .section-heading')!
      expect(heading.className, String(sticky)).toBe('section-heading section-heading--group collapsible-group-head')
      const toggle = heading.querySelector<HTMLButtonElement>('.fold-toggle')!
      expect([...toggle.children].map((child) => child.className), String(sticky)).toEqual(['', 'fold-caret'])
      expect(toggle.textContent).toBe('主题 · 2')
      expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBe(host.querySelector('.collapsible-group-body'))
      expect(toggle.contains(heading.querySelector('.section-heading-actions'))).toBe(false)
      expect(host.querySelector('.collapsible-group')!.classList.contains('collapsible-group--sticky')).toBe(sticky)
      render(false, sticky)
      expect([toggle.getAttribute('aria-expanded'), toggle.lastElementChild!.matches('.is-closed'), host.querySelector('.collapsible-group-body')])
        .toEqual(['false', true, null])
    }
    act(() => toggleOf(host).click())
    expect(onToggle).toHaveBeenCalledTimes(1)
    act(() => host.querySelector<HTMLButtonElement>('.section-heading-actions button')!.click())
    expect(onToggle).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    host.remove()
  })

  it('列表出现时开着的分组和由外部打开的分组都直接整组显示，只有点标题打开的分组才长出来', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    const root = createRoot(host)
    const body = () => host.querySelector('.collapsible-group-body')
    const render = (open: boolean) => act(() => root.render(
      <Group title="标题" fold={{ open, onToggle: vi.fn() }}>内容</Group>,
    ))
    render(true)
    expect(body()?.className).toBe('collapsible-group-body')
    act(() => toggleOf(host).click())
    render(false)
    act(() => toggleOf(host).click())
    render(true)
    expect(body()?.className).toBe('collapsible-group-body is-opening')
    act(() => toggleOf(host).click())
    render(false)
    render(true)
    expect(body()?.className).toBe('collapsible-group-body')
    act(() => root.unmount())
  })
})

const toggleOf = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.collapsible-group-head .fold-toggle')!
