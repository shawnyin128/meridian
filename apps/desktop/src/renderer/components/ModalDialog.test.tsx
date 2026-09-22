// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ModalDialog, ModalTitle } from './ModalDialog.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

function Example() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开设置</button>
      <ModalDialog open={open} onOpenChange={setOpen} contentClassName="settings-modal">
        <ModalTitle>设置</ModalTitle>
        <button type="button" onClick={() => setOpen(false)}>完成</button>
      </ModalDialog>
    </>
  )
}

describe('ModalDialog', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('owns the modal surface and restores focus to the programmatic opener', async () => {
    act(() => root!.render(<Example />))
    const opener = host.querySelector<HTMLButtonElement>('button')!
    opener.focus()
    act(() => opener.click())

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('设置')
    await act(async () => {
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent === '完成')!.click()
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
