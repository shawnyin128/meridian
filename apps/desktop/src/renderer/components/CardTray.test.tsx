// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardTray } from './CardTray.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('CardTray', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    // FadeText measures whether its text fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
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
    expect([toggle.getAttribute('aria-label'), toggle.getAttribute('title')]).toEqual(['Hide details', null])
    expect(detail.getAttribute('aria-hidden')).toBe('false')
    expect(host.querySelector('.card-tray')?.classList.contains('is-open')).toBe(true)
  })

  it('in every tray the shared fold caret follows the summary, and turns while the details are hidden', () => {
    for (const variant of ['tray', 'row'] as const) {
      act(() => root.render(variant === 'row'
        ? <CardTray variant="row" summary="Renamed the project"><p>diff</p></CardTray>
        : <CardTray summary="Install command" expandLabel="Show details" collapseLabel="Hide details"><p>npm</p></CardTray>))
      const toggle = host.querySelector<HTMLButtonElement>('.card-tray-toggle')!
      expect([...toggle.children].map((child) => child.classList[0]), variant).toEqual(['fade-text', 'fold-caret'])
      expect(toggle.querySelector('.fold-caret')!.classList.contains('is-closed'), variant).toBe(true)
      expect(document.getElementById(toggle.getAttribute('aria-controls')!), variant).toBe(host.querySelector('.card-tray-reveal'))
      act(() => toggle.click())
      expect(toggle.querySelector('.fold-caret')!.classList.contains('is-closed'), variant).toBe(false)
      act(() => root.render(<></>))
    }
  })

  it('a row tray draws no surface and lets its summary name the toggle', () => {
    act(() => root.render(<CardTray variant="row" summary="Renamed the project"><p>diff</p></CardTray>))
    const toggle = host.querySelector<HTMLButtonElement>('.card-tray-toggle')!
    expect(host.querySelector('.card-tray')!.className).toBe('card-tray card-tray--row')
    expect([toggle.getAttribute('aria-label'), toggle.getAttribute('title')]).toEqual([null, null])
    expect(toggle.textContent).toBe('Renamed the project')
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('a composite row keeps the control in its summary out of the toggle, which the summary names and which comes before the control', () => {
    const onOpen = vi.fn()
    act(() => root.render(
      <CardTray variant="row" composite summary={<>Renamed <a href="#project:draft" onClick={onOpen}>Draft</a></>}>
        <p>diff</p>
      </CardTray>,
    ))
    const toggle = host.querySelector<HTMLButtonElement>('.card-tray-toggle')!
    const summary = host.querySelector<HTMLElement>('.card-tray-summary')!
    const link = summary.querySelector('a')!
    expect(toggle.contains(summary)).toBe(false)
    expect(document.getElementById(toggle.getAttribute('aria-labelledby')!)!.firstElementChild).toBe(summary)
    expect(document.getElementById(toggle.getAttribute('aria-labelledby')!)!.nextElementSibling!.matches('.fold-caret.is-closed')).toBe(true)
    expect(toggle.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    act(() => link.click())
    expect([onOpen.mock.calls.length, toggle.getAttribute('aria-expanded')]).toEqual([1, 'false'])
    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })
})
