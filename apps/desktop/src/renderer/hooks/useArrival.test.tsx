// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ARRIVAL_FLASH_MS, land, useArrival } from './useArrival.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Each element scrolled into view, by its id, with the block it was scrolled to. */
let scrolled: [string, ScrollLogicalPosition | undefined][]

/** Rows `a` to `c`, of which `shown` are on the page, landing on `arrival` once `ready`. */
function Rows({ arrival, ready = true, shown = ['a', 'b', 'c'], onLanded }: {
  arrival: { row: string } | null
  ready?: boolean
  shown?: string[]
  onLanded?: () => void
}) {
  useArrival(arrival, ready, ({ row }) => document.getElementById(row), {
    block: 'center', ...(onLanded === undefined ? {} : { onLanded }),
  })
  return <>{shown.map((id) => <div key={id} id={id} />)}</>
}

describe('landing on a jump\'s target', () => {
  let root: Root
  let host: HTMLDivElement
  const arrived = () => [...host.querySelectorAll('[data-arrived]')].map((row) => row.id)

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    scrolled = []
    // jsdom lays nothing out and has no scrollIntoView.
    Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
      scrolled.push([this.id, typeof options === 'object' ? options.block : undefined])
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  it('scrolls the target into view and flashes it for the two pulses of the flash, then stops', () => {
    act(() => root.render(<Rows arrival={null} />))
    act(() => land(host.querySelector('#b')!, 'start'))
    expect([scrolled, arrived()]).toEqual([[['b', 'start']], ['b']])
    act(() => { vi.advanceTimersByTime(ARRIVAL_FLASH_MS - 1) })
    expect(arrived()).toEqual(['b'])
    act(() => { vi.advanceTimersByTime(1) })
    expect(arrived()).toEqual([])
  })

  it('starts the flash over when the same target is landed on again while it flashes', () => {
    act(() => root.render(<Rows arrival={null} />))
    const row = host.querySelector('#a')!
    act(() => land(row))
    act(() => { vi.advanceTimersByTime(ARRIVAL_FLASH_MS / 2) })
    const watch = new MutationObserver(() => {})
    watch.observe(row, { attributes: true, attributeFilter: ['data-arrived'], attributeOldValue: true })
    act(() => land(row))
    act(() => { vi.advanceTimersByTime(ARRIVAL_FLASH_MS - 1) })
    expect(arrived()).toEqual(['a'])
    act(() => { vi.advanceTimersByTime(1) })
    expect(arrived()).toEqual([])
    // The mark came off and back on, which restarts its animation, then off once the flash ended.
    expect(watch.takeRecords().map((change) => (change.oldValue === null ? 'on' : 'off'))).toEqual(['off', 'on', 'off'])
    watch.disconnect()
  })

  it('lands on a jump\'s target once the screen is ready, once per jump, and calls onLanded', () => {
    const onLanded = vi.fn()
    const jump = { row: 'c' }
    act(() => root.render(<Rows arrival={jump} ready={false} onLanded={onLanded} />))
    expect([scrolled, onLanded.mock.calls.length]).toEqual([[], 0])
    act(() => root.render(<Rows arrival={jump} onLanded={onLanded} />))
    expect([scrolled, arrived(), onLanded.mock.calls.length]).toEqual([[['c', 'center']], ['c'], 1])
    act(() => root.render(<Rows arrival={jump} onLanded={onLanded} shown={['c', 'b', 'a']} />))
    expect([scrolled.length, onLanded.mock.calls.length]).toEqual([1, 1])
  })

  it('lands again on a new jump to the same target, and after the jump was cleared', () => {
    act(() => root.render(<Rows arrival={{ row: 'a' }} />))
    act(() => root.render(<Rows arrival={{ row: 'a' }} />))
    const cleared = { row: 'b' }
    act(() => root.render(<Rows arrival={cleared} />))
    act(() => root.render(<Rows arrival={null} />))
    act(() => root.render(<Rows arrival={cleared} />))
    expect(scrolled.map(([id]) => id)).toEqual(['a', 'a', 'b', 'b'])
  })

  it('takes a jump whose target is not on the page as done, without landing later', () => {
    const onLanded = vi.fn()
    const jump = { row: 'c' }
    act(() => root.render(<Rows arrival={jump} shown={['a']} onLanded={onLanded} />))
    act(() => root.render(<Rows arrival={jump} onLanded={onLanded} />))
    expect([scrolled, onLanded.mock.calls.length]).toEqual([[], 1])
  })
})
