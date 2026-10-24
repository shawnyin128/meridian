// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWheelZoom } from './useWheelZoom.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A zoomable area that hands every zoom it is asked for to `onZoom`. */
function Area({ onZoom }: { onZoom: (factor: number, at: { x: number; y: number }) => void }) {
  const area = useRef<HTMLDivElement>(null)
  useWheelZoom(area, onZoom)
  return <div className="area" ref={area} />
}

describe('useWheelZoom', () => {
  let root: Root
  let host: HTMLDivElement
  const onZoom = vi.fn()

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    onZoom.mockReset()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<Area onZoom={onZoom} />))
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  /** Turns the wheel over the area; returns whether the area kept the event from scrolling. */
  const wheel = (init: WheelEventInit) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
    act(() => { host.querySelector('.area')!.dispatchEvent(event) })
    return event.defaultPrevented
  }
  /** The factor of the zoom a pinch with vertical delta `deltaY` asks for. */
  const pinch = (deltaY: number) => {
    onZoom.mockClear()
    wheel({ ctrlKey: true, deltaY })
    return onZoom.mock.calls[0]![0] as number
  }

  it('leaves a scroll without Ctrl or ⌘ to scroll, and zooms about the pointer on a pinch or a Ctrl- or ⌘-scroll', () => {
    expect([wheel({ deltaY: -100 }), wheel({ deltaX: 80 }), wheel({ shiftKey: true, deltaY: -100 })]).toEqual([false, false, false])
    expect(onZoom).not.toHaveBeenCalled()
    expect([wheel({ ctrlKey: true, deltaY: -100, clientX: 30, clientY: 40 }), wheel({ metaKey: true, deltaY: -100, clientX: 50, clientY: 60 })])
      .toEqual([true, true])
    expect(onZoom.mock.calls).toEqual([
      [expect.closeTo(Math.exp(0.15), 10), { x: 30, y: 40 }],
      [expect.closeTo(Math.exp(0.15), 10), { x: 50, y: 60 }],
    ])
  })

  it('滚轮和双指缩放按增量指数连续变化：几小步等于一大步，来回同样的增量回到原比例', () => {
    expect(pinch(-100)).toBeCloseTo(Math.exp(0.15), 10)
    expect(pinch(-3)).toBeGreaterThan(1)
    expect(pinch(-3)).toBeLessThan(1.01)
    let stepped = 1
    for (let step = 0; step < 20; step += 1) stepped *= pinch(-5)
    expect(stepped).toBeCloseTo(pinch(-100), 10)
    expect(pinch(-40) * pinch(40)).toBeCloseTo(1, 10)
  })
})
