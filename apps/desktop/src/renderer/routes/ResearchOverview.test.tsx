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

const api = vi.hoisted(() => ({ rows: [] as ProjectOverview[], loading: false }))

vi.mock('../ipc.js', () => ({
  project: { overview: () => (api.loading ? new Promise(() => {}) : Promise.resolve(structuredClone(api.rows))) },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useJump: () => ({ jump: null, open: vi.fn() }),
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
    api.loading = false
  })

  it('项目进展、最近进展和接下来的里程碑是汇总出来的，没有内容时整节不显示', async () => {
    api.rows = [{ ...row([]), status: '已完成' }]
    await act(async () => { root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>) })
    const headings = [...host.querySelectorAll('.section-heading')].map((node) => node.textContent)
    expect(headings).not.toContain('项目进展')
    expect(headings).not.toContain('最近进展')
    expect(headings).not.toContain('接下来的里程碑')
    expect(host.querySelector('.empty-state')).toBeNull()
  })

  it('总览还没读到时页面里是载入占位，不是一片空白', async () => {
    api.loading = true
    await act(async () => { root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>) })
    expect(host.querySelector('.desk-body .loading-placeholder')).not.toBeNull()
  })

  it('同一天有几条科研记录时写最后写下的那条,和项目列表卡片取的是同一条', async () => {
    api.rows = [row([
      { date: '2026-09-26', text: '创建项目' },
      { date: '2026-10-16', text: '先写的记录' },
      { date: '2026-10-16', text: '后写的记录' },
    ])]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const cells = host.querySelectorAll('.ovpulse-row[data-proj="spec"] .ovpulse-cell')
    expect(cells[1]!.querySelector('.ovpulse-latest')!.textContent).toBe('后写的记录')
  })

  it('最近进展和项目进展里 agent 写的记录都在那一行的末尾带 agent 标签,我写的不带', async () => {
    api.rows = [row([
      { date: '2026-10-15', text: '我记的', kind: 'note' },
      { date: '2026-10-16', text: 'agent 记的', kind: 'result', origin: 'agent' },
    ])]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const recent = [...host.querySelectorAll('.ovcols .ovlist-row')]
      .map((line) => `${line.querySelector('.ovlist-main')!.textContent} ${line.querySelector('.ovlist-meta .source-label')?.textContent ?? '-'}`)
    expect(recent).toEqual(['agent 记的 agent', '我记的 -'])
    const latest = host.querySelectorAll('.ovpulse-row[data-proj="spec"] .ovpulse-cell')[1]!.firstElementChild!
    expect(latest.lastElementChild!.classList.contains('source-label')).toBe(true)
    expect(latest.textContent).toBe('agent 记的agent')
  })

  it('最近进展给每条记录标上项目页科研记录的类型名和色调,没有类型的旧记录标成记录', async () => {
    api.rows = [row([
      { date: '2026-10-13', text: '旧记录' },
      { date: '2026-10-14', text: '开工', kind: 'start' },
      { date: '2026-10-15', text: '换方案', kind: 'decision' },
      { date: '2026-10-16', text: '跑出结果', kind: 'result' },
    ])]
    await act(async () => root.render(<MessagesProvider><ResearchOverview /></MessagesProvider>))
    const kinds = [...host.querySelectorAll('.ovcols .ovlist-row .project-signal-kind .tag')]
      .map((tag) => `${tag.textContent} ${tag.className}`)
    expect(kinds).toEqual([
      '实验结果 tag tag--label tag--good', '决定 tag tag--label tag--accent',
      '开始推进 tag tag--label tag--info', '记录 tag tag--label tag--neutral',
    ])
  })
})
