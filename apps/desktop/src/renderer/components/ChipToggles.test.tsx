// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChipToggles } from './ChipToggles.js'
import { tagClass } from './Tag.js'

const REASONS = [
  { value: 'inaccurate', label: '论文事实不准确' },
  { value: 'unhelpful', label: '综合没有帮助' },
  { value: 'missing', label: '遗漏重要内容' },
] as const

describe('ChipToggles', () => {
  let host: HTMLDivElement
  let root: Root
  let reported: string[][]

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    reported = []
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  function Reasons({ disabled = false }: { disabled?: boolean }) {
    const [value, setValue] = useState<string[]>([])
    return (
      <ChipToggles
        label="丢弃原因" value={value} options={REASONS} disabled={disabled}
        onChange={(next) => { reported.push(next); setValue(next) }}
      />
    )
  }

  const chips = () => [...host.querySelectorAll<HTMLButtonElement>('button')]

  it('is a named group of chips, each pressed while its value is picked', () => {
    act(() => root.render(<Reasons />))
    const group = host.querySelector('.chip-toggles')!
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-label')).toBe('丢弃原因')
    expect(chips().every((chip) => chip.classList.contains('tagchip'))).toBe(true)
    expect(chips().every((chip) => chip.className.startsWith(tagClass('neutral', 'chip')))).toBe(true)
    expect(host.querySelector('.segmented-control')).toBeNull()
    expect(chips().map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false'])
  })

  it('toggles each value in and out and reports the picks in the order they were turned on', () => {
    act(() => root.render(<Reasons />))
    act(() => chips()[2]!.click())
    act(() => chips()[0]!.click())
    act(() => chips()[2]!.click())
    expect(reported).toEqual([['missing'], ['missing', 'inaccurate'], ['inaccurate']])
    expect(chips().map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
  })

  it('takes no picks while disabled', () => {
    act(() => root.render(<Reasons disabled />))
    act(() => chips()[0]!.click())
    expect(reported).toEqual([])
    expect(chips().every((chip) => chip.disabled)).toBe(true)
  })

  it('is one Tab stop, and arrow keys move focus between the chips', async () => {
    act(() => root.render(<Reasons />))
    const group = host.querySelector<HTMLElement>('.chip-toggles')!
    expect([group, ...chips()].filter((element) => element.tabIndex === 0)).toEqual([group])
    act(() => group.focus())
    expect(document.activeElement).toBe(chips()[0])
    await act(async () => {
      chips()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.activeElement).toBe(chips()[1])
  })
})
