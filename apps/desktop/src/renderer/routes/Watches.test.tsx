// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Watch } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

const api = vi.hoisted(() => ({
  watches: [
    { id: 'topic-1', type: 'topic', name: 'speculative decoding', active: false },
    {
      id: 'author-1', type: 'author', name: 'Song Han', active: true,
      identity: { source: 'semantic-scholar', id: '144128680', affiliations: ['MIT'] },
    },
  ] as Watch[],
  create: vi.fn(async () => {}),
  suggest: vi.fn(async () => ({
    topics: [{ name: 'batch aware verification', relatedPapers: 3 }],
    authors: [{
      source: 'openalex', id: 'author-new', name: 'Ada Expert', affiliations: ['MIT'], relatedPapers: 2,
      paperCount: 120, citationCount: 8_000, hIndex: 42,
    }],
    paperCount: 8,
  })),
  update: vi.fn(async () => {}),
}))

vi.mock('../ipc.js', () => ({
  author: { search: vi.fn(async () => []) },
  project: {
    list: vi.fn(async () => [{ id: 'project-1', name: 'Draft-tree serving' }]),
  },
  watch: {
    list: async () => structuredClone(api.watches),
    suggest: api.suggest,
    create: api.create,
    update: api.update,
    setActive: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  },
}))
vi.mock('../shell/AppShell.js', () => ({
  useToast: () => vi.fn(),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

const { WatchSettings } = await import('./Watches.js')

function enter(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function button(row: Element, label: string): HTMLButtonElement {
  const found = [...row.querySelectorAll<HTMLButtonElement>('button')]
    .find((item) => item.textContent === label)
  if (found === undefined) throw new Error(`找不到按钮 ${label}`)
  return found
}

describe('WatchSettings', () => {
  let host: HTMLDivElement
  beforeEach(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    api.create.mockClear()
    api.suggest.mockClear()
    api.update.mockClear()
  })
  afterEach(() => { host.remove() })

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

  it('从一句关注方向查找主题和稳定作者，确认后才创建关注', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const input = host.querySelector<HTMLInputElement>(
      'input[placeholder="用一句话描述想持续关注的研究方向"]',
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

  it('可直接使用项目现有发现画像生成关注建议', async () => {
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><WatchSettings /></MessagesProvider>) })

    const section = host.querySelector('.watch-suggestions')!
    await act(async () => { button(section, '从项目生成').click() })
    await act(async () => { button(section, '查找建议').click() })
    expect(api.suggest).toHaveBeenCalledWith({ source: 'project', projectId: 'project-1' })

    await act(async () => { root.unmount() })
  })
})
