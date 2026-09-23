// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProposalOp, WikiAggregation } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  listProjects: vi.fn(() => Promise.resolve([{ id: 'draft', name: 'draft 效率' }])),
  getProject: vi.fn(() => Promise.resolve({
    id: 'draft', conclusionList: [{ id: 'c1', text: '拐点是 batch size 的函数', state: 'verified', date: '2026-06-25', source: '手动添加' }],
  })),
}))

vi.mock('../../ipc.js', () => ({ project: { list: api.listProjects, get: api.getProject } }))

const { WikiClaims } = await import('./WikiClaims.js')

const PAGE = {
  id: 'topics/sd', kind: 'topic', kindLabel: '主题', title: 'Speculative decoding', summary: '', updated: '2026-09-01',
  childCount: 0, memberCount: 0, parentCount: 0, parents: [], children: [], columns: [], derivedColumns: [], rows: [],
  related: [], body: '', titles: {}, version: { fm: '0000000000000000', body: '0000000000000000' },
  claims: [
    {
      id: 'knee', text: '拐点在宽度 6', version: 2, since: '2026-06-09', by: '我',
      evidence: [
        { evidence: { kind: 'personal', text: '直觉' }, added: '2026-05-02', by: '我' },
        { evidence: { kind: 'experiment', project: 'draft', node: 'exp1', text: '单请求实测' }, added: '2026-06-09', by: '我', title: 'draft 效率' },
        { evidence: { kind: 'source', paper: 'papers/eagle', page: 7, quote: 'wide trees amortize', highlight: 'h-3' }, added: '2026-09-14', by: 'ai:skill.meridian', title: 'EAGLE-2' },
      ],
      conflicts: [{ id: 'batch', against: { kind: 'claim', ref: 'topics/batch#wins' }, note: '批量下拐点后移', since: '2026-09-14', by: '我', title: '批量场景仍净赚' }],
      history: [{ version: 1, text: '树宽收益递减', since: '2026-05-02', by: '我' }],
    },
    {
      id: 'plain', text: '另一条结论', version: 1, since: '2026-09-01', by: 'ai:skill.meridian',
      evidence: [{ evidence: { kind: 'experiment', project: 'draft', node: 'exp2', text: '批量实测' }, added: '2026-09-01', by: 'ai:skill.meridian', title: 'draft 效率' }],
      conflicts: [], history: [],
    },
  ],
} as WikiAggregation

function setValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const prototype = input instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
    : input instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event(input instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve()
}

describe('WikiClaims', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  const onApply = vi.fn<(title: string, ops: ProposalOp[]) => Promise<boolean>>(() => Promise.resolve(true))
  const links = { openPage: vi.fn(), openProject: vi.fn(), openReader: vi.fn() }

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(<MessagesProvider><WikiClaims page={PAGE} pending={false} links={links} onApply={onApply} /></MessagesProvider>)
    })
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const openMenu = (claim: string) => act(() => {
    host.querySelector(`[data-claim="${claim}"] .dots`)!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  })
  const menuItem = (text: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent === text)!
  const dialog = () => document.querySelector<HTMLElement>('.wiki-form')!
  const save = () => [...dialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '保存')!

  it('每条结论:正文、版本、日期、谁写的;证据一行一条;冲突高亮并链到另一边;版本史默认收起', () => {
    const knee = host.querySelector<HTMLElement>('[data-claim="knee"]')!
    expect(knee.querySelector('.wkclaim-text')!.textContent).toBe('拐点在宽度 6')
    expect(knee.querySelector('.wkclaim-meta')!.textContent).toBe('v26月9日我')
    expect(host.querySelector('[data-claim="plain"] .wkclaim-by')!.textContent).toBe('agent')
    expect([...knee.querySelectorAll('.wkclaim-evidence')].map((li) => li.textContent))
      .toEqual(['个人判断直觉', '实验draft 效率exp1单请求实测', '证据EAGLE-2 p.7wide trees amortize'])
    expect(knee.classList.contains('wkclaim--conflict')).toBe(true)
    expect(host.querySelector('[data-claim="plain"]')!.classList.contains('wkclaim--conflict')).toBe(false)
    expect(knee.querySelector('.wkclaim-conflict')!.textContent).toBe('冲突批量场景仍净赚批量下拐点后移处理冲突')
    expect(host.querySelector('[data-claim="plain"] .wkclaim-evidence')!.textContent).toBe('实验draft 效率exp2批量实测')
    expect(knee.querySelector('.diff')).toBeNull()
    act(() => knee.querySelector<HTMLButtonElement>('.wkclaim-history')!.click())
    expect([...knee.querySelectorAll('.diff div')].map((d) => d.textContent)).toEqual(['- v1 · 5月2日 · 树宽收益递减', '+ v2 · 6月9日 · 拐点在宽度 6'])
  })

  it('实验证据打开项目,原文证据打开阅读器到那一页与高亮,冲突的另一边打开它所在的页', () => {
    const [experiment, source] = [...host.querySelectorAll<HTMLButtonElement>('[data-claim="knee"] .wkclaim-evidence .wkclaim-link')]
    act(() => experiment!.click())
    expect(links.openProject).toHaveBeenCalledWith('draft')
    act(() => source!.click())
    expect(links.openReader).toHaveBeenCalledWith('papers/eagle', { page: 7, highlight: 'h-3' })
    act(() => host.querySelector<HTMLButtonElement>('[data-claim="knee"] .wkclaim-conflict .wkclaim-link')!.click())
    expect(links.openPage).toHaveBeenCalledWith('topics/batch')
  })

  it('添加结论:个人判断作依据,id 由正文算出', async () => {
    act(() => host.querySelector<HTMLButtonElement>('.add-action')!.click())
    expect(save().disabled).toBe(true)
    act(() => setValue(dialog().querySelector('textarea')!, 'Wide trees win at B ≥ 8'))
    act(() => setValue(dialog().querySelector('input')!, '看过日志'))
    await act(async () => { save().click(); await flush() })
    expect(onApply).toHaveBeenCalledWith('给「Speculative decoding」添加结论', [{
      op: 'addClaim', page: 'topics/sd',
      claim: { id: 'wide-trees-win-at-b-8', text: 'Wide trees win at B ≥ 8', evidence: [{ kind: 'personal', text: '看过日志' }] },
    }])
    expect(document.querySelector('.wiki-form')).toBeNull()
  })

  it('添加结论:选一条项目结论作依据,正文先填成那条结论', async () => {
    act(() => host.querySelector<HTMLButtonElement>('.add-action')!.click())
    await act(async () => { [...dialog().querySelectorAll<HTMLButtonElement>('.segmented-control button')][1]!.click(); await flush() })
    await act(async () => { setValue(dialog().querySelector('select')!, 'draft'); await flush() })
    act(() => setValue(dialog().querySelectorAll('select')[1]!, 'c1'))
    expect(dialog().querySelector('textarea')!.value).toBe('拐点是 batch size 的函数')
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls[0]![1]).toEqual([{
      op: 'addClaim', page: 'topics/sd',
      claim: { id: 'batch-size', text: '拐点是 batch size 的函数', evidence: [{ kind: 'experiment', project: 'draft', conclusion: 'c1' }] },
    }])
  })

  it('修订、标记冲突、撤回各发一条对应的 op', async () => {
    openMenu('plain')
    act(() => menuItem('修订').click())
    act(() => setValue(dialog().querySelector('textarea')!, '另一条结论,改过'))
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([{ op: 'reviseClaim', page: 'topics/sd', claim: 'plain', text: '另一条结论,改过' }])

    openMenu('plain')
    act(() => menuItem('标记冲突').click())
    act(() => setValue(dialog().querySelector('select')!, 'knee'))
    act(() => setValue(dialog().querySelector('input')!, '说法相反'))
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([{
      op: 'markConflict', page: 'topics/sd', claim: 'plain',
      conflict: { id: 'k1', against: { kind: 'claim', ref: 'topics/sd#knee' }, note: '说法相反' },
    }])

    openMenu('plain')
    act(() => menuItem('撤回').click())
    act(() => setValue(dialog().querySelector('input')!, '不成立'))
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([{ op: 'retractClaim', page: 'topics/sd', claim: 'plain', reason: '不成立' }])
  })

  it('处理冲突:不算冲突只发一条;修订或撤回时与对应的 op 一起发', async () => {
    const resolve = () => act(() => host.querySelector<HTMLButtonElement>('.wkclaim-resolve')!.click())
    const done = { op: 'resolveConflict', page: 'topics/sd', claim: 'knee', conflict: 'batch', note: '场景不同' }
    resolve()
    act(() => setValue(dialog().querySelector('input')!, '场景不同'))
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([{ ...done, outcome: 'dismissed' }])

    resolve()
    act(() => setValue(dialog().querySelector('select')!, 'revised'))
    act(() => setValue(dialog().querySelector('textarea')!, '单请求下拐点在宽度 6'))
    act(() => setValue(dialog().querySelector('input')!, '场景不同'))
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([
      { op: 'reviseClaim', page: 'topics/sd', claim: 'knee', text: '单请求下拐点在宽度 6' }, { ...done, outcome: 'revised' },
    ])

    resolve()
    act(() => setValue(dialog().querySelector('select')!, 'retracted'))
    act(() => setValue(dialog().querySelector('input')!, '场景不同'))
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([
      { ...done, outcome: 'retracted' }, { op: 'retractClaim', page: 'topics/sd', claim: 'knee', reason: '场景不同' },
    ])
  })
})
