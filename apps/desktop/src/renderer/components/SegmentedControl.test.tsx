// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl.js'

const OPTIONS = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
] as const

describe('SegmentedControl', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const segments = () => [...host.querySelectorAll<HTMLButtonElement>('.segmented-control>button')]

  function Scale({ onChange }: { onChange?: (value: string) => void }) {
    const [value, setValue] = useState<string>('week')
    return (
      <SegmentedControl
        label="时间尺度" value={value} options={OPTIONS}
        onChange={(next) => { onChange?.(next); setValue(next) }}
      />
    )
  }

  it('is one named radio group whose picked segment is the only checked one', () => {
    act(() => root.render(<Scale />))
    const group = host.querySelector('.segmented-control')!
    expect(group.getAttribute('role')).toBe('radiogroup')
    expect(group.getAttribute('aria-label')).toBe('时间尺度')
    expect(segments().map((button) => [button.getAttribute('role'), button.getAttribute('aria-checked')]))
      .toEqual([['radio', 'false'], ['radio', 'true'], ['radio', 'false']])
  })

  it('draws one thumb in the track and moves it to the picked segment', () => {
    act(() => root.render(<Scale />))
    const group = host.querySelector<HTMLElement>('.segmented-control')!
    expect(group.querySelectorAll('.segmented-thumb')).toHaveLength(1)
    expect(group.style.getPropertyValue('--segmented-count')).toBe('3')
    expect(group.style.getPropertyValue('--segmented-index')).toBe('1')
    act(() => segments()[2]!.click())
    expect(group.style.getPropertyValue('--segmented-index')).toBe('2')
    expect(segments()[2]!.getAttribute('aria-checked')).toBe('true')
  })

  it('draws no thumb while the value matches no segment', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl label="分组值" value="" options={OPTIONS} onChange={() => undefined} />,
    )
    expect(html).not.toContain('segmented-thumb')
    expect(html).not.toContain('aria-checked="true"')
  })

  it('keeps the picked segment when it is clicked again', () => {
    const onChange = vi.fn()
    act(() => root.render(<Scale onChange={onChange} />))
    act(() => segments()[1]!.click())
    expect(onChange).not.toHaveBeenCalled()
    expect(segments()[1]!.getAttribute('aria-checked')).toBe('true')
  })

  it('is one Tab stop that lands on the picked segment, and arrow keys move focus between segments', async () => {
    act(() => root.render(<Scale />))
    const group = host.querySelector<HTMLElement>('.segmented-control')!
    expect([group, ...segments()].filter((element) => element.tabIndex === 0)).toEqual([group])
    act(() => group.focus())
    expect(document.activeElement).toBe(segments()[1])
    const arrow = async (key: string) => {
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }
    await arrow('ArrowRight')
    expect(document.activeElement).toBe(segments()[2])
    await arrow('ArrowRight')
    expect(document.activeElement).toBe(segments()[0])
    expect(segments()[1]!.getAttribute('aria-checked')).toBe('true')
  })

  it('keeps its size class, and its segments carry no native title', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        label="每页条数" size="sm" value="10"
        options={[{ value: '10', label: '10 / 页' }, { value: '20', label: '20 / 页' }]}
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('class="segmented-control segmented-control--sm"')
    expect(html).not.toContain('title=')
  })
})
