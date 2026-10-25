// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { StatTile } from './StatTile.js'
import { ZoomControl, zoomStep } from './ZoomControl.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const LABELS = { out: '缩小', in: '放大', reset: '回到 100%' }

describe('ZoomControl', () => {
  it('一步放大或缩小 20%，落在整十的百分比上，不论从哪里起步', () => {
    expect([zoomStep(1, 1), zoomStep(1, -1), zoomStep(0.87, -1), zoomStep(1.44, 1), zoomStep(2.2, 1)]).toEqual([1.2, 0.8, 0.7, 1.6, 2.4])
  })

  it('依次是缩小、百分比和放大；按钮报出方向，点百分比复位，到了上限放大不可按', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const onZoom = vi.fn()
    const onReset = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<ZoomControl place="corner" zoom={1.8} min={0.6} max={1.8} onZoom={onZoom} onReset={onReset} labels={LABELS} />))
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.zoom-control button')]
    expect(buttons.map((button) => [button.getAttribute('aria-label') ?? button.textContent, button.disabled]))
      .toEqual([['缩小', false], ['180%', false], ['放大', true]])
    expect(host.querySelector('.zoom-control')!.className).toBe('zoom-control zoom-control--corner')
    act(() => buttons[0]!.click())
    act(() => buttons[1]!.click())
    expect([onZoom.mock.calls, onReset.mock.calls.length]).toEqual([[[-1]], 1])
    act(() => root.unmount())
  })
})

describe('StatTile', () => {
  it('数字在上、说明在下，铺在卡片上；要注意的数字只是字用错误色', () => {
    expect(renderToStaticMarkup(<StatTile value={3} label="逾期任务" state="error" />))
      .toBe('<div class="card-surface stat-tile stat-tile--error"><b class="stat-tile-value">3</b><span class="stat-tile-label">逾期任务</span></div>')
    expect(renderToStaticMarkup(<StatTile value={12} label="进行中的项目" />)).toContain('class="card-surface stat-tile"')
  })
})
