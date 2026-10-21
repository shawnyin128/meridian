// @vitest-environment jsdom
import { act, useRef } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionMenu, MenuItem } from './ActionMenu.js'
import { ActionPopover } from './ActionPopover.js'
import { PickerPopover } from './PickerPopover.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

function Picker() {
  const field = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={field} />
      <PickerPopover open anchorBox={field} content={<div>候选</div>} />
    </>
  )
}

const LAYERS: Record<string, () => ReactElement> = {
  ActionMenu: () => <ActionMenu open trigger={<button type="button">更多</button>}><MenuItem>重命名</MenuItem></ActionMenu>,
  ActionPopover: () => <ActionPopover open trigger={<button type="button">列设置</button>}><div>列</div></ActionPopover>,
  PickerPopover: Picker,
}

describe('浮层与窗口边缘', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  let root: Root | null = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(600)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.restoreAllMocks()
  })

  for (const [name, Layer] of Object.entries(LAYERS)) {
    it(`${name} 离窗口边缘留 8px:可用宽度扣掉两侧的留边`, async () => {
      const host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      await act(async () => root!.render(<Layer />))
      await act(async () => { await new Promise((done) => setTimeout(done, 20)) })

      const wrapper = document.querySelector<HTMLElement>('[data-radix-popper-content-wrapper]')!
      expect(wrapper.style.getPropertyValue('--radix-popper-available-width')).toBe('784px')
    })
  }
})
