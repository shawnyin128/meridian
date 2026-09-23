// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FadeText } from './FadeText.js'

describe('FadeText', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  const render = (scrollWidth: number, clientWidth: number): string => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth)
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<FadeText className="record-line">三个模块的消融</FadeText>))
    const className = host.querySelector('.fade-text')!.className
    act(() => root.unmount())
    return className
  }

  it('放得下时整段显示,不淡出', () => {
    expect(render(80, 120)).toBe('fade-text record-line')
  })

  it('放不下时才在右边淡出', () => {
    expect(render(200, 120)).toBe('fade-text record-line clipped')
  })
})
