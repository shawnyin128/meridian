// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Breadcrumb } from './Breadcrumb.js'
import { TitleBar } from './TitleBar.js'
import { TooltipProvider } from './Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('TitleBar and Breadcrumb', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // A segment measures whether it fits, and jsdom has no ResizeObserver.
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

  it('zooms the window on a double-click on the bar, never on a control in it', () => {
    const zoom = vi.fn()
    act(() => root.render(<TitleBar onZoom={zoom}><button type="button">侧栏</button><span className="free">空白</span></TitleBar>))
    act(() => { host.querySelector('button')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    expect(zoom).not.toHaveBeenCalled()
    act(() => { host.querySelector('.free')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    act(() => { host.querySelector('.titlebar')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    expect(zoom).toHaveBeenCalledTimes(2)
  })

  it('links every segment before the last that has a way back, and leaves the current one plain', () => {
    const back = vi.fn()
    const current = vi.fn()
    act(() => root.render(
      <TooltipProvider>
        <Breadcrumb id="crumb" trail={[{ text: '我的库' }, { text: '论文', onClick: back }, { text: '主题', onClick: current }]} />
      </TooltipProvider>,
    ))
    const segments = [...host.querySelectorAll<HTMLElement>('#crumb .cseg')]
    expect(segments.map((segment) => [segment.tagName, segment.textContent])).toEqual([['SPAN', '我的库'], ['BUTTON', '论文'], ['SPAN', '主题']])
    expect(host.querySelectorAll('#crumb .csep')).toHaveLength(2)
    act(() => { segments[1]!.click() })
    expect(back).toHaveBeenCalledTimes(1)
    expect(current).not.toHaveBeenCalled()
  })

  it('draws no trail when there is nowhere to show', () => {
    expect(renderToStaticMarkup(<Breadcrumb trail={[]} />)).toBe('<div class="crumb"></div>')
  })
})
