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

const api = vi.hoisted(() => ({ open: vi.fn(), removePaper: vi.fn(async () => undefined) }))

vi.mock('../ipc.js', () => ({ project: { list: async () => [], removePaper: api.removePaper } }))
vi.mock('../shell/AppShell.js', () => ({ useJump: () => ({ jump: null, open: api.open }) }))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

const { ProjectChips } = await import('./ProjectChips.js')

describe('ProjectChips', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    api.open.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('每个项目 chip 的名字是打开那个项目的链接,× 只解除关联、不打开项目', () => {
    const paper = { id: 'p1', projects: [{ id: 'draft', name: 'draft 效率' }, { id: 'moe', name: 'MoE 路由' }] } as PaperRow
    act(() => root.render(<MessagesProvider><ProjectChips paper={paper} onError={vi.fn()} /></MessagesProvider>))
    const chips = [...host.querySelectorAll('.tagchip[data-project]')]
    expect(chips.map((chip) => {
      const link = chip.querySelector('.entity-link')
      return [link?.tagName ?? null, link?.className ?? null, link?.textContent ?? null]
    })).toEqual([
      ['BUTTON', 'entity-link entity-link--project', 'draft 效率'],
      ['BUTTON', 'entity-link entity-link--project', 'MoE 路由'],
    ])
    for (const chip of chips) act(() => chip.querySelector<HTMLElement>('.entity-link')!.click())
    expect(api.open.mock.calls).toEqual([['project', 'draft'], ['project', 'moe']])
    act(() => chips[0]!.querySelector<HTMLElement>('.rx')!.click())
    expect(api.removePaper).toHaveBeenCalledWith('draft', 'p1')
    expect(api.open).toHaveBeenCalledTimes(2)
  })
})
