// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCandidateKeys } from './useCandidateKeys.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A probe input wired to the hook: `data-active` mirrors the highlighted index for assertions. */
function Probe({ count, onChoose }: { count: number; onChoose: (index: number) => void }) {
  const keys = useCandidateKeys(count, onChoose)
  return <input data-active={keys.active} onKeyDown={keys.onKeyDown} />
}

/** Hang the probe into a real container and return its input. */
function mount(count: number, onChoose: (index: number) => void): HTMLInputElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  act(() => { createRoot(host).render(<Probe count={count} onChoose={onChoose} />) })
  return host.querySelector('input')!
}

/** Dispatch a keystroke on the input box. */
function press(input: HTMLInputElement, key: string): void {
  act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })
}

describe('useCandidateKeys', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
  })

  it('下键把 active 加一且不超过 count - 1', () => {
    const input = mount(2, () => {})
    press(input, 'ArrowDown')
    expect(input.dataset['active']).toBe('1')
    press(input, 'ArrowDown')
    expect(input.dataset['active']).toBe('1')
  })

  it('上键减一且不低于 0', () => {
    const input = mount(3, () => {})
    press(input, 'ArrowDown')
    press(input, 'ArrowDown')
    expect(input.dataset['active']).toBe('2')
    press(input, 'ArrowUp')
    expect(input.dataset['active']).toBe('1')
    press(input, 'ArrowUp')
    press(input, 'ArrowUp')
    expect(input.dataset['active']).toBe('0')
  })

  it('回车用当前 active 调 onChoose', () => {
    const onChoose = vi.fn()
    const input = mount(3, onChoose)
    press(input, 'ArrowDown')
    press(input, 'Enter')
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('count 变了 active 回到 0', () => {
    const onChoose = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => { root.render(<Probe count={3} onChoose={onChoose} />) })
    const input = host.querySelector('input')!
    press(input, 'ArrowDown')
    press(input, 'ArrowDown')
    expect(input.dataset['active']).toBe('2')

    act(() => { root.render(<Probe count={1} onChoose={onChoose} />) })
    expect(input.dataset['active']).toBe('0')
  })
})
