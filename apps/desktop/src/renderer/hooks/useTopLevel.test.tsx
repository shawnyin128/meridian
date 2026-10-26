// @vitest-environment jsdom
import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTopLevel } from './useTopLevel.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A list that opens one item; the button chooses the list's switch again. */
function View() {
  const [open, setOpen] = useState<string | null>(null)
  const view = useRef<HTMLDivElement>(null)
  const again = useTopLevel(open !== null, () => setOpen(null), view)
  return (
    <>
      <button type="button" className="again" onClick={again}>列表</button>
      <button type="button" className="open" onClick={() => setOpen('b')}>打开</button>
      <div ref={view} className="view"><div className="inner">{open ?? 'top'}</div></div>
    </>
  )
}

describe('useTopLevel', () => {
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

  const click = (selector: string) => act(() => { host.querySelector<HTMLElement>(selector)!.click() })

  it('takes a drilled view back to its top level and scrolls it and every area inside it to the top', () => {
    act(() => root.render(<View />))
    click('.open')
    const view = host.querySelector<HTMLElement>('.view')!
    const inner = host.querySelector<HTMLElement>('.inner')!
    view.scrollTop = 40
    inner.scrollTop = 25
    click('.again')
    expect(inner.textContent).toBe('top')
    expect([view.scrollTop, inner.scrollTop]).toEqual([0, 0])
  })

  it('leaves a view at its top level as it is, scroll included', () => {
    act(() => root.render(<View />))
    const view = host.querySelector<HTMLElement>('.view')!
    view.scrollTop = 40
    click('.again')
    expect(view.scrollTop).toBe(40)
    expect(view.textContent).toBe('top')
  })
})
