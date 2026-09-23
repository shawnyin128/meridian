// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WikiProposal } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ReviewEntry, ReviewQueue } from './ReviewQueue.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const RECEIVED = Date.parse('2026-09-22T08:00:00Z')

const proposal = (id: string, over: Partial<WikiProposal> = {}): WikiProposal => ({
  id, digest: '0000000000000000', received: RECEIVED, path: 'review', status: 'queued', reason: null, decided: null,
  change: null, notice: null, staleNow: false, ops: [`+ topics/sd#${id}:新结论`], pages: ['topics/sd'],
  proposal: {
    protocol: 1, key: id, producer: { kind: 'ai', id: 'skill.meridian' }, trigger: { kind: 'experiment', project: 'draft', node: 'wide' },
    title: `提案 ${id}`, base: {}, ops: [],
  },
  ...over,
})

const PROPOSALS: WikiProposal[] = [
  proposal('p1', { proposal: { ...proposal('p1').proposal!, rationale: '重跑了一遍' } }),
  proposal('p2', { staleNow: true, notice: '这些引句没有文字层可核对:papers/x p.1' }),
  proposal('p3', { status: 'applied', decided: { at: RECEIVED, by: '我' }, change: 'change-9' }),
  proposal('p4', { status: 'rejected', reason: { kind: 'stale', message: '提案过期:topics/sd' }, decided: { at: RECEIVED, by: 'policy' } }),
  { ...proposal('p5', { status: 'rejected', reason: { kind: 'invalid', message: 'x.json:提案的格式不对' } }), proposal: null, ops: [], pages: [] },
]

describe('ReviewQueue', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  const onApply = vi.fn()
  const onDecline = vi.fn()
  const onOpenPage = vi.fn()

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(
      <MessagesProvider>
        <ReviewQueue proposals={PROPOSALS} pending={false} onApply={onApply} onDecline={onDecline} onOpenPage={onOpenPage} />
      </MessagesProvider>,
    ))
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const row = (id: string) => host.querySelector<HTMLElement>(`[data-proposal="${id}"]`)!

  it('排队的一条一行:标题、提出者与触发的项目节点、理由、op 行、要改的页;过期与无法核对的引句标出来', () => {
    expect(row('p1').querySelector('.review-title')!.textContent).toBe('提案 p1')
    expect(row('p1').querySelector('.review-meta')!.textContent).toBe('skill.meridian · 项目 draft · 节点 wide · 9月22日')
    expect(row('p1').textContent).toContain('重跑了一遍')
    expect([...row('p1').querySelectorAll('.diff div')].map((d) => d.textContent)).toEqual(['+ topics/sd#p1:新结论'])
    expect(row('p1').querySelector('.review-tag')).toBeNull()
    expect(row('p2').querySelector('.review-tag--stale')!.textContent).toBe('已过期')
    expect(row('p2').textContent).toContain('这些引句没有文字层可核对')
    act(() => row('p1').querySelector<HTMLButtonElement>('.review-page')!.click())
    expect(onOpenPage).toHaveBeenCalledWith('topics/sd')
  })

  it('应用直接交给调用方;拒绝先填可选的原因再确认', () => {
    act(() => [...row('p1').querySelectorAll<HTMLButtonElement>('.review-actions button')].find((b) => b.textContent === '应用')!.click())
    expect(onApply).toHaveBeenCalledWith(PROPOSALS[0])
    const decline = [...row('p2').querySelectorAll<HTMLButtonElement>('.review-actions button')].find((b) => b.textContent === '拒绝')!
    act(() => decline.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const pop = document.querySelector<HTMLElement>('.review-decline')!
    const input = pop.querySelector('input')!
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, '  证据不够  ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => pop.querySelector<HTMLButtonElement>('button')!.click())
    expect(onDecline).toHaveBeenCalledWith(PROPOSALS[1], '证据不够')
  })

  it('已处理的收在下面,点开才列出,各带结果', () => {
    expect(row('p3')).toBeNull()
    act(() => host.querySelector<HTMLButtonElement>('.collapsible-group-toggle')!.click())
    expect(host.querySelector('.collapsible-group-count')!.textContent).toBe('3')
    expect(row('p3').querySelector('.review-tag')!.textContent).toBe('已应用')
    expect(row('p4').querySelector('.review-tag')!.textContent).toBe('已拒绝 · 过期')
    expect(row('p4').textContent).toContain('提案过期:topics/sd')
    expect(row('p5').querySelector('.review-title')!.textContent).toBe('读不了的提案')
    expect(row('p5').querySelector('.review-tag')!.textContent).toBe('已拒绝 · 无效')
  })

  it('没有排队的提案时说一句;入口上的数是排队的条数', () => {
    act(() => root!.render(
      <MessagesProvider>
        <ReviewEntry count={2} onOpen={() => {}} />
        <ReviewQueue proposals={PROPOSALS.slice(2)} pending={false} onApply={onApply} onDecline={onDecline} onOpenPage={onOpenPage} />
      </MessagesProvider>,
    ))
    expect(host.textContent).toContain('没有等你审阅的提案。')
    expect(host.querySelector('.review-entry')!.textContent).toBe('待审阅2')
  })
})
