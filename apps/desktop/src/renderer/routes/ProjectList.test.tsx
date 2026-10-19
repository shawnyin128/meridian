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
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
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
    expect(text).toBe('最近推进10月16日开始推进 树形草稿')
  })

  it('那天最新的一条是 agent 写的时,它后面跟 agent 标签', async () => {
    await recentProgress(summary({
      lastProgress: '2026-10-16', recentEvents: [{ date: '2026-10-16', text: '跑完基线', origin: 'agent' }],
    }))
    const recent = host.querySelector('[data-proj="spec"] .project-card-recent')!
    expect(recent.lastElementChild!.textContent).toBe('跑完基线agent')
    expect(recent.lastElementChild!.lastElementChild!.classList.contains('source-label')).toBe(true)
  })

  it('还没有推进时写还没有记录', async () => {
    expect(await recentProgress(summary({}))).toBe('最近推进还没有记录。')
  })
})

describe('Project list', () => {
  it('opens an ongoing project from the button that holds its name; the card itself is no button', async () => {
    api.projects = [summary({ id: 'moe', name: 'MoE 路由分析', status: '进行中', priority: 'p2', topic: '混合专家' })]
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    const card = host.querySelector<HTMLElement>('.research-object-card[data-proj="moe"]')!
    expect(card.getAttribute('role')).toBeNull()
    const open = card.querySelector<HTMLElement>('.research-object-card-open')!
    expect(open.tagName).toBe('BUTTON')
    expect(open.textContent).toContain('MoE 路由分析')
    act(() => open.click())
    expect(host.querySelector('[data-open="moe"]')).not.toBeNull()
  })

  it('搁置和已完成的项目是嵌入列表里的结构行，主题跟在名字和状态后面，和卡片的身份顺序一样', async () => {
    api.projects = [
      summary({ id: 'draft', name: 'draft 效率', status: '搁置', priority: 'p1', topic: '推理', focus: '等算力' }),
      summary({ id: 'flash', name: 'FlashAttention 复现', status: '搁置', priority: 'p2', topic: '注意力', focus: '等 H100' }),
    ]
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    const row = host.querySelector<HTMLElement>('[data-proj="draft"]')!
    expect(row.classList.contains('structured-row')).toBe(true)
    expect(row.parentElement!.className).toBe('structured-list structured-list--embedded')
    const identity = [...row.querySelector('.project-identity')!.children].map((part) => part.textContent)
    expect(identity).toEqual(['draft 效率', '搁置', '推理'])
    expect(row.querySelector('.tp')).toBeNull()
  })

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

  it('排序和新建项目作用于整页,放在屏头右端,一种尺寸,新建在最后;分组标题不再带按钮', async () => {
    api.projects = [summary({})]
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    const actions = [...host.querySelectorAll<HTMLButtonElement>('.desk-head > .page-actions > button')]
    expect(actions.map((b) => [b.textContent, b.className.split(' ').slice(0, 2).join(' ')]))
      .toEqual([['排序', 'btn sort-menu'], ['新建项目', 'btn pri']])
    expect(host.querySelector('.section-heading .section-heading-actions')).toBeNull()
    act(() => actions[1]!.click())
    expect(host.querySelector('.desk-body input')).not.toBeNull()
  })
})

describe('项目的排序', () => {
  const ongoing = [
    summary({ id: 'a', name: '甲', status: '进行中' }),
    summary({ id: 'b', name: '乙', status: '进行中' }),
    summary({ id: 'c', name: '丙', status: '搁置', focus: '等算力' }),
  ]
  const mount = async () => {
    api.projects = ongoing
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
  }
  const reorder = async () => vi.mocked((await import('../ipc.js')).project.reorder)

  it('卡片和搁置的行从操作槽里的把手拖，卡片和行本身不能拖，里面的字可以选', async () => {
    await mount()
    for (const id of ['a', 'c']) {
      const item = host.querySelector(`[data-proj="${id}"]`)!
      expect(item.hasAttribute('draggable'), id).toBe(false)
      expect(item.getAttribute('data-reorder-item'), id).toBe(id)
      expect(item.querySelector('.row-actions .drag-handle')!.getAttribute('draggable'), id).toBe('true')
    }
  })

  it('「更多」菜单里有上移和下移，到了头那一项不能点；下移把项目往下挪一格', async () => {
    await mount()
    ;(await reorder()).mockClear()
    const dots = host.querySelector<HTMLElement>('[data-proj="a"] .dots')!
    await act(async () => { dots.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    const items = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
    expect(items.map((item) => [item.textContent, item.hasAttribute('data-disabled')]).slice(0, 3))
      .toEqual([['重命名', false], ['上移', true], ['下移', false]])
    await act(async () => { items[2]!.click() })
    expect(await reorder()).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('Alt+↓ 在卡片里把项目往下挪一格，只在同一状态里挪', async () => {
    await mount()
    ;(await reorder()).mockClear()
    const open = (id: string) => host.querySelector<HTMLElement>(`[data-proj="${id}"] button`)!
    await act(async () => { open('a').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })) })
    expect(await reorder()).toHaveBeenCalledWith(['b', 'a', 'c'])
    ;(await reorder()).mockClear()
    await act(async () => { open('b').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })) })
    expect(await reorder()).not.toHaveBeenCalled()
  })
})
