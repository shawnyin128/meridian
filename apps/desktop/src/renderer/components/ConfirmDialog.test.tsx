// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ConfirmDialog } from './ConfirmDialog.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('ConfirmDialog', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('uses one dialog shell and invokes the supplied consequence only after confirmation', () => {
    const confirm = vi.fn()
    act(() => root!.render(
      <MessagesProvider>
        <ConfirmDialog
          trigger={<button>删除记录</button>} title="删除这条记录？"
          description="删除后不能恢复。" confirmLabel="确认删除" onConfirm={confirm}
        />
      </MessagesProvider>,
    ))
    act(() => host.querySelector<HTMLButtonElement>('button')!.click())
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('删除后不能恢复。')
    expect(confirm).not.toHaveBeenCalled()
    act(() => Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '确认删除')!.click())
    expect(confirm).toHaveBeenCalledTimes(1)
  })
})
