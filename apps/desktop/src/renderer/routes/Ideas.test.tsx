// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary, ResearchIdea } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import type { ScreenJump } from '../shell/AppShell.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

/** An idea the user wrote down without a chat, as Core stores it. */
const OWN: ResearchIdea = {
  id: 'idea-own', title: '按 batch 校准阈值', body: '先在两个 batch 上试。',
  source: { chatTitle: '手动添加' }, archived: false, created: '2026-10-21', updated: '2026-10-21',
}

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
      sourceProject: 'project-completed', relations: { projects: ['project-active'], pages: ['topics/kv'] },
      archived: false, created: '2026-09-17', updated: '2026-09-17',
    },
    {
      id: 'idea-completed', title: '已完成项目的想法', body: '完成后自动退出注意力队列。',
      source: { chatId: 'chat-3', chatTitle: '完成复盘' }, sourceProject: 'project-active',
      project: 'project-completed', archived: true, created: '2026-09-16', updated: '2026-09-17',
    },
    {
      id: 'idea-paused', title: '搁置项目里的想法', body: '项目搁置了，想法还在做。',
      source: { chatId: 'chat-4', chatTitle: '搁置讨论' }, sourceProject: 'project-active',
      project: 'project-shelved', archived: false, created: '2026-09-15', updated: '2026-09-15',
    },
    {
      id: 'idea-aside', title: '放下的想法', body: '暂时不做。',
      source: { chatId: 'chat-5', chatTitle: '放下' }, archived: true, created: '2026-09-14', updated: '2026-09-14',
    },
  ] as ResearchIdea[],
  projects: [
    { id: 'project-active', name: '推测解码', status: '进行中' },
    { id: 'project-completed', name: '已完成实验', status: '已完成' },
    { id: 'project-shelved', name: '搁置项目', status: '搁置' },
  ] as unknown as ProjectSummary[],
  update: vi.fn(async () => {}),
  place: vi.fn(async () => ({ idea: {}, project: null, nodeId: null })),
  /** The project details `project.get` answers with, by id. */
  details: {} as Record<string, unknown>,
  promote: vi.fn(async () => ({ idea: {}, project: {} })),
  remove: vi.fn(async () => ({ trash: 'trash-idea' })),
  restored: [] as string[],
  writes: [] as { result: unknown; opts: { note?: unknown; action?: (result: never) => { label: string; onAction: () => void } } }[],
  reorder: vi.fn(async () => {}),
  open: vi.fn(),
  create: vi.fn<(chatId: string | undefined, title: string, body: string) => Promise<ResearchIdea>>(),
  /** While true the idea list never arrives. */
  loading: false,
  jump: null as ScreenJump | null,
  revision: 0,
  returnTo: vi.fn(),
}))

vi.mock('../ipc.js', () => ({
  idea: {
    list: () => (api.loading ? new Promise(() => {}) : Promise.resolve(structuredClone(api.ideas))),
    update: api.update,
    placeOnGraph: api.place,
    promote: api.promote,
    delete: api.remove,
    reorder: api.reorder,
    create: api.create,
  },
  project: { list: async () => structuredClone(api.projects), get: async (id: string) => structuredClone(api.details[id]) },
  wiki: { cards: async () => [{ id: 'topics/sd', title: '推测解码' }, { id: 'topics/kv', title: 'KV 量化' }] },
  trash: { restore: async (id: string) => { api.restored.push(id) } },
}))
vi.mock('../shell/AppShell.js', () => ({
  useEscapeLayer: () => {},
  useScreenReentry: () => 0,
  useJump: () => ({ jump: api.jump, open: api.open, returnTo: api.returnTo }),
  useScreenEntry: () => 0,
  useVaultRevision: () => ({ revision: api.revision, bump: vi.fn() }),
}))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>, opts = {}) => { api.writes.push({ result: await work, opts }); return true },
}))

const { Ideas } = await import('./Ideas.js')

describe('Ideas', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // The page title measures whether it fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    api.update.mockClear()
    api.place.mockClear()
    api.promote.mockClear()
    api.open.mockClear()
    api.create.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    api.loading = false
    api.jump = null
    vi.unstubAllGlobals()
  })

  it('没有未开始的想法时，未开始留着标题，下面是一行分节空态，不是整页的', async () => {
    const held = api.ideas
    api.ideas = held.filter((idea) => idea.project !== undefined || idea.archived)
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    api.ideas = held
    const heading = host.querySelector('.ideas-list .section-heading')!
    expect(heading.textContent).toBe('未开始 · 0')
    expect(heading.nextElementSibling?.className).toBe('empty-state empty-state--section')
  })

  it('想法按做到哪一步分组：未开始是卡片，进行中和已完成是行，放下的收进已归档；搁置项目里的想法算进行中，带搁置标签', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    const groups = [...host.querySelectorAll<HTMLElement>('.ideas-list > .section-heading')].map((heading) => heading.textContent)
    expect(groups).toEqual(['未开始 · 1', '进行中 · 2', '已完成 · 1', '各项目的想法'])
    const row = (id: string) => host.querySelector<HTMLElement>(`[data-idea="${id}"]`)!
    expect(row('idea-independent').classList.contains('research-object-card')).toBe(true)
    expect(row('idea-independent').textContent).not.toContain('还没有关联项目。')
    expect([...row('idea-independent').querySelectorAll('.idea-relation-tag')].map((tag) => tag.textContent))
      .toEqual(['项目 · 推测解码', 'Wiki · KV 量化'])
    expect(row('idea-independent').textContent).toContain('来源 · 已完成实验 · 推测解码的可学习性 · 新方向')
    for (const id of ['idea-linked', 'idea-paused', 'idea-completed']) expect(row(id).classList.contains('structured-row')).toBe(true)
    expect([...row('idea-linked').querySelectorAll('.idea-row-work .tag')].map((tag) => tag.textContent)).toEqual(['推测解码'])
    expect([...row('idea-paused').querySelectorAll('.idea-row-work .tag')].map((tag) => tag.textContent)).toEqual(['搁置项目', '搁置'])
    expect(row('idea-completed').closest('.structured-list')!.previousElementSibling!.textContent).toBe('已完成 · 1')
    const archived = host.querySelector<HTMLElement>('.collapsible-group.collapsible-group--quiet')!
    expect(archived.querySelector('.collapsible-group-count')!.textContent).toBe(' · 1')
  })

  it('放在项目里一个已经收尾的科研节点上的想法算已完成，项目还在进行', async () => {
    api.details['project-active'] = {
      id: 'project-active', graph: { nodes: [{ id: 'n-done', label: '收尾的节点', state: 'done', x: 0, y: 0, width: 100, writebacks: [] }], edges: [] },
    }
    api.ideas.push({ ...OWN, id: 'idea-node', title: '节点上的想法', project: 'project-active', node: 'n-done' })
    try {
      await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
      expect(host.querySelector('[data-idea="idea-node"]')!.closest('.structured-list')!.previousElementSibling!.textContent).toBe('已完成 · 2')
    } finally {
      api.ideas.pop()
    }
  })

  it('各项目的想法按想法冒出来的项目数：每个项目一行，想法、进行中和已完成三栏，多的在前；点一行打开那个项目', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    const rows = [...host.querySelectorAll<HTMLElement>('.idea-stats .idea-stats-row')]
    expect(host.querySelector('.idea-stats-head')!.textContent).toBe('想法进行中已完成')
    expect(rows.map((row) => [...row.children].map((cell) => cell.textContent)))
      .toEqual([['推测解码', '2', '1', '1'], ['已完成实验', '1', '0', '0'], ['搁置项目', '0', '0', '0']])
    expect(host.querySelector('.idea-stats')!.classList.contains('structured-list--embedded')).toBe(true)
    await act(async () => { rows[0]!.click() })
    expect(api.open).toHaveBeenCalledWith('project', 'project-active')
  })

  it('排序和新建想法作用于整页的想法，和项目一样放在屏头右端，一种尺寸，新建在最后；分组的标题不带按钮', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    const actions = [...host.querySelectorAll<HTMLButtonElement>('.desk-head > .page-actions > button')]
    expect(actions.map((b) => [b.textContent, b.className.split(' ').slice(0, 2).join(' ')]))
      .toEqual([['排序', 'btn sort-menu'], ['新建想法', 'btn pri']])
    expect(host.querySelector('.ideas-list .section-heading .section-heading-actions')).toBeNull()
  })

  /** Sets a field's value the way typing does, so React sees the change. */
  const type = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = field instanceof window.HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const press = (field: Element, key: string, metaKey = false) => act(() => {
    field.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey, bubbles: true, cancelable: true }))
  })
  const draft = () => host.querySelector<HTMLElement>('.ideas-list > .idea-draft-card')
  const openDraft = () => act(async () => {
    [...host.querySelectorAll<HTMLButtonElement>('.desk-head > .page-actions > button')].at(-1)!.click()
  })
  /** Makes `idea.create` answer as Core does: the new idea leads the list it returns next. */
  const createLikeCore = () => api.create.mockImplementationOnce(async (_chatId, title, body) => {
    const idea = { ...OWN, title, body }
    api.ideas.unshift(idea)
    return idea
  })

  it('新建想法在未开始最前面摆一张草稿卡，标题框已获得焦点，下面是正文框；不弹对话框', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    await openDraft()
    expect(draft()?.previousElementSibling?.textContent).toBe('未开始 · 1')
    expect(draft()!.nextElementSibling?.getAttribute('data-idea')).toBe('idea-independent')
    expect(document.activeElement).toBe(draft()!.querySelector('input'))
    expect(draft()!.querySelector('textarea')).not.toBeNull()
    expect(document.querySelector('[role="dialog"], .idea-dialog')).toBeNull()
  })

  it('新建想法的草稿卡里是对话存为想法用的同一个草稿表单，取消和保存在它的底部', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    await openDraft()
    const card = host.querySelector('.ideas-list > .section-heading')!.nextElementSibling!
    expect([card.classList.contains('research-object-card'), card.firstElementChild?.className])
      .toEqual([true, 'draft-form idea-draft'])
    expect([...card.querySelectorAll('.draft-form-foot button')].map((button) => button.textContent)).toEqual(['取消', '保存'])
  })

  it('在正文里按 ⌘Enter 新建自己的想法、不关联项目；它取代草稿排在未开始最前，并在详情里打开', async () => {
    createLikeCore()
    try {
      await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
      await openDraft()
      act(() => {
        type(draft()!.querySelector('input')!, '按 batch 校准阈值')
        type(draft()!.querySelector('textarea')!, '先在两个 batch 上试。')
      })
      await press(draft()!.querySelector('textarea')!, 'Enter', true)
      expect(api.create).toHaveBeenCalledWith(undefined, '按 batch 校准阈值', '先在两个 batch 上试。')
      expect(api.update).not.toHaveBeenCalled()
      expect(draft()).toBeNull()
      expect(document.querySelector('[role="dialog"], .idea-dialog')).toBeNull()
      const first = () => host.querySelector('.ideas-list > .section-heading')!.nextElementSibling
      expect(first()?.getAttribute('data-idea')).toBe('idea-own')
      expect(first()?.classList.contains('selected')).toBe(true)
      expect(host.querySelector('.idea-detail-slot .node-document-title')?.textContent).toBe('按 batch 校准阈值')
      api.revision += 1
      await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
      expect(first()?.getAttribute('data-idea')).toBe('idea-own')
      expect(first()?.classList.contains('selected')).toBe(true)
    } finally {
      api.ideas = api.ideas.filter((idea) => idea.id !== OWN.id)
      api.revision = 0
    }
  })

  it('草稿卡上的保存同样新建想法', async () => {
    createLikeCore()
    try {
      await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
      await openDraft()
      act(() => {
        type(draft()!.querySelector('input')!, '按 batch 校准阈值')
        type(draft()!.querySelector('textarea')!, '先在两个 batch 上试。')
      })
      const save = [...draft()!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '保存')!
      await act(async () => { save.click() })
      expect(api.create).toHaveBeenCalledWith(undefined, '按 batch 校准阈值', '先在两个 batch 上试。')
      expect(draft()).toBeNull()
      expect(host.querySelector('.ideas-list > .section-heading')!.nextElementSibling?.getAttribute('data-idea')).toBe('idea-own')
    } finally {
      api.ideas = api.ideas.filter((idea) => idea.id !== OWN.id)
    }
  })

  it('有一栏空着时不新建：空着的那一栏标红，不多一句说明；再输入就不红了', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    await openDraft()
    const title = () => draft()!.querySelector('input')!
    const body = () => draft()!.querySelector('textarea')!
    const marked = (field: Element) => field.getAttribute('aria-invalid') === 'true'
    act(() => { type(title(), '只有标题') })
    await press(body(), 'Enter', true)
    expect([marked(title()), marked(body())]).toEqual([false, true])
    act(() => { type(title(), ''); type(body(), '只有正文') })
    await press(title(), 'Enter')
    expect([marked(title()), marked(body())]).toEqual([true, false])
    const shown = draft()!.cloneNode(true) as HTMLElement
    shown.querySelectorAll('textarea').forEach((field) => field.remove())
    expect(shown.textContent).toBe('取消保存')
    expect(api.create).not.toHaveBeenCalled()
    act(() => { type(title(), '补上标题') })
    expect(marked(title())).toBe(false)
  })

  it('Esc 丢掉草稿，在标题里按和在正文里按一样，不新建', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    await openDraft()
    act(() => { type(draft()!.querySelector('input')!, '写了一半') })
    await press(draft()!.querySelector('input')!, 'Escape')
    expect(draft()).toBeNull()
    await openDraft()
    expect(draft()!.querySelector('input')!.value).toBe('')
    act(() => { type(draft()!.querySelector('textarea')!, '写了一半') })
    await press(draft()!.querySelector('textarea')!, 'Escape')
    expect(draft()).toBeNull()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('点到草稿卡外面：空草稿收起；写了字的草稿留着，不新建也不标红；按新建想法不算点到外面', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    const outside = () => act(() => { host.querySelector('.desk-head')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    await openDraft()
    act(() => {
      host.querySelector('.desk-head > .page-actions > button:last-child')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    expect(draft()).not.toBeNull()
    await outside()
    expect(draft()).toBeNull()
    await openDraft()
    act(() => { type(draft()!.querySelector('textarea')!, '只写了正文') })
    await outside()
    expect(draft()!.querySelector('textarea')!.value).toBe('只写了正文')
    expect([...draft()!.querySelectorAll('[aria-invalid="true"]')]).toEqual([])
    expect(api.create).not.toHaveBeenCalled()
  })

  it('从别的屏点链接来时屏头左端有返回，按它回到来的那一屏；没跳进来时没有返回', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    expect(host.querySelector('.desk-head > .back')).toBeNull()
    api.jump = { screen: 'ideas', target: 'idea-linked', from: 'wiki', seq: 3 }
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    expect(host.querySelector('.desk-head')!.firstElementChild?.classList.contains('back')).toBe(true)
    await act(async () => { host.querySelector<HTMLButtonElement>('.desk-head > .back')!.click() })
    expect(api.returnTo).toHaveBeenCalledWith('wiki')
    expect(host.querySelector('.desk-head > .back')).toBeNull()
  })

  it('从命令面板带着新建想法的落点跳进来时打开同一张草稿卡，标题框获得焦点，不弹对话框', async () => {
    api.jump = { screen: 'ideas', target: '', from: 'feed', seq: 1, anchor: { newIdea: true } }
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    expect(draft()?.previousElementSibling?.className).toContain('section-heading')
    expect(document.activeElement).toBe(draft()!.querySelector('input'))
    expect(document.querySelector('[role="dialog"], .idea-dialog')).toBeNull()
  })

  it('自己写下的想法不写来源：卡片上没有来源和来源标签，详情里没有来源一节', async () => {
    api.ideas.push(OWN)
    try {
      await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
      expect([...host.querySelector('[data-idea="idea-own"] .idea-card-meta')!.children].map((child) => child.className))
        .toEqual(['idea-card-updated'])
      expect(host.querySelector('[data-idea="idea-own"]')!.textContent).not.toContain('手动添加')
      await act(async () => { host.querySelector<HTMLElement>('[data-idea="idea-own"]')!.click() })
      expect([...host.querySelectorAll('.idea-detail-panel > .section-heading:not(.idea-panel-head)')].map((h) => h.firstChild!.textContent))
        .toEqual(['内容', '关联', '所在项目'])
      expect(host.querySelector('.idea-detail-slot')!.textContent).not.toContain('手动添加')
    } finally {
      api.ideas = api.ideas.filter((idea) => idea.id !== OWN.id)
    }
  })

  it('列表还没到时显示载入占位，不说还没有想法', async () => {
    api.loading = true
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    expect(host.querySelector('.ideas-list .empty-state')).toBeNull()
    expect(host.querySelector('.ideas-list .loading-placeholder')).not.toBeNull()
  })

  it('想法卡片和行从操作槽里的把手拖，本身不能拖；更多菜单和 Alt+↑ 也能挪，只在同一组里挪', async () => {
    api.reorder.mockClear()
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    const card = (id: string) => host.querySelector<HTMLElement>(`[data-idea="${id}"]`)!
    for (const id of ['idea-independent', 'idea-linked']) {
      expect(card(id).hasAttribute('draggable')).toBe(false)
      expect(card(id).querySelector('.row-actions .drag-handle')!.getAttribute('draggable')).toBe('true')
    }

    await act(async () => {
      card('idea-paused').querySelector('.idea-row-open')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }))
    })
    expect(api.reorder).toHaveBeenLastCalledWith(['idea-paused', 'idea-independent', 'idea-completed', 'idea-linked', 'idea-aside'])

    await act(async () => {
      card('idea-paused').querySelector('.dots')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    const items = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
    expect(items.map((item) => [item.textContent, item.hasAttribute('data-disabled')]).slice(0, 2))
      .toEqual([['上移', false], ['下移', true]])
    await act(async () => { items[0]!.click() })
    expect(api.reorder).toHaveBeenLastCalledWith(['idea-paused', 'idea-independent', 'idea-completed', 'idea-linked', 'idea-aside'])
  })

  it('来源标签跟在来源后面：对话和论文阅读写来源的种类，agent 记下的只写 agent', async () => {
    api.ideas.push({
      id: 'idea-agent', title: 'agent 记下的想法', body: '按接受率调宽度。',
      source: { chatId: 'agent-1', chatTitle: '动态树宽度的实现讨论', agent: true },
      archived: false, created: '2026-09-17', updated: '2026-09-17',
    })
    try {
      await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
      const meta = (id: string, part: string) => [...host.querySelector(`[data-idea="${id}"] ${part}`)!.children]
        .map((child) => (child.classList.contains('source-label') ? `[${child.textContent}]` : child.className))
      expect(meta('idea-linked', '.idea-row-meta')).toEqual(['fade-text idea-card-source', '[对话]'])
      expect(meta('idea-independent', '.idea-card-meta')).toEqual(['fade-text idea-card-source', '[论文阅读]', 'idea-card-updated'])
      expect(meta('idea-agent', '.idea-card-meta')).toEqual(['fade-text idea-card-source', '[agent]', 'idea-card-updated'])
    } finally {
      api.ideas.pop()
    }
  })

  it('卡片和行展示判断所需的标题、关联或所在项目、来源和时间，正文留在详情里；点击后在右侧编辑', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    expect(host.querySelector('.idea-detail-slot')?.getAttribute('data-panel-state')).toBe('closed')

    const linked = host.querySelector('[data-idea="idea-linked"]')!
    expect(linked.classList.contains('structured-row')).toBe(true)
    // The project tag names the project inside a row that opens the idea, so it is a label, not a link.
    expect(linked.querySelector('.idea-row-work .tag')!.className).toContain('tag--neutral')
    expect(linked.textContent).not.toContain('只对 disagreement 高且可学习的 token 加大蒸馏权重。')
    expect(linked.textContent).toContain('对话')
    expect(linked.textContent).toContain('来源 · 摊薄的前提是共享前缀吗')
    expect(linked.textContent).toContain('9月17日 更新')
    expect([...linked.querySelectorAll('button')].map((item) => item.getAttribute('aria-label') ?? item.textContent))
      .toEqual(['用可学习性信号动态分配 draft model 的蒸馏预算', '管理想法：用可学习性信号动态分配 draft model 的蒸馏预算'])
    expect(linked.querySelector('.idea-row-open')!.textContent).toBe('用可学习性信号动态分配 draft model 的蒸馏预算')

    const independent = host.querySelector('[data-idea="idea-independent"]')!
    expect(independent.getAttribute('role')).toBeNull()
    expect(independent.querySelector('.research-object-card-open')!.textContent).toBe('独立想法')
    expect(independent.textContent).toContain('论文阅读')
    expect(independent.textContent).toContain('9月17日 更新')

    await act(async () => { (linked as HTMLElement).click() })
    expect(host.querySelector('.idea-detail-slot')?.getAttribute('data-panel-state')).toBe('open')
    const detail = host.querySelector('.idea-detail-panel')!
    expect(detail.querySelector('.idea-panel-head .node-document-title')!.textContent)
      .toBe('用可学习性信号动态分配 draft model 的蒸馏预算')
    expect([...detail.querySelectorAll('.section-heading--rail')].map((heading) => heading.textContent))
      .toEqual(['用可学习性信号动态分配 draft model 的蒸馏预算编辑', '内容', '关联关联', '所在项目打开项目', '来源打开来源对话'])
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
      .find((item) => item.textContent === '未放进项目')!
    await act(async () => {
      none.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      none.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(api.update).toHaveBeenCalledWith('idea-linked', { project: null })

    await act(async () => { (independent as HTMLElement).click() })
    const independentDetail = host.querySelector('.idea-detail-panel')!
    await act(async () => { independentDetail.querySelector<HTMLElement>('.idea-panel-source .entity-link')!.click() })
    expect(api.open).toHaveBeenCalledWith('reader', 'paper-2')
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
    expect(group.querySelector('.collapsible-group-count')!.textContent).toBe(' · 1')
    expect(host.querySelector('[data-idea="idea-aside"]')).toBeNull()
    await act(async () => { group.querySelector<HTMLButtonElement>('.collapsible-group-toggle')!.click() })
    expect(group.querySelector('[data-idea="idea-aside"]')!.classList.contains('research-object-card')).toBe(true)
  })

  it('删掉想法后提示只说已移入垃圾桶，撤销把垃圾桶里那一条放回', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    await act(async () => {
      host.querySelector('[data-idea="idea-independent"] .dots')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    const remove = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')].find((item) => item.textContent === '删除')!
    await act(async () => { remove.click() })
    const deleted = api.writes.at(-1)!
    const action = deleted.opts.action!(deleted.result as never)
    expect([deleted.opts.note, action.label]).toEqual(['已移入垃圾桶', '撤销'])
    await act(async () => { action.onAction() })
    expect(api.restored).toEqual(['trash-idea'])
  })

  it('在已完成项目里做完的想法，取消归档按不了，菜单项后面写着项目已完成', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    await act(async () => {
      host.querySelector('[data-idea="idea-completed"] .dots')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    const unarchive = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
      .find((item) => item.textContent?.startsWith('取消归档'))!
    expect([unarchive.hasAttribute('data-disabled'), unarchive.querySelector('.mi-key')?.textContent])
      .toEqual([true, '项目已完成'])
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
    expect(await headings('idea-linked'))
      .toEqual([['内容', []], ['关联', ['关联']], ['所在项目', ['打开项目']], ['来源', ['打开来源对话']]])
    expect(await headings('idea-independent'))
      .toEqual([['内容', []], ['关联', ['关联']], ['所在项目', ['转为项目']], ['来源', ['打开来源对话']]])
  })

  /** Renders the page with `idea` added to the list and opens its detail panel. */
  const openWith = async (idea: ResearchIdea) => {
    const held = api.ideas
    api.ideas = [idea, ...held]
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    await act(async () => { host.querySelector<HTMLElement>(`[data-idea="${idea.id}"]`)!.click() })
    api.ideas = held
    return host.querySelector<HTMLElement>('.idea-detail-panel')!
  }
  const SPARKED: ResearchIdea = {
    ...OWN, id: 'idea-sparked', title: '在推测解码里冒出来的想法', sourceProject: 'project-active',
    relations: { projects: ['project-completed'], pages: ['topics/sd'] },
  }

  it('关联一节按行列出想法关联的项目和 Wiki 页；来源写它冒出来的那个项目，和关联、所在项目分开', async () => {
    const detail = await openWith(SPARKED)
    const row = (kind: string) => [...detail.querySelectorAll(`[data-relations="${kind}"] .tagchip`)].map((chip) => chip.textContent)
    expect([row('projects'), row('pages')]).toEqual([['已完成实验'], ['推测解码']])
    expect(detail.querySelector('.idea-panel-source')!.textContent).toBe('推测解码')
    expect(detail.querySelector('.idea-link-picker')!.textContent).toBe('未放进项目')
    await act(async () => { detail.querySelector<HTMLElement>('[data-relations="pages"] .tagchip-open')!.click() })
    expect(api.open).toHaveBeenCalledWith('wiki', 'topics/sd')
  })

  it('添加关联在项目那一行就地打开草稿，来源项目作为候选排在最前；选中就写下整组关联，移除也一样', async () => {
    const detail = await openWith(SPARKED)
    const add = [...detail.querySelectorAll<HTMLButtonElement>('.section-heading-actions .btn')].find((button) => button.textContent === '关联')!
    await act(async () => { add.click() })
    expect(document.querySelector('.modal-body')).toBeNull()
    const draftRow = detail.querySelector('[data-relations="projects"]')!
    expect(draftRow.querySelector('.reladd input')).not.toBeNull()
    await act(async () => { await new Promise((settle) => setTimeout(settle, 0)) })
    const hits = [...document.querySelectorAll<HTMLElement>('.pickhits .mi')]
    expect(hits.map((hit) => hit.textContent)).toEqual(['推测解码来源'])
    await act(async () => { hits[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) })
    expect(api.update).toHaveBeenCalledWith('idea-sparked', {
      relations: { projects: ['project-completed', 'project-active'], pages: ['topics/sd'] },
    })
    api.update.mockClear()
    await act(async () => { detail.querySelector<HTMLElement>('[data-relations="pages"] .rx')!.click() })
    expect(api.update).toHaveBeenCalledWith('idea-sparked', { relations: { projects: ['project-completed'], pages: [] } })
  })

  it('agent 挂的候选节点在科研节点一节，确认放进来源项目的那个节点，忽略只去掉候选；没有候选时没有这一节', async () => {
    api.details['project-active'] = {
      id: 'project-active', graph: { nodes: [{ id: 'node-1', label: '动态树宽', state: 'act', x: 0, y: 0, width: 100, writebacks: [] }], edges: [] },
    }
    const detail = await openWith({
      ...OWN, id: 'idea-agent', title: 'agent 记下的想法', sourceProject: 'project-active', candidateNode: 'node-1',
      source: { chatTitle: '树宽讨论', agent: true },
    })
    const heading = [...detail.querySelectorAll<HTMLElement>('.section-heading')].find((item) => item.firstChild!.textContent === '科研节点')!
    expect([...heading.querySelectorAll('.section-heading-actions .btn')].map((button) => button.textContent)).toEqual(['忽略', '确认'])
    expect(heading.nextElementSibling!.textContent).toBe('动态树宽agent')
    expect(detail.querySelector('.idea-panel-source')!.textContent).toBe('推测解码 · 树宽讨论')
    const action = (label: string) => [...heading.querySelectorAll<HTMLButtonElement>('.btn')].find((button) => button.textContent === label)!
    await act(async () => { action('确认').click() })
    expect(api.place).toHaveBeenLastCalledWith('idea-agent', { kind: 'confirm' })
    await act(async () => { action('忽略').click() })
    expect(api.place).toHaveBeenLastCalledWith('idea-agent', { kind: 'dismiss' })

    await act(async () => { host.querySelector<HTMLElement>('[data-idea="idea-linked"]')!.click() })
    expect([...host.querySelectorAll('.idea-detail-panel .section-heading')].map((item) => item.firstChild!.textContent)).not.toContain('科研节点')
  })

  it('论文对话的标题就是论文名时，来源只写一次', async () => {
    const detail = await openWith({
      ...OWN, id: 'idea-paper', source: { chatId: 'chat-9', chatTitle: 'EAGLE', paperId: 'paper-9', paperTitle: 'EAGLE' },
    })
    expect(detail.querySelector('.idea-panel-source')!.textContent).toBe('EAGLE')
  })
})
