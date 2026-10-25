// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SplitColumn, SplitPage, SplitRail } from './SplitPage.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('SplitPage', () => {
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

  it('两栏是分栏页的直接子元素:正文栏交出自己的元素,右栏在自己的底色里淡出', () => {
    const main = createRef<HTMLDivElement>()
    act(() => root.render(
      <SplitPage columns="rail" className="probe"><SplitColumn ref={main} className="wkmain">正文</SplitColumn><SplitRail>属性</SplitRail></SplitPage>,
    ))
    const split = host.querySelector('.split-page')!
    expect([split.className, ...[...split.children].map((column) => column.className)])
      .toEqual(['split-page split-page--rail probe', 'split-column wkmain', 'split-rail'])
    expect(main.current).toBe(split.firstElementChild)
    expect([...split.children].map((column) => column.hasAttribute('data-fade-paint'))).toEqual([false, true])
  })
})
