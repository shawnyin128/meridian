// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

const api = vi.hoisted(() => ({
  updateSettings: vi.fn(async () => {}),
  notice: { success: vi.fn(), refusal: vi.fn() },
}))

vi.mock('../../ipc.js', () => ({
  delivery: { settings: async () => ({ maxItemsPerRun: 20 }), updateSettings: api.updateSettings },
}))
vi.mock('../../shell/AppShell.js', () => ({
  useNotice: () => api.notice,
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

const { DeliverySettings } = await import('./DeliverySettings.js')

/** Types `value` into the limit field the way React sees typing. */
function type(input: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('DeliverySettings', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    api.notice.success.mockClear()
  })
  afterEach(() => { host.remove() })

  it('保存成功后按钮就地写着已保存，不再另发提示；再改数字又回到保存', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><DeliverySettings /></MessagesProvider>) })
    const input = host.querySelector<HTMLInputElement>('input')!
    const button = host.querySelector<HTMLButtonElement>('button')!

    type(input, '30')
    expect(button.textContent).toBe('保存')
    await act(async () => { button.click() })
    expect(api.updateSettings).toHaveBeenCalledWith({ maxItemsPerRun: 30 })
    expect(button.textContent).toBe('已保存')
    expect(api.notice.success).not.toHaveBeenCalled()

    type(input, '31')
    expect(button.textContent).toBe('保存')
    await act(async () => { root.unmount() })
  })
})
