// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebounced } from './useDebounced.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let root: Root | null = null
let settle: () => void = () => {}

/** Shows the settled value of `value`. */
function Probe({ value }: { value: string }) {
  const [settled, flush] = useDebounced(value, 600)
  settle = flush
  return <output>{settled}</output>
}

const shown = () => document.querySelector('output')!.textContent
const show = (value: string) => act(() => root!.render(<Probe value={value} />))
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('停下来才算数的值', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    document.body.innerHTML = '<div></div>'
    root = createRoot(document.body.firstElementChild!)
  })

  afterEach(() => {
    act(() => root!.unmount())
    root = null
    vi.useRealTimers()
  })

  it('一开始的值直接算数，之后的值要停够时间才算，中途再改就重新计时', () => {
    show('a')
    expect(shown()).toBe('a')
    show('ab')
    wait(599)
    show('abc')
    wait(599)
    expect(shown()).toBe('a')
    wait(1)
    expect(shown()).toBe('abc')
  })

  it('立刻结算时当前的值马上算数，不再等计时', () => {
    show('a')
    show('ab')
    act(() => settle())
    expect(shown()).toBe('ab')
  })
})
