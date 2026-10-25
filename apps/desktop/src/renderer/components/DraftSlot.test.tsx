// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DraftSlot, useDraftSlot } from './DraftSlot.js'
import { FormInput } from './FormControls.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A list whose add opens a draft row; the draft's text is held, as a kept draft is. */
function Host() {
  const [draft, setDraft] = useState<string | null>(null)
  const draftSlot = useDraftSlot(draft !== null, () => setDraft(''))
  return (
    <>
      <button type="button" className="add" onClick={draftSlot.start}>新建</button>
      <button type="button" className="away">别处</button>
      {draft === null ? null : (
        <DraftSlot slot={draftSlot.slot}>
          <FormInput aria-label="名称" value={draft} onChange={(event) => setDraft(event.target.value)} />
        </DraftSlot>
      )}
    </>
  )
}

describe('DraftSlot', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

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

  it('新建按钮在条目落下的位置打开草稿；草稿开着时再按，不另开一份，光标回到草稿里打到的字后面', () => {
    act(() => root.render(<Host />))
    expect(host.querySelector('.draft-slot')).toBeNull()
    act(() => host.querySelector<HTMLButtonElement>('.add')!.click())
    const field = host.querySelector<HTMLInputElement>('.draft-slot .form-control')!
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(field, 'KV 量化')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => host.querySelector<HTMLButtonElement>('.away')!.focus())
    act(() => host.querySelector<HTMLButtonElement>('.add')!.click())
    expect(host.querySelectorAll('.draft-slot')).toHaveLength(1)
    expect(document.activeElement).toBe(field)
    expect([field.value, field.selectionStart, field.selectionEnd]).toEqual(['KV 量化', 5, 5])
  })

  it('草稿是它要成为的那一行或那张卡片', () => {
    const slot = { current: null }
    expect(renderToStaticMarkup(<DraftSlot slot={slot}>草稿</DraftSlot>))
      .toBe('<div class="item item--row draft-slot" data-row-actions="">草稿</div>')
    expect(renderToStaticMarkup(<DraftSlot as="card" slot={slot} className="idea-draft-card">草稿</DraftSlot>))
      .toBe('<article class="item item--card draft-slot idea-draft-card" data-row-actions="">草稿</article>')
  })
})
