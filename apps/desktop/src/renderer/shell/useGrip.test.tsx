// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GRIP_WIDTHS, useGrip } from './useGrip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A panel with the paper chat's limits and its grip as a direct child, as the shell lays them out. */
function Panel({ onResize, onClick }: { onResize: (width: number) => void; onClick: () => void }) {
  const startDrag = useGrip(GRIP_WIDTHS.paperChat, onResize, onClick)
  return <div className="panel"><div className="grip" onMouseDown={startDrag} /></div>
}

describe('useGrip', () => {
  let root: Root | null = null
  let grip: HTMLElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const mount = (onResize: (width: number) => void, onClick: () => void) => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<Panel onResize={onResize} onClick={onClick} />))
    const panel = host.querySelector<HTMLElement>('.panel')!
    panel.getBoundingClientRect = () => ({ width: 300 }) as DOMRect
    grip = host.querySelector<HTMLElement>('.grip')!
  }
  const press = (x: number) => act(() => { grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x })) })
  const move = (x: number) => act(() => { document.dispatchEvent(new MouseEvent('mousemove', { clientX: x })) })
  const release = () => act(() => { document.dispatchEvent(new MouseEvent('mouseup')) })

  it('拖动把手从按下时的宽度加上位移调宽，限在 240 到 480 之间，松手不算点击', () => {
    const onResize = vi.fn()
    const onClick = vi.fn()
    mount(onResize, onClick)

    press(100)
    move(150)
    expect(onResize).toHaveBeenLastCalledWith(350)
    move(1000)
    expect(onResize).toHaveBeenLastCalledWith(480)
    move(-1000)
    expect(onResize).toHaveBeenLastCalledWith(240)
    release()
    expect(onClick).not.toHaveBeenCalled()

    // Once released, moving the pointer resizes nothing.
    move(400)
    expect(onResize).toHaveBeenCalledTimes(3)
  })

  it('按下后移动不超过 3px 就松开算一次点击，不调宽', () => {
    const onResize = vi.fn()
    const onClick = vi.fn()
    mount(onResize, onClick)

    press(100)
    move(103)
    release()
    expect(onResize).not.toHaveBeenCalled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
