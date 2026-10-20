// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary, ResearchIdea } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

const api = vi.hoisted(() => ({
  ideas: [
    {
      id: 'idea-linked', title: '用可学习性信号动态分配 draft model 的蒸馏预算',
      body: '只对 disagreement 高且可学习的 token 加大蒸馏权重。',
      source: { chatId: 'chat-1', chatTitle: '摊薄的前提是共享前缀吗' },
      project: 'project-active', archived: false, created: '2026-09-17', updated: '2026-09-17',
    },
    {
      id: 'idea-independent', title: '独立想法', body: '还没有关联项目。',
      source: {
        chatId: 'chat-2', chatTitle: '新方向', paperId: 'paper-2', paperTitle: '推测解码的可学习性',
      },
      archived: false, created: '2026-09-17', updated: '2026-09-17',
    },
    {
      id: 'idea-completed', title: '已完成项目的想法', body: '完成后自动退出注意力队列。',
      source: { chatId: 'chat-3', chatTitle: '完成复盘' },
      project: 'project-completed', archived: true, created: '2026-09-16', updated: '2026-09-17',
    },
  ] as ResearchIdea[],
  projects: [
    { id: 'project-active', name: '推测解码', status: '进行中' },
    { id: 'project-completed', name: '已完成实验', status: '已完成' },
  ] as unknown as ProjectSummary[],
  update: vi.fn(async () => {}),
  promote: vi.fn(async () => ({ idea: {}, project: {} })),
  remove: vi.fn(async () => {}),
  reorder: vi.fn(async () => {}),
  open: vi.fn(),
  /** While true the idea list never arrives. */
  loading: false,
}))

vi.mock('../ipc.js', () => ({
  idea: {
    list: () => (api.loading ? new Promise(() => {}) : Promise.resolve(structuredClone(api.ideas))),
    update: api.update,
    promote: api.promote,
    delete: api.remove,
    reorder: api.reorder,
  },
  project: { list: async () => structuredClone(api.projects) },
}))
vi.mock('../shell/AppShell.js', () => ({
  useEscapeLayer: () => {},
  useScreenReentry: () => 0,
  useJump: () => ({ jump: null, open: api.open }),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

const { Ideas } = await import('./Ideas.js')

describe('Ideas', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    api.update.mockClear()
    api.promote.mockClear()
    api.open.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    api.loading = false
  })

  it('没有进行中的想法时，进行中留着标题，下面是一行分节空态，不是整页的', async () => {
    const held = api.ideas
    api.ideas = held.filter((idea) => idea.archived)
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    api.ideas = held
    expect(host.querySelector('.ideas-list .section-heading')?.textContent).toBe('进行中 · 0')
    expect(host.querySelector('.ideas-list .empty-state')?.className).toBe('empty-state empty-state--section')
  })

  it('列表还没到时显示载入占位，不说还没有想法', async () => {
    api.loading = true
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    expect(host.querySelector('.ideas-list .empty-state')).toBeNull()
    expect(host.querySelector('.ideas-list .loading-placeholder')).not.toBeNull()
  })

  it('想法卡片从操作槽里的把手拖，卡片本身不能拖；更多菜单和 Alt+↑ 也能挪，只在同一组里挪', async () => {
    api.reorder.mockClear()
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    const card = (id: string) => host.querySelector<HTMLElement>(`[data-idea="${id}"]`)!
    expect(card('idea-linked').hasAttribute('draggable')).toBe(false)
    expect(card('idea-linked').querySelector('.row-actions .drag-handle')!.getAttribute('draggable')).toBe('true')

    await act(async () => {
      card('idea-independent').querySelector('.research-object-card-open')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }))
    })
    expect(api.reorder).toHaveBeenLastCalledWith(['idea-independent', 'idea-linked', 'idea-completed'])

    await act(async () => {
      card('idea-independent').querySelector('.dots')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    const items = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
    expect(items.map((item) => [item.textContent, item.hasAttribute('data-disabled')]).slice(0, 2))
      .toEqual([['上移', false], ['下移', true]])
    await act(async () => { items[0]!.click() })
    expect(api.reorder).toHaveBeenLastCalledWith(['idea-independent', 'idea-linked', 'idea-completed'])
  })

  it('来源标签跟在来源后面：对话和论文阅读写来源的种类，agent 记下的只写 agent', async () => {
    api.ideas.push({
      id: 'idea-agent', title: 'agent 记下的想法', body: '按接受率调宽度。',
      source: { chatId: 'agent-1', chatTitle: '动态树宽度的实现讨论', agent: true },
      archived: false, created: '2026-09-17', updated: '2026-09-17',
    })
    try {
      await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
      const meta = (id: string) => [...host.querySelector(`[data-idea="${id}"] .idea-card-meta`)!.children]
        .map((child) => (child.classList.contains('source-label') ? `[${child.textContent}]` : child.className))
      expect(meta('idea-linked')).toEqual(['idea-card-source', '[对话]', 'idea-card-updated'])
      expect(meta('idea-independent')).toEqual(['idea-card-source', '[论文阅读]', 'idea-card-updated'])
      expect(meta('idea-agent')).toEqual(['idea-card-source', '[agent]', 'idea-card-updated'])
    } finally {
      api.ideas.pop()
    }
  })

  it('卡片展示判断所需的摘要、项目、来源和时间，点击后在右侧编辑', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    expect(host.querySelector('.idea-detail-slot')?.getAttribute('data-panel-state')).toBe('closed')

    expect(host.textContent).toContain('用可学习性信号动态分配 draft model 的蒸馏预算')
    expect(host.textContent).toContain('进行中 · 2')

    const linked = host.querySelector('[data-idea="idea-linked"]')!
    expect(linked.classList.contains('research-object-card')).toBe(true)
    expect(linked.textContent).toContain('项目 · 推测解码')
    // The project tag names the project inside a card that opens the idea, so it is a label, not a link.
    expect(linked.querySelector('.idea-project-tag')!.className).toContain('tag--neutral')
    expect(linked.textContent).toContain('只对 disagreement 高且可学习的 token 加大蒸馏权重。')
    expect(linked.textContent).toContain('对话')
    expect(linked.textContent).toContain('来源 · 摊薄的前提是共享前缀吗')
    expect(linked.textContent).toContain('9月17日 更新')
    expect(linked.getAttribute('role')).toBeNull()
    expect([...linked.querySelectorAll('button')].map((item) => item.getAttribute('aria-label') ?? item.textContent))
      .toEqual(['用可学习性信号动态分配 draft model 的蒸馏预算', '管理想法：用可学习性信号动态分配 draft model 的蒸馏预算'])
    expect(linked.querySelector('.research-object-card-open')!.textContent).toBe('用可学习性信号动态分配 draft model 的蒸馏预算')

    const independent = host.querySelector('[data-idea="idea-independent"]')!
    expect(independent.textContent).toContain('未关联项目')
    expect(independent.textContent).toContain('论文阅读')
    expect(independent.textContent).toContain('来源 · 推测解码的可学习性 · 新方向')

    await act(async () => { (linked as HTMLElement).click() })
    expect(host.querySelector('.idea-detail-slot')?.getAttribute('data-panel-state')).toBe('open')
    const detail = host.querySelector('.idea-detail-panel')!
    expect(detail.querySelector('.idea-panel-head .node-document-title')!.textContent)
      .toBe('用可学习性信号动态分配 draft model 的蒸馏预算')
    expect([...detail.querySelectorAll('.section-heading--rail')].map((heading) => heading.textContent))
      .toEqual(['用可学习性信号动态分配 draft model 的蒸馏预算编辑', '内容', '关联项目打开项目', '来源打开来源对话'])
    expect(detail.textContent).toContain('只对 disagreement 高且可学习的 token 加大蒸馏权重。')
    const edit = [...detail.querySelectorAll<HTMLButtonElement>('button')]
      .find((item) => item.textContent === '编辑')!
    await act(async () => { edit.click() })
    expect(detail.querySelector('.idea-detail-editor')).not.toBeNull()
    expect(document.querySelector('.idea-dialog')).toBeNull()
    const headButtons = () => [...detail.querySelectorAll<HTMLButtonElement>('.idea-panel-head .btn')]
      .map((item) => item.textContent)
    expect(headButtons()).toEqual(['取消', '保存'])
    expect(detail.querySelector('.idea-detail-editor button')).toBeNull()
    const titleField = detail.querySelector<HTMLInputElement>('.idea-detail-editor input')!
    await act(async () => {
      titleField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(detail.querySelector('.idea-detail-editor')).toBeNull()
    expect(api.update).not.toHaveBeenCalled()
    await act(async () => {
      [...detail.querySelectorAll<HTMLButtonElement>('.idea-panel-head .btn')].find((item) => item.textContent === '编辑')!.click()
    })
    await act(async () => {
      detail.querySelector('.idea-detail-editor input')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(api.update).toHaveBeenCalledWith('idea-linked', {
      title: '用可学习性信号动态分配 draft model 的蒸馏预算', body: '只对 disagreement 高且可学习的 token 加大蒸馏权重。',
    })
    api.update.mockClear()

    expect(detail.querySelector('select')).toBeNull()
    await act(async () => {
      detail.querySelector('.idea-link-picker')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    const none = [...document.querySelectorAll<HTMLElement>('.choice-picker-menu [role="menuitemradio"]')]
      .find((item) => item.textContent === '未关联项目')!
    await act(async () => {
      none.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      none.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(api.update).toHaveBeenCalledWith('idea-linked', { project: null })

    await act(async () => { (independent as HTMLElement).click() })
    const independentDetail = host.querySelector('.idea-detail-panel')!
    const promote = [...independentDetail.querySelectorAll<HTMLButtonElement>('button')]
      .find((item) => item.textContent === '转为项目')!
    await act(async () => { promote.click() })
    expect(api.promote).toHaveBeenCalledWith('idea-independent')

    await act(async () => { (linked as HTMLElement).click() })
    const openProject = [...host.querySelectorAll<HTMLButtonElement>('.idea-detail-panel button')]
      .find((item) => item.textContent === '打开项目')!
    await act(async () => { openProject.click() })
    expect(api.open).toHaveBeenCalledWith('project', 'project-active')

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.idea-detail-panel .panel-close')!.click()
    })
    expect(host.querySelector('.idea-detail-slot')?.getAttribute('data-panel-state')).toBe('closed')
    expect(host.querySelector('.idea-detail-panel')).toBeNull()
  })

  it('已归档的想法收进一个带条数的折叠分组,和项目计划里的已归档一样默认收起', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    const group = host.querySelector<HTMLElement>('.collapsible-group.collapsible-group--quiet')!
    expect(group.querySelector('.collapsible-group-title')!.textContent).toBe('已归档')
    expect(group.querySelector('.collapsible-group-count')!.textContent).toBe('· 1')
    expect(host.querySelector('[data-idea="idea-completed"]')).toBeNull()
    await act(async () => { group.querySelector<HTMLButtonElement>('.collapsible-group-toggle')!.click() })
    expect(group.querySelector('[data-idea="idea-completed"]')).not.toBeNull()
  })

  it('想法详情里每一节的操作放在那一节小标题的右端', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    const headings = async (id: string) => {
      await act(async () => { host.querySelector<HTMLElement>(`[data-idea="${id}"]`)!.click() })
      return [...host.querySelectorAll<HTMLElement>('.idea-detail-panel > .section-heading:not(.idea-panel-head)')].map((heading) => [
        heading.firstChild!.textContent,
        [...heading.querySelectorAll(':scope > .section-heading-actions > .btn')].map((button) => button.textContent),
      ])
    }
    expect(await headings('idea-linked')).toEqual([['内容', []], ['关联项目', ['打开项目']], ['来源', ['打开来源对话']]])
    expect(await headings('idea-independent')).toEqual([['内容', []], ['关联项目', ['转为项目']], ['来源', ['打开来源对话']]])
  })
})
