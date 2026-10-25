// @vitest-environment jsdom
import { act, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useOpenerFocus } from './useOpenerFocus.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** The `onCloseAutoFocus` the page's layer last received. */
let closeAutoFocus: (event: Event) => void = () => {}

/** A layer portaled to the body, as Radix portals its layers, that takes focus as it opens. */
function Layer() {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => { field.current?.focus() }, [])
  return createPortal(<div className="layer"><input ref={field} aria-label="层里的字段" /></div>, document.body)
}

/** A page with an opener, another field and a layer without a trigger, open while `open`. */
function Page({ open, opener = true, restore }: { open: boolean; opener?: boolean; restore?: boolean }) {
  closeAutoFocus = useOpenerFocus(open, ...(restore === undefined ? [] : [restore]))
  return (
    <>
      {opener ? <button type="button" className="opener">打开</button> : null}
      <input aria-label="页上的字段" className="other" />
      {open ? <Layer /> : null}
    </>
  )
}

describe('useOpenerFocus', () => {
  let root: Root
  let host: HTMLDivElement
  const render = (props: Parameters<typeof Page>[0]) => act(() => root.render(<Page {...props} />))
  const opener = () => host.querySelector<HTMLButtonElement>('.opener')!
  const other = () => host.querySelector<HTMLInputElement>('.other')!

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => { act(() => root.unmount()) })

  it('gives focus back to the element that held it when the layer opened, as soon as the layer closes', () => {
    render({ open: false })
    opener().focus()
    render({ open: true })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('层里的字段')
    render({ open: false })
    expect(document.activeElement).toBe(opener())
  })

  it('gives focus back to the element that held it last when focus was on nothing as the layer opened', () => {
    render({ open: false })
    other().focus()
    other().blur()
    expect(document.activeElement).toBe(document.body)
    render({ open: true })
    render({ open: false })
    expect(document.activeElement).toBe(other())
  })

  it('leaves focus where it was moved on the page meanwhile, as by a press outside a popover', () => {
    render({ open: false })
    opener().focus()
    render({ open: true })
    other().focus()
    render({ open: false })
    expect(document.activeElement).toBe(other())
  })

  it('gives nothing focus when the element that opened the layer is no longer on the page', () => {
    render({ open: false })
    opener().focus()
    render({ open: true })
    render({ open: true, opener: false })
    render({ open: false, opener: false })
    expect(document.activeElement).toBe(document.body)
  })

  it('returns no focus when the host asks it not to', () => {
    render({ open: false })
    opener().focus()
    render({ open: true })
    render({ open: false, restore: false })
    expect(document.activeElement).toBe(document.body)
  })

  it('takes over the layer\'s own focus return only when it noted an opener, and gives focus back there too', () => {
    render({ open: true })
    const unnoted = new Event('focusOutside', { cancelable: true })
    closeAutoFocus(unnoted)
    expect(unnoted.defaultPrevented).toBe(false)

    render({ open: false })
    opener().focus()
    render({ open: true })
    // A layer that unmounts leaves focus on the body before its close auto-focus runs.
    document.querySelector<HTMLElement>('.layer input')!.blur()
    const noted = new Event('focusOutside', { cancelable: true })
    closeAutoFocus(noted)
    expect(noted.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(opener())
  })
})
