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
    expect(api.updateSettings).toHaveBeenCalledWith({ maxItemsPerRun: 30, maxShownPerScope: 20 })
    expect(button.textContent).toBe('已保存')
    expect(api.notice.success).not.toHaveBeenCalled()

    type(input, '31')
    expect(button.textContent).toBe('保存')
    await act(async () => { root.unmount() })
  })

  it('上限只有字段名，不写说明', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><DeliverySettings /></MessagesProvider>) })
    expect([...host.querySelectorAll('.delivery-setting-copy')].map((copy) => copy.textContent))
      .toEqual(['单次推送上限', '每条关注或项目显示上限'])
    await act(async () => { root.unmount() })
  })

  it('每条关注或项目显示上限就在单次推送上限旁边,默认 20,和它一起保存;超出范围不能保存', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><DeliverySettings /></MessagesProvider>) })
    const shown = host.querySelector<HTMLInputElement>('[aria-label="每条关注或项目显示上限"]')!
    const button = host.querySelector<HTMLButtonElement>('button')!
    expect(shown.value).toBe('20')
    type(shown, '0')
    expect(button.disabled).toBe(true)
    expect(host.querySelector('.delivery-setting-error')?.textContent).toBe('请输入 1–100 之间的整数')
    type(shown, '8')
    await act(async () => { button.click() })
    expect(api.updateSettings).toHaveBeenLastCalledWith({ maxItemsPerRun: 20, maxShownPerScope: 8 })
    await act(async () => { root.unmount() })
  })
})
