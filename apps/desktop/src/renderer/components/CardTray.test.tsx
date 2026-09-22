// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CardTray } from './CardTray.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('CardTray', () => {
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

  it('keeps a one-line summary and exposes details through one accessible toggle', () => {
    act(() => root.render(
      <CardTray summary="Install command" expandLabel="Show details" collapseLabel="Hide details">
        <p>npm install meridian</p>
      </CardTray>,
    ))
    const toggle = host.querySelector<HTMLButtonElement>('.card-tray-toggle')!
    const detail = host.querySelector<HTMLElement>('.card-tray-reveal')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(detail.getAttribute('aria-hidden')).toBe('true')
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.title).toBe('Hide details')
    expect(detail.getAttribute('aria-hidden')).toBe('false')
    expect(host.querySelector('.card-tray')?.classList.contains('is-open')).toBe(true)
  })
})
