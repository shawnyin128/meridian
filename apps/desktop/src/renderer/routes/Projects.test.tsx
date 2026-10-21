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
import type { ScreenJump } from '../shell/AppShell.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const summary = (id: string, name: string): ProjectSummary => ({
  id, name, status: '进行中', priority: 'p1', topic: '推理', focus: '验证',
  conclusions: { verified: 0, pending: 0, conflicting: 0 }, paperCount: 0,
  control: { next: { source: 'missing', text: '' } }, milestones: [], recentEvents: [],
})

/** The jump aimed at the Projects screen. */
const nav = vi.hoisted(() => ({ jump: null as ScreenJump | null, returnTo: vi.fn() }))
const ipc = vi.hoisted(() => ({
  append: vi.fn(() => Promise.resolve()),
  create: vi.fn((name: string) => Promise.resolve(name === '草稿树' ? 'project-9' : 'project-0')),
}))

vi.mock('../ipc.js', () => ({
  feed: { append: ipc.append },
  project: { list: async () => [summary('a', '项目甲'), summary('b', '项目乙')], reorder: vi.fn(), create: ipc.create },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: nav.jump, returnTo: nav.returnTo }),
  useScreenEntry: () => 0,
  useToday: () => '2026-10-16',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

vi.mock('./ProjectDetail.js', () => ({
  ProjectDetail: ({ projectId, tab, onTab, record, onRecord, onBack, onReturn, arrivalTask }: {
    projectId: string; tab: PlanTab; onTab: (tab: PlanTab) => void
    record: RecordTab; onRecord: (record: RecordTab) => void; onBack: () => void; onReturn: () => void
    arrivalTask: string | null
  }) => (
    <div className="detail" data-project={projectId} data-tab={tab} data-record={record} data-task={arrivalTask ?? ''}>
      <button className="return" onClick={onReturn} />
      <button className="to-ms" onClick={() => onTab('ms')} />
      <button className="to-graph" onClick={() => onRecord('graph')} />
      <button className="to-list" onClick={onBack} />
    </div>
  ),
}))

const { Projects, projectPaperCountLabel } = await import('./Projects.js')

describe('projectPaperCountLabel', () => {
  it('explains the empty relationship instead of rendering a bare zero', () => {
    expect(projectPaperCountLabel(0, zh)).toBe('还没有关联论文')
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
    // The page title measures whether it fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
    nav.jump = null
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

  it('新建一个项目在动态里记一条,点名的项目名带着它的 id', async () => {
    await click('#projNew')
    const input = host.querySelector<HTMLInputElement>('.projpanel input.inedit')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, '草稿树')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(ipc.create).toHaveBeenCalledWith('草稿树')
    expect(ipc.append).toHaveBeenCalledWith({ source: 'me', body: { kind: 'runs', runs: [
      { kind: 'text', text: '新项目《' }, { kind: 'text', text: '草稿树', target: { kind: 'project', id: 'project-9' } },
      { kind: 'text', text: '》已创建' },
    ] } })
  })

  it('从别的屏点链接打开一个项目的任务时,详情的返回回到来的那一屏', async () => {
    nav.jump = { screen: 'project', target: 'b', from: 'feed', seq: 3, anchor: { task: 'task-7' } }
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    expect(host.querySelector<HTMLElement>('.detail')!.dataset.task).toBe('task-7')
    await click('.detail .return')
    expect(nav.returnTo).toHaveBeenCalledWith('feed')
  })

  it('从别的屏带新建项目落点跳进来时,列表的屏头左端有返回,按它回到来的那一屏', async () => {
    nav.jump = { screen: 'project', target: '', from: 'wiki', seq: 4, anchor: { newProject: true } }
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    expect(host.querySelector('.desk-head')!.firstElementChild?.classList.contains('back')).toBe(true)
    await click('.desk-head > .back')
    expect(nav.returnTo).toHaveBeenCalledWith('wiki')
  })

  it('带新建项目落点跳进来时,从项目详情回到列表并打开新建行;再回到列表时不再打开', async () => {
    await click('[data-proj="a"]')
    nav.jump = { screen: 'project', target: '', from: 'feed', seq: 1, anchor: { newProject: true } }
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    expect(host.querySelector('[data-project]')).toBeNull()
    expect(host.querySelectorAll('.projpanel .inedit')).toHaveLength(1)

    await click('[data-proj="b"]')
    await click('.to-list')
    expect(host.querySelectorAll('.projpanel .inedit')).toHaveLength(0)
  })
})

