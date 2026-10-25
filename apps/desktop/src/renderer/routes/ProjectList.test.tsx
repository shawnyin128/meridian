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

const api = vi.hoisted(() => ({
  projects: [] as ProjectSummary[], loading: false,
  writes: [] as { result: unknown; opts: { note?: unknown; action?: (result: never) => { label: string; onAction: () => void } } }[],
  undone: [] as string[],
}))

vi.mock('../ipc.js', () => ({
  feed: { append: vi.fn() },
  project: {
    list: () => (api.loading ? new Promise(() => {}) : Promise.resolve(structuredClone(api.projects))),
    reorder: vi.fn(),
    delete: () => Promise.resolve({ change: 'change-delete' }),
  },
  changelog: { undo: (id: string) => { api.undone.push(id); return Promise.resolve() } },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: null, open: vi.fn(), returnTo: vi.fn() }),
  useScreenEntry: () => 0,
  useToday: () => '2026-10-16',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>, opts = {}) => { api.writes.push({ result: await work, opts }); return true },
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
  api.loading = false
})

describe('项目列表空着时', () => {
  it('进行中留着标题和新建，下面是一行分节空态，不摆排序', async () => {
    api.projects = []
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    expect(host.querySelector('.section-heading')?.textContent).toContain('进行中')
    expect(host.querySelector('.empty-state--section')?.textContent).toBe('—')
    expect(host.querySelector('.section-heading .sort-menu')).toBeNull()
    expect(host.querySelector('#projNew')).not.toBeNull()
  })
})

describe('项目列表在载入时', () => {
  it('列表还没读到时页面里是载入占位，不是一片空白', async () => {
    api.loading = true
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    expect(host.querySelector('.desk-body .loading-placeholder')).not.toBeNull()
  })
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

  it('还没有推进时最近推进一格写 —', async () => {
    expect(await recentProgress(summary({}))).toBe('最近推进—')
  })

  it('停滞超过 7 天的项目在卡片头里、名字那一行的后面挂一个警示标签写着几天无推进,卡片底下不再多一行', async () => {
    api.projects = [
      summary({ id: 'spec', priority: 'p2', lastProgress: '2026-10-06' }),
      summary({ id: 'kv', name: 'KV cache 量化', priority: 'p2', lastProgress: '2026-10-09' }),
    ]
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    const afterName = (id: string) => host.querySelector(`[data-proj="${id}"] .pp-h > .research-object-card-open`)!.nextElementSibling!
    expect([afterName('spec').className, afterName('spec').textContent]).toEqual(['tag tag--label tag--warn', '已 10 天无推进'])
    expect(afterName('kv').className).toBe('dd')
    expect(host.querySelectorAll('.project-card-alert')).toHaveLength(0)
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

  it('屏头的数和侧栏一样只数进行中的项目', async () => {
    api.projects = [
      summary({ id: 'a', status: '进行中' }), summary({ id: 'b', status: '搁置' }), summary({ id: 'c', status: '已完成' }),
    ]
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    expect(host.querySelector('.desk-head .t')!.textContent).toBe('项目 · 1')
  })

  it('搁置项目那一行的焦点用全角冒号接在它的名字后面', async () => {
    api.projects = [summary({ id: 'draft', name: 'draft 效率', status: '搁置', focus: '等算力' })]
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    expect(host.querySelector('.prow[data-proj="draft"] .m')!.textContent).toMatch(/^重启条件：等算力 · /)
  })

  it('排序和新建项目作用于整页,放在屏头右端,一种尺寸,新建在最后;分组标题不再带按钮', async () => {
    api.projects = [summary({})]
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
    const actions = [...host.querySelectorAll<HTMLButtonElement>('.desk-head > .page-actions > button')]
    expect(actions.map((b) => [b.textContent, b.className.split(' ').slice(0, 2).join(' ')]))
      .toEqual([['排序', 'btn sort-menu'], ['新建项目', 'btn add-action']])
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
      .toEqual([['重命名…', false], ['上移', true], ['下移', false]])
    await act(async () => { items[2]!.click() })
    expect(await reorder()).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('从「更多」菜单删掉项目，提示只说已移入垃圾桶，撤销的是这次删除记下的那条变动', async () => {
    await mount()
    const dots = host.querySelector<HTMLElement>('[data-proj="a"] .dots')!
    await act(async () => { dots.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    const remove = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')].find((item) => item.textContent === '删除')!
    await act(async () => { remove.click() })
    const deleted = api.writes.at(-1)!
    const action = deleted.opts.action!(deleted.result as never)
    expect([deleted.opts.note, action.label]).toEqual(['已移入垃圾桶', '撤销'])
    await act(async () => { action.onAction() })
    expect(api.undone).toEqual(['change-delete'])
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

describe('项目列表按领域筛', () => {
  const listed = [
    summary({ id: 'spec', name: '推测解码加速', status: '进行中', topic: '推理加速' }),
    summary({ id: 'kv', name: 'KV cache 量化', status: '进行中', topic: 'KV cache' }),
    summary({ id: 'moe', name: 'MoE 路由分析', status: '进行中', topic: '混合专家', topics: ['混合专家', '推理加速'] }),
    summary({ id: 'fresh', name: '新项目', status: '进行中', topic: '未分主题' }),
    summary({ id: 'flash', name: 'FlashAttention 复现', status: '搁置', topic: '推理加速', focus: '等 H100' }),
  ]
  const mount = async () => {
    api.projects = listed
    await act(async () => root.render(<MessagesProvider><Projects /></MessagesProvider>))
  }
  const filter = () => host.querySelector<HTMLButtonElement>('.desk-body .page-toolbar .filter-menu')!
  const options = async () => {
    await act(async () => { filter().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })) })
    return [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]')]
  }
  const pick = async (label: string) => {
    const item = (await options()).find((option) => option.textContent === label)!
    await act(async () => { item.click() })
  }
  const shown = () => [...host.querySelectorAll('[data-proj]')].map((item) => item.getAttribute('data-proj'))

  it('页面工具栏里是和论文表同一个筛选:筛选二字加一个按钮,选项是全部领域、用到的每个领域,最后是未分领域', async () => {
    await mount()
    expect(host.querySelector('.desk-body .page-toolbar')!.textContent).toBe('筛选领域')
    expect(filter().classList.contains('on')).toBe(false)
    expect((await options()).map((option) => option.textContent)).toEqual(['全部领域', '推理加速', 'KV cache', '混合专家', '未分领域'])
  })

  it('选一个领域只剩带着它的项目,有几个领域的也在,屏头的数跟着变;再选全部领域就全回来', async () => {
    await mount()
    await pick('推理加速')
    expect(shown()).toEqual(['spec', 'moe', 'flash'])
    expect([filter().textContent, filter().classList.contains('on')]).toEqual(['推理加速', true])
    expect(host.querySelector('.desk-head .t')!.textContent).toBe('项目 · 2')
    await pick('全部领域')
    expect(shown()).toEqual(['spec', 'kv', 'moe', 'fresh', 'flash'])
  })

  it('选未分领域只剩还没有领域的项目', async () => {
    await mount()
    await pick('未分领域')
    expect(shown()).toEqual(['fresh'])
  })

  it('筛着的时候挪动一个项目,存下的顺序里藏起来的项目都在原位', async () => {
    await mount()
    await pick('推理加速')
    const reorder = vi.mocked((await import('../ipc.js')).project.reorder)
    reorder.mockClear()
    const open = host.querySelector<HTMLElement>('[data-proj="spec"] button')!
    await act(async () => { open.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })) })
    expect(reorder).toHaveBeenCalledWith(['moe', 'kv', 'spec', 'fresh', 'flash'])
  })
})
