// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Watch } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

const api = vi.hoisted(() => ({
  watches: [
    { id: 'topic-1', type: 'topic', name: 'speculative decoding', active: false },
    {
      id: 'author-1', type: 'author', name: 'Song Han', active: true,
      identity: { source: 'semantic-scholar', id: '144128680', affiliations: ['MIT'] },
    },
    { id: 'author-2', type: 'author', name: 'Lee Chen', active: true },
  ] as Watch[],
  create: vi.fn(async () => {}),
  search: vi.fn(async (): Promise<unknown> => []),
  suggest: vi.fn(async (): Promise<unknown> => ({
    topics: [{ name: 'batch aware verification', relatedPapers: 3 }],
    authors: [{
      source: 'openalex', id: 'author-new', name: 'Ada Expert', affiliations: ['MIT'], relatedPapers: 2,
      paperCount: 120, citationCount: 8_000, hIndex: 42,
    }],
    paperCount: 8,
  })),
  update: vi.fn(async () => {}),
  setActive: vi.fn(async () => {}),
  projects: vi.fn(async (): Promise<unknown> => [{ id: 'project-1', name: 'Draft-tree serving' }]),
  /** What the next watch list read throws instead of answering. */
  listError: null as unknown,
  revision: 0,
}))

vi.mock('../ipc.js', () => ({
  author: { search: api.search },
  project: { list: api.projects },
  watch: {
    list: async () => {
      const thrown = api.listError
      api.listError = null
      if (thrown !== null) throw thrown
      return structuredClone(api.watches)
    },
    suggest: api.suggest,
    create: api.create,
    update: api.update,
    setActive: api.setActive,
    delete: vi.fn(async () => {}),
  },
}))
vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useVaultRevision: () => ({ revision: api.revision, bump: vi.fn() }),
}))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => work.then(() => true, () => false),
}))

const { WatchSettings } = await import('./Watches.js')

function enter(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** The button in `row` whose visible text or, for an icon button, accessible name is `label`. */
function button(row: Element, label: string): HTMLButtonElement {
  const found = [...row.querySelectorAll<HTMLButtonElement>('button')]
    .find((item) => item.textContent === label || item.getAttribute('aria-label') === label)
  if (found === undefined) throw new Error(`找不到按钮 ${label}`)
  return found
}

describe('WatchSettings', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    api.create.mockClear()
    api.search.mockClear()
    api.suggest.mockClear()
    api.update.mockClear()
    api.listError = null
    api.revision = 0
  })
  afterEach(() => { host.remove() })

  it('读关注失败时两组不再停在读取占位上，只写出原因', async () => {
    const root = createRoot(host)
    api.listError = new CallError('watch.list', 'newer-version')
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })
    expect([host.querySelector('.page-error')?.textContent, host.querySelectorAll('.loading-placeholder').length])
      .toEqual(['需要更新 App', 0])
    await act(async () => { root.unmount() })
  })

  it('读关注失败过一次，下一次读成功时原因收起，关注照常列出', async () => {
    const root = createRoot(host)
    const render = () => act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })
    api.listError = new CallError('watch.list', 'newer-version')
    await render()
    api.revision = 1
    await render()
    expect([host.querySelector('.page-error'), host.querySelectorAll('[data-w]').length]).toEqual([null, 3])
    await act(async () => { root.unmount() })
  })

  it('新建关注的输入行出现在该组最前,和新关注落下的位置一致', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const topicList = host.querySelector('[data-w="topic-1"]')!.closest('.wlist')!
    const add = topicList.previousElementSibling!.querySelector<HTMLButtonElement>('button')!
    await act(async () => { add.click() })
    expect(topicList.firstElementChild!.classList.contains('newrow')).toBe(true)

    await act(async () => { root.unmount() })
  })

  it('读不到时，原因落在共享的错误框里，和发现、API 一样与列表齐平', async () => {
    api.projects.mockRejectedValueOnce(new CallError('project.list', 'newer-version'))
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const alert = host.querySelector('.watch-settings [role="alert"]')
    expect([alert?.className, alert?.textContent]).toEqual(['inline-message inline-message--box inline-message--error page-error page-error--section', '需要更新 App'])

    await act(async () => { root.unmount() })
  })

  it('暂停与恢复是一个以关注名命名的开关，开着表示在抓取，名字不随状态翻转', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const row = host.querySelector('[data-w="topic-1"]')!
    expect([...row.querySelectorAll('button')].map((item) => item.textContent)).not.toContain('恢复')
    const toggle = row.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect([toggle.getAttribute('aria-label'), toggle.getAttribute('aria-checked')])
      .toEqual(['speculative decoding', 'false'])
    expect(host.querySelector('[data-w="author-1"] [role="switch"]')!.getAttribute('aria-checked')).toBe('true')
    await act(async () => { toggle.click() })
    expect(api.setActive).toHaveBeenCalledWith('topic-1', true)

    await act(async () => { root.unmount() })
  })

  it('编辑和移除是行尾操作槽里的图标钮，移除悬停时标红；开关留在槽外一直看得见', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const row = host.querySelector('[data-w="topic-1"]')!
    expect(row.hasAttribute('data-row-actions')).toBe(true)
    expect([...row.querySelectorAll('.row-actions button')].map((item) => [
      item.getAttribute('aria-label'), item.textContent, item.classList.contains('icbtn'), item.classList.contains('danger'),
    ])).toEqual([['编辑', '', true, false], ['移除', '', true, true]])
    expect(row.querySelector('.row-actions [role="switch"]')).toBeNull()
    expect(row.querySelector('[role="switch"]')).not.toBeNull()

    await act(async () => { root.unmount() })
  })

  it('已暂停和未确认是同一种状态标签，暂停用中性色，未确认用提醒色', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const label = (id: string) => host.querySelector<HTMLElement>(`[data-w="${id}"] .tag.tag--label`)
    expect([label('topic-1')?.textContent, label('topic-1')?.classList.contains('tag--neutral')]).toEqual(['已暂停', true])
    expect([label('author-2')?.textContent, label('author-2')?.classList.contains('tag--warning')]).toEqual(['未确认', true])
    expect(label('author-1')).toBeNull()

    await act(async () => { root.unmount() })
  })

  it('主题和作者都从原行进入编辑，并用原关注 id 保存', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const topic = host.querySelector('[data-w="topic-1"]')!
    await act(async () => { button(topic, '编辑').click() })
    const topicInput = host.querySelector<HTMLInputElement>('[data-w="topic-1"] input')!
    await act(async () => {
      enter(topicInput, 'draft tree decoding')
      topicInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(api.update).toHaveBeenCalledWith('topic-1', {
      type: 'topic', name: 'draft tree decoding',
    })

    const author = host.querySelector('[data-w="author-1"]')!
    await act(async () => { button(author, '编辑').click() })
    const authorInput = host.querySelector<HTMLInputElement>('[data-w="author-1"] input')!
    await act(async () => { enter(authorInput, 'Song Han Lab') })
    const save = host.querySelector<HTMLButtonElement>('.author-resolver-actions .btn')!
    await act(async () => { save.click() })
    expect(api.update).toHaveBeenCalledWith('author-1', {
      type: 'author', name: 'Song Han Lab',
    })

    await act(async () => { root.unmount() })
  })

  it('编辑中的关注没改名就点到别处，只收起，不写', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    for (const id of ['topic-1', 'author-1']) {
      await act(async () => { button(host.querySelector(`[data-w="${id}"]`)!, '编辑').click() })
      expect(host.querySelector(`[data-w="${id}"] input`)).not.toBeNull()
      await act(async () => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
      expect(host.querySelector(`[data-w="${id}"] input`)).toBeNull()
    }
    expect(api.update).not.toHaveBeenCalled()

    await act(async () => { root.unmount() })
  })

  it('作者占位打了名字、没选身份就点到别处：按名字存成待确认的作者', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })
    const authorList = host.querySelector('[data-w="author-1"]')!.closest('.wlist')!
    await act(async () => { authorList.previousElementSibling!.querySelector<HTMLButtonElement>('button')!.click() })

    await act(async () => { enter(authorList.querySelector<HTMLInputElement>('.newrow input')!, 'Ada Lovelace') })
    await act(async () => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
    expect(api.create).toHaveBeenCalledWith({ type: 'author', name: 'Ada Lovelace' })

    await act(async () => { root.unmount() })
  })

  it('主题占位打了字时点作者组的加号：先存下这个主题，再开作者占位', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })
    const topicList = host.querySelector('[data-w="topic-1"]')!.closest('.wlist')!
    const authorList = host.querySelector('[data-w="author-1"]')!.closest('.wlist')!
    await act(async () => { topicList.previousElementSibling!.querySelector<HTMLButtonElement>('button')!.click() })
    await act(async () => { enter(topicList.querySelector<HTMLInputElement>('.newrow input')!, 'speculative sampling') })

    await act(async () => { authorList.previousElementSibling!.querySelector<HTMLButtonElement>('button')!.click() })
    expect(api.create).toHaveBeenCalledWith({ type: 'topic', name: 'speculative sampling' })
    expect(topicList.querySelector('.newrow')).toBeNull()
    expect(authorList.querySelector<HTMLInputElement>('.newrow input')!.value).toBe('')

    await act(async () => { root.unmount() })
  })

  it('点作者组的加号时主题存被拒：主题占位带着字留着并标红，作者占位不开；再点别的关注的编辑也不换', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })
    const topicList = host.querySelector('[data-w="topic-1"]')!.closest('.wlist')!
    const authorList = host.querySelector('[data-w="author-1"]')!.closest('.wlist')!
    await act(async () => { topicList.previousElementSibling!.querySelector<HTMLButtonElement>('button')!.click() })
    const input = topicList.querySelector<HTMLInputElement>('.newrow input')!
    await act(async () => { enter(input, 'speculative sampling') })
    api.create.mockRejectedValueOnce(new Error('写不进去'))

    await act(async () => { authorList.previousElementSibling!.querySelector<HTMLButtonElement>('button')!.click() })
    expect(topicList.querySelector('.newrow input')).toBe(input)
    expect(input.value).toBe('speculative sampling')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(authorList.querySelector('.newrow')).toBeNull()

    await act(async () => { button(host.querySelector('[data-w="author-1"]')!, '编辑').click() })
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(topicList.querySelector('.newrow input')).toBe(input)
    expect(host.querySelector('[data-w="author-1"] input')).toBeNull()

    await act(async () => { root.unmount() })
  })

  it('从一句关注方向查找主题和稳定作者，确认后才创建关注', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const input = host.querySelector<HTMLInputElement>(
      'input[placeholder="研究方向"]',
    )!
    await act(async () => { enter(input, '我想关注批量推理中的动态验证策略') })
    const section = host.querySelector('.watch-suggestions')!
    expect(section.textContent).not.toContain('不调用模型')
    await act(async () => { button(section, '查找建议').click() })

    expect(api.suggest).toHaveBeenCalledWith({
      source: 'focus', focus: '我想关注批量推理中的动态验证策略',
    })
    expect(section.textContent).toContain('batch aware verification')
    expect(section.textContent).toContain('Ada Expert')
    expect(section.textContent).toContain('h-index 42')

    const topicRow = section.querySelectorAll('.watch-suggestion-row')[0]!
    await act(async () => { button(topicRow, '添加').click() })
    expect(api.create).toHaveBeenCalledWith({
      type: 'topic', name: 'batch aware verification',
    })

    const authorRow = [...section.querySelectorAll('.watch-suggestion-row')]
      .find((row) => row.textContent?.includes('Ada Expert'))!
    await act(async () => { button(authorRow, '添加').click() })
    expect(api.create).toHaveBeenCalledWith({
      type: 'author', name: 'Ada Expert',
      identity: { source: 'openalex', id: 'author-new', affiliations: ['MIT'] },
    })

    await act(async () => { root.unmount() })
  })

  it('每条建议的「＋ 添加」在那一行共享的行操作槽里,悬停或键盘落到那一行才露出,Tab 照样走得到;「添加全部关键词」一直露着', async () => {
    api.suggest.mockResolvedValueOnce({
      topics: [{ name: 'batch aware verification', relatedPapers: 3 }, { name: 'draft trees', relatedPapers: 2 }],
      authors: [{ name: 'Ada Expert', relatedPapers: 2 }],
      paperCount: 8,
    })
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })
    await act(async () => { enter(host.querySelector<HTMLInputElement>('input[placeholder="研究方向"]')!, '批量推理的动态验证') })
    const section = host.querySelector('.watch-suggestions')!
    await act(async () => { button(section, '查找建议').click() })

    const rows = [...section.querySelectorAll('.watch-suggestion-row')]
    expect(rows.map((row) => {
      const add = row.querySelector<HTMLButtonElement>('.add-action')!
      const slot = add.parentElement!
      return [row.hasAttribute('data-row-actions'), slot.classList.contains('row-actions'), slot.tabIndex, add.textContent]
    })).toEqual(rows.map(() => [true, true, 0, '添加']))
    for (const row of rows) {
      await act(async () => { row.querySelector<HTMLElement>('.row-actions')!.focus() })
      expect(document.activeElement).toBe(row.querySelector('.add-action'))
    }
    const addAll = button(section.querySelector('.section-heading--group .section-heading-actions')!, '添加全部关键词')
    expect([addAll.classList.contains('add-action'), addAll.closest('.row-actions')]).toEqual([true, null])

    await act(async () => { root.unmount() })
  })

  it('描述关注方向时输入法组字的回车不查找，组完字后的回车才查找', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const input = host.querySelector<HTMLInputElement>(
      'input[placeholder="研究方向"]',
    )!
    await act(async () => { enter(input, '批量推理的动态验证') })
    const pressEnter = (init: KeyboardEventInit) => act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init }))
    })
    await pressEnter({ isComposing: true })
    expect(api.suggest).not.toHaveBeenCalled()
    await pressEnter({})
    expect(api.suggest).toHaveBeenCalledExactlyOnceWith({ source: 'focus', focus: '批量推理的动态验证' })

    await act(async () => { root.unmount() })
  })

  it('作者搜索与关注建议失败时只显示失败原因', async () => {
    api.search.mockResolvedValueOnce({ kind: 'failed', reason: 'unavailable' })
    api.suggest.mockResolvedValueOnce({ kind: 'failed', reason: 'unknown' })
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })
    const authorList = host.querySelector('[data-w="author-1"]')!.closest('.wlist')!
    await act(async () => { authorList.previousElementSibling!.querySelector<HTMLButtonElement>('button')!.click() })
    await act(async () => { enter(authorList.querySelector<HTMLInputElement>('.newrow input')!, 'Ada Lovelace') })
    await act(async () => { await new Promise((done) => { setTimeout(done, 750) }) })
    expect(api.search).toHaveBeenCalledWith('Ada Lovelace')
    const searchError = host.querySelector('.author-search-note .inline-message--line.inline-message--error')!
    expect([searchError.getAttribute('role'), searchError.querySelector('.inline-message-text')?.textContent,
      searchError.querySelector('.inline-message-action')?.textContent]).toEqual(['alert', '搜索作者失败 · 网络不可用', '重试'])

    const section = host.querySelector('.watch-suggestions')!
    await act(async () => { enter(section.querySelector<HTMLInputElement>('input')!, '我想关注批量推理中的动态验证策略') })
    await act(async () => { button(section, '查找建议').click() })
    expect(section.querySelector('.watch-suggestion-error.inline-message--line.inline-message--error[role="alert"]')?.textContent)
      .toBe('生成关注建议失败')
    await act(async () => { root.unmount() })
  })

  it('没有 key 或被限流时作者搜索写 App 的标签，关注建议被限流也一样', async () => {
    api.search.mockResolvedValueOnce({ kind: 'failed', reason: 'no-key' })
    api.suggest.mockResolvedValueOnce({ kind: 'failed', reason: 'rate-limit' })
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })
    const authorList = host.querySelector('[data-w="author-1"]')!.closest('.wlist')!
    await act(async () => { authorList.previousElementSibling!.querySelector<HTMLButtonElement>('button')!.click() })
    await act(async () => { enter(authorList.querySelector<HTMLInputElement>('.newrow input')!, 'Ada Lovelace') })
    await act(async () => { await new Promise((done) => { setTimeout(done, 750) }) })
    expect(host.querySelector('.author-search-note .inline-message--error .inline-message-text')?.textContent)
      .toBe('搜索作者失败 · 没有 Semantic Scholar key')

    const section = host.querySelector('.watch-suggestions')!
    await act(async () => { enter(section.querySelector<HTMLInputElement>('input')!, '我想关注批量推理中的动态验证策略') })
    await act(async () => { button(section, '查找建议').click() })
    expect(section.querySelector('.watch-suggestion-error.inline-message--error')?.textContent).toBe('生成关注建议失败 · 正在限流')
    await act(async () => { root.unmount() })
  })

  it('可直接使用项目现有发现画像生成关注建议', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const section = host.querySelector('.watch-suggestions')!
    await act(async () => { button(section, '从项目生成').click() })
    await act(async () => { button(section, '查找建议').click() })
    expect(api.suggest).toHaveBeenCalledWith({ source: 'project', projectId: 'project-1' })

    await act(async () => { root.unmount() })
  })

  it('建议来源用共享的分段切换,切换后换成新来源的建议;离线时依据旁写一个短状态', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const section = host.querySelector('.watch-suggestions')!
    const sources = section.querySelector('.segmented-control[aria-label="建议来源"]')
    expect(sources).not.toBeNull()
    expect(button(sources!, '描述关注方向').getAttribute('aria-checked')).toBe('true')

    const input = section.querySelector<HTMLInputElement>(
      'input[placeholder="研究方向"]',
    )!
    await act(async () => { enter(input, '我想关注批量推理中的动态验证策略') })
    await act(async () => { button(section, '查找建议').click() })
    expect(section.textContent).toContain('batch aware verification')

    await act(async () => { button(sources!, '从项目生成').click() })
    expect(button(sources!, '从项目生成').getAttribute('aria-checked')).toBe('true')
    expect(button(sources!, '描述关注方向').getAttribute('aria-checked')).toBe('false')
    expect(section.textContent).not.toContain('batch aware verification')
    expect(section.querySelector('select')).toBeNull()
    expect(section.querySelector('button[aria-label="项目"]')!.textContent).toBe('Draft-tree serving')

    api.suggest.mockResolvedValueOnce({
      topics: [{ name: 'tree attention kernels', relatedPapers: 2 }], authors: [], paperCount: 4, stale: true,
    })
    await act(async () => { button(section, '查找建议').click() })
    expect(api.suggest).toHaveBeenLastCalledWith({ source: 'project', projectId: 'project-1' })
    expect(section.textContent).toContain('tree attention kernels')
    const basis = section.querySelector('.watch-suggestion-results > .grouped-list > .ph2')!
    expect([basis.firstChild?.textContent, basis.querySelector('.tag')?.textContent]).toEqual(['基于 4 篇相关论文', '离线 · 上次的建议'])

    await act(async () => { root.unmount() })
  })
})
