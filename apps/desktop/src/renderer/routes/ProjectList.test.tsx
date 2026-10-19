// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({ projects: [] as ProjectSummary[] }))

vi.mock('../ipc.js', () => ({
  feed: { append: vi.fn() },
  project: { list: async () => structuredClone(api.projects), reorder: vi.fn() },
}))

vi.mock('../shell/AppShell.js', () => ({
  useBanner: () => vi.fn(),
  useCrumbTail: () => {},
  useJump: () => ({ jump: null, open: vi.fn(), returnTo: vi.fn() }),
  useScreenEntry: () => 0,
  useToast: () => vi.fn(),
  useToday: () => '2026-10-16',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))
vi.mock('./ProjectDetail.js', () => ({ ProjectDetail: ({ projectId }: { projectId: string }) => <p data-open={projectId} /> }))

const { Projects } = await import('./Projects.js')

const summary = (over: Partial<ProjectSummary>): ProjectSummary => ({
  id: 'spec', name: '推测解码加速', status: '进行中', priority: 'p0', topic: '推理加速', focus: '动态树宽度原型',
  conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0,
  control: { next: { source: 'missing', text: '' } }, milestones: [], recentEvents: [],
  ...over,
})

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

describe('项目列表的卡片', () => {
  const recentProgress = async (project: ProjectSummary) => {
    api.projects = [project]
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    return host.querySelector<HTMLElement>('[data-proj="spec"] .project-card-recent')!.textContent
  }

  it('最近推进写 Core 给的 lastProgress 那天,不写页面上最后一条科研记录那天', async () => {
    const text = await recentProgress(summary({
      lastProgress: '2026-10-16', recentEvents: [{ date: '2026-09-26', text: '创建项目' }],
    }))
    expect(text).toContain('10月16日')
    expect(text).not.toContain('9月26日')
    expect(text).not.toContain('创建项目')
  })

  it('最近推进那天写过科研记录时,日期后面跟着那天最新的一条', async () => {
    const text = await recentProgress(summary({
      lastProgress: '2026-10-16',
      recentEvents: [{ date: '2026-09-26', text: '创建项目' }, { date: '2026-10-16', text: '开始推进 树形草稿' }],
    }))
    expect(text).toBe('最近推进10月16日 开始推进 树形草稿')
  })

  it('还没有推进时写还没有记录', async () => {
    expect(await recentProgress(summary({}))).toBe('最近推进还没有记录。')
  })
})

describe('Project list', () => {
  it('opens a shelved project from the button that holds its name', async () => {
    api.projects = [summary({
      id: 'draft', name: 'draft 效率', status: '搁置', priority: 'p1', topic: '推理', focus: '等算力',
    })]
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    const open = host.querySelector<HTMLElement>('.prow[data-proj="draft"]')!.firstElementChild as HTMLElement
    expect(open.tagName).toBe('BUTTON')
    expect(open.textContent).toContain('draft 效率')
    act(() => open.click())
    expect(host.querySelector('[data-open="draft"]')).not.toBeNull()
  })
})
