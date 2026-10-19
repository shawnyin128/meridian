// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOverview } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({ rows: [] as ProjectOverview[] }))

vi.mock('../ipc.js', () => ({
  project: { overview: async () => structuredClone(api.rows) },
}))

vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => vi.fn(),
  useJump: () => ({ jump: null, open: vi.fn() }),
  useToast: () => vi.fn(),
  useToday: () => '2026-10-16',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

const { ResearchOverview } = await import('./ResearchOverview.js')

const row = (events: ProjectOverview['events']): ProjectOverview => ({
  id: 'spec', name: '推测解码加速', status: '进行中', priority: 'p0', focus: '动态树宽度原型',
  start: '2026-09-26', due: '2026-11-10', conclusions: { verified: 0, pending: 0, conflicting: 0 },
  tasks: [], milestones: [], events, lastProgress: '2026-10-16',
  research: { pathState: 'empty', activeNodes: [], branches: { active: 0, supported: 0, failed: 0, shelved: 0 } },
})

describe('研究总览的项目进展', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('同一天有几条科研记录时写最后写下的那条,和项目列表卡片取的是同一条', async () => {
    api.rows = [row([
      { date: '2026-09-26', text: '创建项目' },
      { date: '2026-10-16', text: '先写的记录' },
      { date: '2026-10-16', text: '后写的记录' },
    ])]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const cells = host.querySelectorAll('.ovpulse-row[data-proj="spec"] .ovpulse-cell')
    expect(cells[1]!.querySelector('b')!.textContent).toBe('后写的记录')
  })
})
