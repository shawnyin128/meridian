// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Switch } from './Switch.js'

describe('Switch', () => {
  let host: HTMLDivElement
  let root: Root
  let reported: boolean[]

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

  function Setting({ disabled = false }: { disabled?: boolean }) {
    const [on, setOn] = useState(true)
    return (
      <Switch
        label="接收推送" checked={on} disabled={disabled}
        onChange={(next) => { reported.push(next); setOn(next) }}
      />
    )
  }

  const control = () => host.querySelector<HTMLButtonElement>('button')!

  it('is a named switch whose label stays the same in both states', () => {
    act(() => root.render(<Setting />))
    expect(control().getAttribute('role')).toBe('switch')
    expect(control().getAttribute('aria-label')).toBe('接收推送')
    expect(control().getAttribute('aria-checked')).toBe('true')
    expect(control().textContent).toBe('')
    act(() => control().click())
    expect(control().getAttribute('aria-checked')).toBe('false')
    expect(control().getAttribute('aria-label')).toBe('接收推送')
  })

  it('reports each flip as the new state', () => {
    act(() => root.render(<Setting />))
    act(() => control().click())
    act(() => control().click())
    expect(reported).toEqual([false, true])
  })

  it('takes no flip while disabled', () => {
    act(() => root.render(<Setting disabled />))
    act(() => control().click())
    expect(reported).toEqual([])
    expect(control().disabled).toBe(true)
  })
})
