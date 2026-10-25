// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PickerPopover, type PickerPopoverProps } from './PickerPopover.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('PickerPopover', () => {
  let root: Root | null = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    document.body.innerHTML = ''
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.unstubAllGlobals()
  })

  /** The class list of the open candidate list, given the props a host passes beside the anchor. */
  const surface = (props: Pick<PickerPopoverProps, 'size' | 'contentClassName'>) => {
    act(() => root!.render(
      <PickerPopover open anchor={<input aria-label="主题" />} content={<div className="mi rrow">推测解码</div>} {...props} />,
    ))
    return document.querySelector('[role="dialog"]')!.className
  }

  it('is a candidate list as wide as its field unless a long list or a results panel takes its size, under the classes a host adds', () => {
    expect([
      surface({}),
      surface({ size: 'tall' }),
      surface({ size: 'wide', contentClassName: 'sres' }),
    ]).toEqual(['pickhits', 'pickhits pickhits--tall', 'pickhits pickhits--wide sres'])
  })
})
