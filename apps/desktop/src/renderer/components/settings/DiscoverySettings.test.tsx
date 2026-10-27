// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscoveryProfile } from '../../../shared/contract.js'
import { CallError } from '../../call-error.js'
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
    candidates: [{ id: 'cand', label: '草稿树', seedCount: 1, seeds: [{ id: 'ARXIV:9', title: 'Dynamic Draft Trees' }] }],
  }] as DiscoveryProfile[],
  setIntent: vi.fn(async () => {}),
  direction: vi.fn<(params: unknown) => Promise<void>>(async () => {}),
  /** Each vault write the screen made, with the notice options it passed. */
  writes: [] as { result: unknown; opts: { note?: unknown; action?: (result: never) => { label: string; undoes?: true; onAction: () => void } } }[],
  /** The settings row a jump asks the screen to land on. */
  target: null as { id: string; within?: string } | null,
  fetch: vi.fn(),
  /** What the next profiles read throws instead of answering. */
  profilesError: null as unknown,
  revision: 0,
}))

vi.mock('../../ipc.js', () => ({
  discovery: {
    profiles: async () => {
      const thrown = api.profilesError
      api.profilesError = null
      if (thrown !== null) throw thrown
      return structuredClone(api.profiles)
    },
    setIntent: api.setIntent,
    direction: api.direction,
    fetch: api.fetch,
  },
  library: { location: async () => ({ root: '/vaults/directions-test' }) },
}))
vi.mock('../../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useVaultRevision: () => ({ revision: api.revision, bump: vi.fn() }),
  useSettingsOpen: () => ({ requestedTarget: api.target }),
}))
vi.mock('../../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>, opts = {}) => { api.writes.push({ result: await work, opts }); return true },
}))

const PROFILES = structuredClone(api.profiles)
const { DiscoverySettings } = await import('./DiscoverySettings.js')
const { DraftsProvider } = await import('../../hooks/useDrafts.js')

describe('DiscoverySettings', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    // FadeText measures whether its text fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    api.profiles = structuredClone(PROFILES)
    api.setIntent.mockClear()
    api.direction.mockClear()
    api.writes = []
    api.target = null
    api.profilesError = null
    api.revision = 0
  })
  afterEach(() => { host.remove() })

  const row = (label: string) => [...host.querySelectorAll('.direction-row')]
    .find((item) => item.textContent?.includes(label))!
  const render = async (root: ReturnType<typeof createRoot>) => {
    await act(async () => { root.render(<DraftsProvider><MessagesProvider><DiscoverySettings /></MessagesProvider></DraftsProvider>) })
  }
  const type = (field: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const textButton = (item: Element, text: string) => [...item.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === text)

  it('项目的「N 篇种子」数它已确认方向自己的种子，同一篇只数一次，不数候选和旧版本的更多类似', async () => {
    api.profiles = [{
      ...PROFILES[0]!, seedCount: 3, positiveCount: 4,
      intents: [
        { id: 'core', label: '动态树宽', core: true, enabled: true, seedCount: 2, seeds: [{ id: 'ARXIV:1', title: 'A' }, { id: 'ARXIV:2', title: 'B' }] },
        { id: 'side', label: '草稿头', core: false, enabled: false, seedCount: 2, seeds: [{ id: 'ARXIV:2', title: 'B' }, { id: 'ARXIV:3', title: 'C' }] },
      ],
    }]
    const root = createRoot(host)
    await render(root)
    expect(host.textContent).toContain('3 篇种子')
    expect(host.textContent).not.toContain('7 篇种子')
    await act(async () => { root.unmount() })
  })

  it('候选方向排在它的项目最前：候选标签、名称和种子，行上是共享的添加和「忽略」文字按钮，没有开关和垃圾桶', async () => {
    const root = createRoot(host)
    await render(root)
    const candidate = row('草稿树')
    expect(host.querySelector('.direction-row')).toBe(candidate)
    expect(candidate.querySelector('.tag')!.textContent).toBe('候选')
    expect(candidate.textContent).toContain('Dynamic Draft Trees')
    expect(candidate.querySelector('.add-action')!.textContent).toContain('添加')
    const decline = textButton(candidate, '忽略')!
    expect([decline.classList.contains('icbtn'), decline.querySelector('svg')]).toEqual([false, null])
    expect(candidate.querySelector('[role="switch"]')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('添加候选：经 discovery.direction 添加，提示「已添加」带撤销，撤销把它撤回成候选', async () => {
    const root = createRoot(host)
    await render(root)
    await act(async () => { row('草稿树').querySelector<HTMLButtonElement>('.add-action')!.click() })
    expect(api.direction).toHaveBeenCalledWith({ projectId: 'spec', directionId: 'cand', action: 'add' })
    const { opts } = api.writes[0]!
    const undo = opts.action!(undefined as never)
    expect([opts.note, undo.label, undo.undoes]).toEqual(['已添加', '撤销', true])
    await act(async () => { undo.onAction() })
    expect(api.direction).toHaveBeenLastCalledWith({ projectId: 'spec', directionId: 'cand', action: 'reopen' })
    await act(async () => { root.unmount() })
  })

  it('忽略候选：经 discovery.direction 忽略，提示「已忽略」带撤销，撤销把它撤回成候选', async () => {
    const root = createRoot(host)
    await render(root)
    await act(async () => { textButton(row('草稿树'), '忽略')!.click() })
    expect(api.direction).toHaveBeenCalledWith({ projectId: 'spec', directionId: 'cand', action: 'decline' })
    const { opts } = api.writes[0]!
    const undo = opts.action!(undefined as never)
    expect([opts.note, undo.label, undo.undoes]).toEqual(['已忽略', '撤销', true])
    await act(async () => { undo.onAction() })
    expect(api.direction).toHaveBeenLastCalledWith({ projectId: 'spec', directionId: 'cand', action: 'reopen' })
    await act(async () => { root.unmount() })
  })

  it('已确认方向的更多菜单有重命名：名称就地换成全选的输入框，回车经 discovery.direction 改名', async () => {
    const root = createRoot(host)
    await render(root)
    await act(async () => {
      row('动态树宽').querySelector('.dots')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    const rename = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')].find((item) => item.textContent === '重命名')!
    await act(async () => { rename.click() })
    await vi.waitFor(() => expect(host.querySelector('.direction-row .metadata-input')).not.toBeNull())
    const field = host.querySelector<HTMLInputElement>('.direction-row .metadata-input')!
    expect([field.value, field.selectionStart, field.selectionEnd]).toEqual(['动态树宽', 0, 4])
    act(() => { type(field, ' 树宽 ') })
    await act(async () => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    expect(api.direction).toHaveBeenCalledWith({ projectId: 'spec', directionId: 'core', action: 'rename', label: '树宽' })
    expect(row('草稿树').querySelector('.dots')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('跳到某个项目的某个方向时落到那个项目里的那一行并闪一下，别的项目里同一个方向不闪', async () => {
    // jsdom lays nothing out, so it has no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn()
    const held = api.profiles
    api.profiles = [
      { ...held[0]!, id: 'other', name: '另一个项目', candidates: [{ ...held[0]!.candidates[0]!, label: '别处的草稿树' }] },
      ...held,
    ]
    api.target = { id: 'cand', within: 'spec' }
    try {
      const root = createRoot(host)
      await render(root)
      const candidate = (project: string) => host.querySelector(`.direction-row[data-project="${project}"][data-direction="cand"]`)!
      await vi.waitFor(() => expect(candidate('spec').hasAttribute('data-arrived')).toBe(true))
      expect(candidate('other').hasAttribute('data-arrived')).toBe(false)
      await act(async () => { root.unmount() })
    } finally {
      api.profiles = held
    }
  })

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

  it('读发现方向失败过一次，下一次读成功时错误收起，方向照常列出', async () => {
    const root = createRoot(host)
    const render = () => act(async () => { root.render(<MessagesProvider><DiscoverySettings /></MessagesProvider>) })
    api.profilesError = new CallError('discovery.profiles', 'newer-version')
    await render()
    expect(host.querySelector('.delivery-directions .page-error')?.textContent).toBe('需要更新 App')

    api.revision = 1
    await render()
    expect([host.querySelector('.delivery-directions .page-error'), host.querySelectorAll('.direction-row').length]).toEqual([null, 4])
    act(() => root.unmount())
  })

  it('改方向被拒的原因留在这一栏，等下一次读到方向时收起', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><DiscoverySettings /></MessagesProvider>) })
    api.setIntent.mockRejectedValueOnce(new CallError('discovery.intent', 'changed'))
    await act(async () => { row('草稿头').querySelector<HTMLButtonElement>('[role="switch"]')!.click() })
    expect(host.querySelector('.delivery-directions .page-error')?.textContent).toBe('内容已变化')

    await act(async () => { row('草稿头').querySelector<HTMLButtonElement>('[role="switch"]')!.click() })
    expect(host.querySelector('.delivery-directions .page-error')).toBeNull()
    act(() => root.unmount())
  })

  it('刷新一个项目失败时，原因落在共享的错误框里，和别的设置页的错误一样', async () => {
    api.fetch.mockRejectedValueOnce(new CallError('discovery.fetch', 'newer-version'))
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><DiscoverySettings /></MessagesProvider>) })

    const refresh = host.querySelector<HTMLButtonElement>('.delivery-directions .section-heading--group .section-heading-actions button')!
    await act(async () => { refresh.click() })
    const alert = host.querySelector('.delivery-directions [role="alert"]')
    expect([alert?.className, alert?.textContent]).toEqual(['inline-message inline-message--box inline-message--error page-error page-error--section', '需要更新 App'])

    await act(async () => { root.unmount() })
  })
})
