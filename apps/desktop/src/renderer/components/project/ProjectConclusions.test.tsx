// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectDetail } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  cards: vi.fn(() => Promise.resolve([
    { id: 'topics/sd', kind: 'topic', kindLabel: '主题', title: 'Speculative decoding', summary: '', updated: '2026-09-01', childCount: 0, memberCount: 0, parentCount: 0 },
    { id: 'methods/tree', kind: 'method', kindLabel: '方法', title: 'Tree drafting', summary: '', updated: '2026-09-01', childCount: 0, memberCount: 0, parentCount: 0 },
  ])),
  aggregation: vi.fn(() => Promise.resolve({ claims: [{ id: 'c1' }] })),
  apply: vi.fn(() => Promise.resolve()),
  write: vi.fn(async (op: Promise<unknown>) => { await op; return true }),
}))

vi.mock('../../ipc.js', () => ({ wiki: { cards: api.cards, aggregation: api.aggregation, apply: api.apply } }))
vi.mock('../../hooks/useVaultWrite.js', () => ({ useVaultWrite: () => api.write }))
vi.mock('../../shell/AppShell.js', () => ({ useToast: () => vi.fn() }))

const { ProjectConclusions } = await import('./ProjectConclusions.js')

const PROJECT = {
  id: 'draft', name: 'draft 效率',
  conclusionList: [
    { id: 'c1', text: '拐点是 batch size 的函数', state: 'verified', date: '2026-06-25', source: '手动添加' },
    { id: 'c2', text: '宽树在 B≥8 时仍然摊薄净赚', state: 'conflicting', date: '2026-08-14', source: '对话' },
    { id: 'c3', text: '已经写过的一条', state: 'verified', date: '2026-08-20', source: '手动添加' },
  ],
  conclusionClaims: { c3: ['topics/sd#written'] },
} as unknown as ProjectDetail

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

describe('ProjectConclusions', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  const onOpenPage = vi.fn()

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<MessagesProvider><ProjectConclusions project={PROJECT} onOpenPage={onOpenPage} /></MessagesProvider>))
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const row = (id: string) => host.querySelector<HTMLElement>(`[data-conclusion="${id}"]`)!

  it('只有已验证、还没写进 Wiki 的结论能写入;写过的链到那一页', () => {
    expect(host.querySelector('.section-heading')!.textContent).toBe('项目结论 · 3')
    expect(row('c1').querySelector('.project-conclusion-write')!.textContent).toBe('写入 Wiki')
    expect(row('c2').querySelector('.project-conclusion-write')).toBeNull()
    expect(row('c2').querySelector('.stag')!.textContent).toBe('有冲突')
    expect(row('c3').querySelector('.project-conclusion-write')).toBeNull()
    act(() => row('c3').querySelector<HTMLButtonElement>('.project-conclusion-written')!.click())
    expect(onOpenPage).toHaveBeenCalledWith('topics/sd')
  })

  it('写入:选一页、可改正文,以这条结论作实验证据写成一条结论', async () => {
    act(() => row('c1').querySelector<HTMLButtonElement>('.project-conclusion-write')!.click())
    const dialog = document.querySelector<HTMLElement>('.wiki-form')!
    const save = () => [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '保存')!
    expect(dialog.querySelector('textarea')!.value).toBe('拐点是 batch size 的函数')
    expect(save().disabled).toBe(true)
    await act(flush)
    const hit = [...document.querySelectorAll<HTMLLIElement>('.pickhits li')].find((li) => li.textContent?.startsWith('Speculative decoding'))!
    await act(async () => { hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await flush() })
    expect(dialog.querySelector('.wiki-form-picked')!.textContent).toBe('主题 · Speculative decoding')
    const text = dialog.querySelector('textarea')!
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(text, 'Knee depends on batch size')
      text.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { save().click(); await flush() })
    expect(api.aggregation).toHaveBeenCalledWith('topics/sd')
    expect(api.apply).toHaveBeenCalledWith({
      source: 'user', title: '把项目「draft 效率」的结论写入「Speculative decoding」',
      ops: [{
        op: 'addClaim', page: 'topics/sd',
        claim: { id: 'knee-depends-on-batch-size', text: 'Knee depends on batch size', evidence: [{ kind: 'experiment', project: 'draft', conclusion: 'c1' }] },
      }],
    })
    expect(document.querySelector('.wiki-form')).toBeNull()
  })

  it('项目没有结论时整节不出现', () => {
    act(() => root!.render(<MessagesProvider><ProjectConclusions project={{ ...PROJECT, conclusionList: [] }} onOpenPage={onOpenPage} /></MessagesProvider>))
    expect(host.textContent).toBe('')
  })
})
