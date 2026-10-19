// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangeEntry } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({ entries: [] as ChangeEntry[] }))

vi.mock('../ipc.js', () => ({
  changelog: { list: async () => structuredClone(api.entries) },
}))

vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => vi.fn(),
  useToast: () => vi.fn(),
  useToday: () => '2026-10-16',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

const { Changelog } = await import('./Changelog.js')

const entry = (id: string, title: string, source: ChangeEntry['source']): ChangeEntry => ({
  id, title, meta: '今天', date: '2026-10-16', source, diff: [], undone: false, undoable: false, archived: false,
})

describe('最近变动的来源标签', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('agent 做的那条跟一个 agent 标签,提案再写明来自笔记还是实验;我自己做的不带标签', async () => {
    api.entries = [
      entry('c1', '项目「draft 效率」· 改了字段', '我'),
      entry('c2', '项目「draft 效率」· 新增任务', 'Meridian'),
      entry('c3', 'Wiki · 记下拐点', '笔记'),
      entry('c4', 'Wiki · 记下实验结果', '实验'),
    ]
    await act(async () => root.render(<MessagesProvider><Changelog /></MessagesProvider>))
    const labels = [...host.querySelectorAll('.crow')].map((row) => row.querySelector('.ct .source-label')?.textContent ?? null)
    expect(labels).toEqual([null, 'agent', 'agent · 笔记', 'agent · 实验'])
  })
})
