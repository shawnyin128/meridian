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
  open: vi.fn(),
}))

vi.mock('../ipc.js', () => ({
  idea: {
    list: async () => structuredClone(api.ideas),
    update: api.update,
    promote: api.promote,
    delete: api.remove,
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

  afterEach(() => { act(() => root.unmount()) })

  it('卡片展示判断所需的摘要、项目、来源和时间，点击后在右侧编辑', async () => {
    await act(async () => { root.render(<MessagesProvider><Ideas /></MessagesProvider>) })
    expect(host.querySelector('.idea-detail-slot')?.getAttribute('data-panel-state')).toBe('closed')

    expect(host.textContent).toContain('用可学习性信号动态分配 draft model 的蒸馏预算')
    expect(host.textContent).toContain('进行中 · 2')
    expect(host.textContent).toContain('已归档 · 1')

    const linked = host.querySelector('[data-idea="idea-linked"]')!
    expect(linked.classList.contains('research-object-card')).toBe(true)
    expect(linked.textContent).toContain('项目 · 推测解码')
    expect(linked.textContent).toContain('只对 disagreement 高且可学习的 token 加大蒸馏权重。')
    expect(linked.textContent).toContain('对话')
    expect(linked.textContent).toContain('来源 · 摊薄的前提是共享前缀吗')
    expect(linked.textContent).toContain('9月17日 更新')
    expect([...linked.querySelectorAll('button')].map((item) => item.title)).toEqual(['更多'])

    const independent = host.querySelector('[data-idea="idea-independent"]')!
    expect(independent.textContent).toContain('未关联项目')
    expect(independent.textContent).toContain('论文阅读')
    expect(independent.textContent).toContain('来源 · 推测解码的可学习性 · 新方向')

    await act(async () => { (linked as HTMLElement).click() })
    expect(host.querySelector('.idea-detail-slot')?.getAttribute('data-panel-state')).toBe('open')
    const detail = host.querySelector('.idea-detail-panel')!
    expect(detail.textContent).toContain('只对 disagreement 高且可学习的 token 加大蒸馏权重。')
    const edit = [...detail.querySelectorAll<HTMLButtonElement>('button')]
      .find((item) => item.textContent === '编辑')!
    await act(async () => { edit.click() })
    expect(detail.querySelector('.idea-detail-editor')).not.toBeNull()
    expect(document.querySelector('.idea-dialog')).toBeNull()
    const cancel = [...detail.querySelectorAll<HTMLButtonElement>('button')]
      .find((item) => item.textContent === '取消')!
    await act(async () => { cancel.click() })

    const select = detail.querySelector<HTMLSelectElement>('select')!
    await act(async () => {
      select.value = ''
      select.dispatchEvent(new Event('change', { bubbles: true }))
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
})
