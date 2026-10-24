// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionButton } from './ActionButton.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('ActionButton', () => {
  let root: Root
  let host: HTMLDivElement

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

  /** The button rendered with `busy`, as the parts a user and a screen reader get from it. */
  const render = (busy: boolean) => {
    const onClick = vi.fn()
    act(() => root.render(
      <ActionButton className="btn danger" busy={busy} busyLabel="正在重置…" onClick={onClick}>重置</ActionButton>,
    ))
    const button = host.querySelector('button')!
    button.click()
    return {
      name: button.getAttribute('aria-label'),
      ariaBusy: button.getAttribute('aria-busy'),
      disabled: button.disabled,
      pressed: onClick.mock.calls.length,
      label: button.querySelector('.action-label')?.textContent ?? null,
      text: button.textContent,
      ring: button.querySelector('svg.ring.spin') !== null,
      ...(busy ? { className: button.className } : {}),
    }
  }

  it('空闲时只显示自己的字，可以按，没有转圈，也没有另给的名字', () => {
    expect(render(false)).toEqual({
      name: null, ariaBusy: null, disabled: false, pressed: 1, label: null, text: '重置', ring: false,
    })
  })

  it('忙着时按不了、标为 aria-busy，字留在原处只是看不见，原处转着那一个转圈；忙时的说法只是它的名字，不上屏', () => {
    expect(render(true)).toEqual({
      name: '正在重置…', ariaBusy: 'true', disabled: true, pressed: 0, label: '重置', text: '重置', ring: true,
      className: 'action-button btn danger',
    })
  })
})
