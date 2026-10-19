// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary } from '../../shared/contract.js'
import { zh } from '../messages/zh/index.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import type { PlanTab } from '../components/project/ProjectPlan.js'
import type { RecordTab } from './ProjectDetail.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const summary = (id: string, name: string): ProjectSummary => ({
  id, name, status: '进行中', priority: 'p1', topic: '推理', focus: '验证',
  conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0,
  control: { next: { source: 'missing', text: '' } }, milestones: [], recentEvents: [],
})

vi.mock('../ipc.js', () => ({
  feed: { append: vi.fn() },
  project: { list: async () => [summary('a', '项目甲'), summary('b', '项目乙')], reorder: vi.fn() },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: null, returnTo: vi.fn() }),
  useScreenEntry: () => 0,
  useToday: () => '2026-10-16',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

vi.mock('./ProjectDetail.js', () => ({
  ProjectDetail: ({ projectId, tab, onTab, record, onRecord, onBack }: {
    projectId: string; tab: PlanTab; onTab: (tab: PlanTab) => void
    record: RecordTab; onRecord: (record: RecordTab) => void; onBack: () => void
  }) => (
    <div className="detail" data-project={projectId} data-tab={tab} data-record={record}>
      <button className="to-ms" onClick={() => onTab('ms')} />
      <button className="to-graph" onClick={() => onRecord('graph')} />
      <button className="to-list" onClick={onBack} />
    </div>
  ),
}))

const { Projects, projectPaperCountLabel } = await import('./Projects.js')

describe('projectPaperCountLabel', () => {
  it('explains the empty relationship instead of rendering a bare zero', () => {
    expect(projectPaperCountLabel(0, zh)).toBe('还没有关联论文。')
  })

  it('labels a non-empty count as linked papers', () => {
    expect(projectPaperCountLabel(3, zh)).toBe('关联论文 3 篇')
  })
})

describe('Projects', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const click = async (selector: string) => {
    await act(async () => host.querySelector<HTMLElement>(selector)!.click())
  }
  const shownTab = () => host.querySelector<HTMLElement>('.detail')!.dataset.tab
  const shownRecord = () => host.querySelector<HTMLElement>('.detail')!.dataset.record

  it('科研计划的标签页按项目各自记住:一个项目切到里程碑,另一个项目仍从任务打开', async () => {
    await click('[data-proj="a"]')
    expect(shownTab()).toBe('task')
    await click('.to-ms')
    expect(shownTab()).toBe('ms')
    await click('.to-list')

    await click('[data-proj="b"]')
    expect(shownTab()).toBe('task')
    await click('.to-list')

    await click('[data-proj="a"]')
    expect(shownTab()).toBe('ms')
  })

  it('科研记录的标签页也按项目各自记住:一个项目切到科研图,另一个项目仍从时间线打开', async () => {
    await click('[data-proj="a"]')
    expect(shownRecord()).toBe('tl')
    await click('.to-graph')
    expect(shownRecord()).toBe('graph')
    await click('.to-list')

    await click('[data-proj="b"]')
    expect(shownRecord()).toBe('tl')
    await click('.to-list')

    await click('[data-proj="a"]')
    expect(shownRecord()).toBe('graph')
  })
})
