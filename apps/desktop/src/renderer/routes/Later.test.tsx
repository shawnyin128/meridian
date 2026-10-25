// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LaterEntry } from '../../shared/contract.js'
import { IconCross, IconTrash } from '../components/icons.js'
import { MessagesProvider } from '../messages/useMessages.js'
import type { ScreenJump } from '../shell/AppShell.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  notes: [] as unknown[], jump: null as ScreenJump | null, entries: null as LaterEntry[] | null, returnTo: vi.fn(),
  writes: [] as { result: unknown; opts: { note?: unknown; action?: (result: never) => { label: string; onAction: () => void } } }[],
  restored: [] as string[],
}))

const ENTRY: LaterEntry = {
  id: 'later-1', title: 'MoE 路由用熵正则代替负载均衡 load balancing', source: 'arXiv', added: '2026-08-25',
  day: 'today', authors: 'Lin', venue: '', abstract: '', downloaded: true, paper: 'moe-entropy',
}

vi.mock('../ipc.js', () => ({
  inbox: { download: async () => ({ kind: 'added', paper: ENTRY.paper }) },
  later: { list: async () => api.entries ?? [ENTRY], remove: async (id: string) => ({ trash: `trash-${id}` }) },
  trash: { restore: async (id: string) => { api.restored.push(id) } },
  changelog: {},
}))
vi.mock('../shell/AppShell.js', () => ({
  useJump: () => ({ jump: api.jump, open: vi.fn(), returnTo: api.returnTo }),
  useScreenEntry: () => 0,
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../shell/useJobs.js', () => ({ useJobs: () => null }))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>, opts: { note?: unknown } = {}) => {
    api.writes.push({ result: await work, opts })
    api.notes.push(opts.note)
    return true
  },
}))

const { Later } = await import('./Later.js')

describe('Later', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    api.notes.length = 0
    api.writes.length = 0
    api.restored.length = 0
    api.jump = null
    api.entries = null
  })
  afterEach(() => { host.remove(); vi.unstubAllGlobals() })

  it('从别的屏点链接来时屏头左端有返回,按它回到来的那一屏', async () => {
    HTMLElement.prototype.scrollIntoView = () => {}
    api.jump = { screen: 'later', target: 'later-1', from: 'changelog', seq: 2 }
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    expect(host.querySelector('.desk-head')!.firstElementChild?.classList.contains('back')).toBe(true)
    await act(async () => { host.querySelector<HTMLButtonElement>('.desk-head > .back')!.click() })
    expect(api.returnTo).toHaveBeenCalledWith('changelog')
    await act(async () => { root.unmount() })
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
  })

  it('从别处跳到一条时,把那一条移到眼前', async () => {
    const shown: (string | null)[] = []
    // jsdom lays nothing out and has no scrollIntoView.
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) { shown.push(this.getAttribute('data-pid')) }
    api.jump = { screen: 'later', target: 'later-1', from: 'feed', seq: 1 }
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    expect(shown).toEqual(['later-1'])
    await act(async () => { root.unmount() })
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
  })

  it('同一个关键词关注早先存的主题 · 和现在的关键词 · 是一个来源:来源标签和按来源的分组都用现在的词', async () => {
    api.entries = [
      { ...ENTRY, id: 'old', paper: 'old', source: '主题 · MoE serving' },
      { ...ENTRY, id: 'new', paper: 'new', source: '关键词 · MoE serving' },
    ]
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    expect([...host.querySelectorAll('.source-label')].map((label) => label.textContent))
      .toEqual(['关键词 · MoE serving', '关键词 · MoE serving'])
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('.segmented-control button')].find((button) => button.textContent === '按来源')!.click()
    })
    expect([...host.querySelectorAll('.section-heading--group')].map((heading) => heading.textContent)).toEqual(['关键词 · MoE serving · 2'])
    expect(api.entries.map((entry) => entry.source)).toEqual(['主题 · MoE serving', '关键词 · MoE serving'])
    await act(async () => { root.unmount() })
  })

  it('按时间/按来源是视图切换，放在正文开头的工具栏，屏头只有标题', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    expect([...host.querySelector('.desk-head')!.children].map((child) => child.className)).toEqual(['fade-text t'])
    expect(host.querySelector('.desk-body > .page-toolbar .segmented-control')).not.toBeNull()
    await act(async () => { root.unmount() })
  })

  it('移出进垃圾桶,用的是论文推送里忽略那个进垃圾桶的图标,不是表示移开的叉', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    const remove = host.querySelector('button[aria-label="移出"]')!
    expect(remove.querySelector('svg')!.outerHTML).toBe(renderToStaticMarkup(<IconTrash />))
    expect(remove.querySelector('svg')!.outerHTML).not.toBe(renderToStaticMarkup(<IconCross />))
    expect(remove.classList.contains('danger')).toBe(false)
    await act(async () => { root.unmount() })
  })

  it('按时间排时，论文从哪来写成中性的来源标签，不是醒目的强调徽标', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    const metadata = host.querySelector('.paper-card .item-meta')!
    expect(metadata.querySelector('.source-label')!.textContent).toBe('arXiv')
    expect(metadata.querySelector('.paper-card-badge')).toBeNull()
    await act(async () => { root.unmount() })
  })

  it('移出长标题的论文后，提示写出完整标题，标题放不下时淡出而不是截断', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="移出"]')!.click() })
    const toast = document.createElement('div')
    const shown = createRoot(toast)
    act(() => shown.render(<>{api.notes[0]}</>))
    expect(toast.textContent).toBe('已移出稍后阅读「MoE 路由用熵正则代替负载均衡 load balancing」')
    expect(toast.querySelector('.fade-text')!.textContent).toBe('MoE 路由用熵正则代替负载均衡 load balancing')
    act(() => shown.unmount())
    await act(async () => { root.unmount() })
  })

  it('移出的那一条进垃圾桶,提示里的撤销把它放回队列', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Later /></MessagesProvider>) })
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="移出"]')!.click() })
    const written = api.writes.at(-1)!
    const action = written.opts.action!(written.result as never)
    expect(action.label).toBe('撤销')
    await act(async () => { action.onAction() })
    expect(api.restored).toEqual([`trash-${ENTRY.id}`])
    await act(async () => { root.unmount() })
  })
})
