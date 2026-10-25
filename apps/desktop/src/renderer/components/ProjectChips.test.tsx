// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperRow } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  open: vi.fn(),
  removePaper: vi.fn(async () => ({ project: {}, change: 'change-unlink' })),
  writes: [] as { result: unknown; opts: { note?: unknown; action?: (result: never) => { label: string; onAction: () => void } } }[],
  undone: [] as string[],
}))

vi.mock('../ipc.js', () => ({
  project: { list: async () => [], removePaper: api.removePaper },
  changelog: { undo: (id: string) => { api.undone.push(id); return Promise.resolve() } },
}))
vi.mock('../shell/AppShell.js', () => ({ useJump: () => ({ jump: null, open: api.open }) }))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>, opts = {}) => { api.writes.push({ result: await work, opts }); return true },
}))

const { ProjectChips } = await import('./ProjectChips.js')

describe('ProjectChips', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    api.open.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('每个项目 chip 的名字是打开那个项目的按钮,和关联 chip 一样;× 只解除关联、不打开项目', () => {
    const paper = { id: 'p1', projects: [{ id: 'draft', name: 'draft 效率' }, { id: 'moe', name: 'MoE 路由' }] } as PaperRow
    act(() => root.render(<MessagesProvider><ProjectChips paper={paper} onError={vi.fn()} /></MessagesProvider>))
    const chips = [...host.querySelectorAll('.tagchip[data-project]')]
    expect(chips.map((chip) => {
      const name = chip.firstElementChild
      return [name?.tagName ?? null, name?.className ?? null, name?.textContent ?? null]
    })).toEqual([
      ['BUTTON', 'tagchip-open', 'draft 效率'],
      ['BUTTON', 'tagchip-open', 'MoE 路由'],
    ])
    for (const chip of chips) act(() => chip.querySelector<HTMLElement>('.tagchip-open')!.click())
    expect(api.open.mock.calls).toEqual([['project', 'draft'], ['project', 'moe']])
    act(() => chips[0]!.querySelector<HTMLElement>('.rx')!.click())
    expect(api.removePaper).toHaveBeenCalledWith('draft', 'p1')
    expect(api.open).toHaveBeenCalledTimes(2)
  })

  it('× 解除关联后提示带撤销,撤销的是这次解除记下的那条变动', async () => {
    const paper = { id: 'p1', projects: [{ id: 'draft', name: 'draft 效率' }] } as PaperRow
    act(() => root.render(<MessagesProvider><ProjectChips paper={paper} onError={vi.fn()} /></MessagesProvider>))
    await act(async () => { host.querySelector<HTMLElement>('.tagchip[data-project="draft"] .rx')!.click() })
    const removed = api.writes.at(-1)!
    const action = removed.opts.action?.(removed.result as never)
    expect([removed.opts.note, action?.label]).toEqual(['已移除关联', '撤销'])
    await act(async () => { action!.onAction() })
    expect(api.undone).toEqual(['change-unlink'])
  })
})
