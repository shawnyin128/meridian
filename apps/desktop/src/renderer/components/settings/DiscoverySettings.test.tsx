// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscoveryProfile } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

const api = vi.hoisted(() => ({
  profiles: [{
    id: 'spec', name: '推测解码加速', seedCount: 2, positiveCount: 0, negativeCount: 0, intentCount: 2,
    lastFetchedAt: null,
    intents: [
      { id: 'core', label: '动态树宽', core: true, enabled: true, seedCount: 1, seeds: [] },
      { id: 'side', label: '草稿头', core: false, enabled: false, seedCount: 1, seeds: [] },
      { id: 'next', label: '验证策略', core: false, enabled: true, seedCount: 1, seeds: [] },
    ],
  }] as DiscoveryProfile[],
  setIntent: vi.fn(async () => {}),
}))

vi.mock('../../ipc.js', () => ({
  discovery: {
    profiles: async () => structuredClone(api.profiles),
    setIntent: api.setIntent,
    fetch: vi.fn(),
  },
}))
vi.mock('../../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

const { DiscoverySettings } = await import('./DiscoverySettings.js')

describe('DiscoverySettings', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    // FadeText measures whether its text fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    api.setIntent.mockClear()
  })
  afterEach(() => { host.remove() })

  const row = (label: string) => [...host.querySelectorAll('.direction-row')]
    .find((item) => item.textContent?.includes(label))!

  it('发现方向的标题按「标签 · 数」写出方向数,和别的标题一样', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><DiscoverySettings /></MessagesProvider>) })
    expect(host.querySelector('.delivery-directions .section-heading')!.textContent).toBe('发现方向 · 2')
    act(() => root.unmount())
  })

  it('启用一个方向是以方向名命名的开关，不再是翻转文字的按钮；设为核心仍是一次性操作', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><DiscoverySettings /></MessagesProvider>) })

    expect(host.querySelector('.delivery-directions > p')).toBeNull()
    const labels = [...host.querySelectorAll('.direction-row button')].map((button) => button.textContent)
    expect(labels).not.toContain('关闭')
    expect(labels).not.toContain('启用')
    const off = row('草稿头').querySelector<HTMLButtonElement>('[role="switch"]')!
    expect([off.getAttribute('aria-label'), off.getAttribute('aria-checked')]).toEqual(['草稿头', 'false'])
    expect(row('动态树宽').querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
    expect(row('验证策略').querySelector('button:not([role="switch"])')!.textContent).toBe('设为核心')

    await act(async () => { off.click() })
    expect(api.setIntent).toHaveBeenCalledWith('spec', 'side', 'enable')
    const on = row('验证策略').querySelector<HTMLButtonElement>('[role="switch"]')!
    await act(async () => { on.click() })
    expect(api.setIntent).toHaveBeenLastCalledWith('spec', 'next', 'disable')

    await act(async () => { root.unmount() })
  })
})
