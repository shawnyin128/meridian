// @vitest-environment jsdom
import { act, useEffect, useLayoutEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElementWidth } from './useElementWidth.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** The resize callbacks observing each element, so a test can resize one. */
const observers = new Map<Element, () => void>()
const disconnected: Element[] = []

/** The phase React is in: the layout of a commit, before the browser paints it, or the effects after the paint. */
let phase: 'render' | 'layout' | 'after paint' = 'render'

/** A box showing its own measured width. */
function Box() {
  useLayoutEffect(() => { phase = 'layout' })
  useEffect(() => { phase = 'after paint' })
  const box = useRef<HTMLDivElement>(null)
  const width = useElementWidth(box)
  return <div ref={box} data-width={width} />
}

describe('useElementWidth', () => {
  let root: Root
  let host: HTMLDivElement
  let width: number
  /** The phase each read of an element's width came in. */
  let reads: string[]

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    observers.clear()
    disconnected.length = 0
    width = 640
    reads = []
    phase = 'render'
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => {
      reads.push(phase)
      return width
    })
    vi.stubGlobal('ResizeObserver', class {
      private element: Element | null = null
      constructor(private readonly changed: () => void) {}
      observe(element: Element) {
        this.element = element
        observers.set(element, this.changed)
      }
      disconnect() { if (this.element !== null) disconnected.push(this.element) }
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('measures the element while its first commit is laid out, so it is first painted at its width', () => {
    act(() => root.render(<Box />))
    expect(reads[0]).toBe('layout')
    expect(host.querySelector('div')!.dataset.width).toBe('640')
  })

  it('follows the element as it changes size', () => {
    act(() => root.render(<Box />))
    const box = host.querySelector('div')!
    width = 480
    act(() => observers.get(box)!())
    expect(box.dataset.width).toBe('480')
  })

  it('stops watching the element once the caller unmounts', () => {
    act(() => root.render(<Box />))
    const box = host.querySelector('div')!
    act(() => root.render(<></>))
    expect(disconnected).toEqual([box])
  })
})
