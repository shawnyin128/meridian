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
  change: null, notice: null, staleNow: false, pages: ['topics/sd'],
  titles: { 'topics/sd': 'Speculative decoding', 'papers/eagle': 'EAGLE-2', 'projects/draft': 'draft 效率', 'projects/draft#wide': '加宽实验' },
  claimTexts: { 'topics/sd#knee': '拐点在宽度 6' },
  proposal: {
    protocol: 1, key: id, producer: { kind: 'ai', id: 'skill.meridian' }, trigger: { kind: 'experiment', project: 'draft', node: 'wide' },
    title: `提案 ${id}`, base: {},
    ops: [{ op: 'addClaim', page: 'topics/sd', claim: { id: 'wide', text: '新结论', evidence: [{ kind: 'experiment', project: 'draft', node: 'wide' }] } }],
  },
  ...over,
})

const PROPOSALS: WikiProposal[] = [
  proposal('p1', { proposal: { ...proposal('p1').proposal!, rationale: '重跑了一遍', ops: [
    { op: 'reviseClaim', page: 'topics/sd', claim: 'knee', text: '拐点在宽度 8' },
    { op: 'addEvidence', page: 'topics/sd', claim: 'knee', evidence: [{ kind: 'source', paper: 'papers/eagle', page: 7, quote: 'wide trees amortize' }] },
    { op: 'markConflict', page: 'topics/sd', claim: 'knee', conflict: { id: 'b', against: { kind: 'claim', ref: 'topics/gone#x' }, note: '批量下不同' } },
  ] } }),
  proposal('p2', { staleNow: true, notice: '这些引句没有文字层可核对:papers/x p.1' }),
  proposal('p3', { status: 'applied', decided: { at: RECEIVED, by: '我' }, change: 'change-9' }),
  proposal('p4', {
    status: 'rejected', reason: { kind: 'stale', message: '提案过期:topics/sd' }, decided: { at: RECEIVED, by: 'policy' },
    proposal: { ...proposal('p4').proposal!, ops: [
      { op: 'resolveConflict', page: 'topics/sd', claim: 'knee', conflict: 'b', outcome: 'dismissed', note: '场景不同' },
      { op: 'retractClaim', page: 'topics/sd', claim: 'knee', reason: '重跑后不成立' },
    ] },
  }),
  { ...proposal('p5', { status: 'rejected', reason: { kind: 'invalid', message: 'x.json:提案的格式不对' } }), proposal: null, pages: [], titles: {}, claimTexts: {} },
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

  it('排队的一条一行:标题、提出者与触发的项目节点名、理由、按结论原文写的改动行、涉及的页名;过期与无法核对的引句标出来', () => {
    expect(row('p1').querySelector('.review-title')!.textContent).toBe('提案 p1')
    expect(row('p1').querySelector('.review-meta')!.textContent).toBe('skill.meridian · 项目 draft 效率 · 节点 加宽实验 · 9月22日')
    expect(row('p1').textContent).toContain('重跑了一遍')
    expect([...row('p1').querySelectorAll('.diff div')].map((d) => d.textContent)).toEqual([
      '- 原来：拐点在宽度 6', '+ 改为：拐点在宽度 8',
      '+ 给「拐点在宽度 6」补证据', '+ 　证据 · EAGLE-2 p.7「wide trees amortize」',
      '~ 「拐点在宽度 6」与「x」冲突：批量下不同',
    ])
    expect([...row('p2').querySelectorAll('.diff div')].map((d) => d.textContent)).toEqual(['+ 新增结论：新结论', '+ 　实验 · draft 效率 · 加宽实验'])
    expect(row('p1').querySelector('.stag')).toBeNull()
    expect(row('p2').querySelector('.stag.pend')!.textContent).toBe('已过期')
    expect(row('p2').textContent).toContain('这些引句没有文字层可核对')
    expect(row('p1').querySelector<HTMLButtonElement>('.review-actions .btn.pri')!.disabled).toBe(false)
    expect(row('p2').querySelector<HTMLButtonElement>('.review-actions .btn.pri')!.disabled).toBe(true)
    const chip = row('p1').querySelector<HTMLElement>('.wkrel .tagchip')!
    expect(chip.textContent).toBe('Speculative decoding')
    act(() => chip.click())
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

  it('已处理的在自己的小标题下列出,各带结果', () => {
    expect(host.querySelector('.section-heading')!.textContent).toBe('已处理 · 3')
    expect(row('p3').querySelector('.stag.ok')!.textContent).toBe('已应用')
    expect(row('p4').querySelector('.stag.mut')!.textContent).toBe('已拒绝 · 过期')
    expect(row('p4').textContent).toContain('提案过期:topics/sd')
    expect([...row('p4').querySelectorAll('.diff div')].map((d) => d.textContent)).toEqual([
      '~ 「拐点在宽度 6」的冲突：不算冲突（场景不同）', '- 撤回「拐点在宽度 6」：重跑后不成立',
    ])
    expect(row('p5').querySelector('.review-title')!.textContent).toBe('读不了的提案')
    expect(row('p5').querySelector('.stag')!.textContent).toBe('已拒绝 · 无效')
    expect(row('p5').querySelector('.diff')).toBeNull()
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
