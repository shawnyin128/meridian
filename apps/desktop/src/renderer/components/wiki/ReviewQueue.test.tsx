// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { WikiProposal } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ReviewEntry, ReviewQueue } from './ReviewQueue.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const RECEIVED = new Date(2026, 8, 22, 8).getTime()

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
  proposal('p6', { unverified: ['projects/draft#wide'] }),
  proposal('p7', { pages: ['papers/flux'], titles: { 'papers/flux': '\\textbf{F}lux' }, proposal: {
    ...proposal('p7').proposal!, title: '收进《\\textbf{F}lux》',
    ops: [{ op: 'addEvidence', page: 'topics/sd', claim: 'knee', evidence: [{ kind: 'source', paper: 'papers/flux', page: 2, quote: 'q' }] }],
  } }),
]

describe('ReviewQueue', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  const onApply = vi.fn()
  const onDecline = vi.fn()
  const onOpenPage = vi.fn()
  const onOpenConclusion = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(
      <MessagesProvider>
        <ReviewQueue proposals={PROPOSALS} pending={false} onApply={onApply} onDecline={onDecline} onOpenPage={onOpenPage} onOpenConclusion={onOpenConclusion} />
      </MessagesProvider>,
    ))
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const row = (id: string) => host.querySelector<HTMLElement>(`[data-proposal="${id}"]`)!
  const apply = (id: string) => [...row(id).querySelectorAll<HTMLButtonElement>('.review-actions button')].find((b) => b.textContent === '应用')!

  it('排队的一条一行:标题、提出者与触发的项目节点名、理由、按结论原文写的改动行、涉及的页名;过期与无法核对的引句标出来', () => {
    expect(row('p1').querySelector('.review-title')!.textContent).toBe('提案 p1')
    expect(row('p1').querySelector('.review-meta')!.textContent).toBe('项目 draft 效率 · 节点 加宽实验 · 9月22日')
    expect(row('p1').querySelector('.review-head .source-label')!.textContent).toBe('agent')
    expect(row('p1').textContent).toContain('重跑了一遍')
    expect([...row('p1').querySelectorAll('.diff div')].map((d) => d.textContent)).toEqual([
      '- 原来：拐点在宽度 6', '+ 改为：拐点在宽度 8',
      '+ 给「拐点在宽度 6」补证据', '+ 　证据 · EAGLE-2 p.7「wide trees amortize」',
      '~ 「拐点在宽度 6」与「x」冲突：批量下不同',
    ])
    expect([...row('p2').querySelectorAll('.diff div')].map((d) => d.textContent)).toEqual(['+ 添加结论：新结论', '+ 　实验 · draft 效率 · 加宽实验'])
    expect(row('p1').querySelector('.review-head .tag:not(.source-label)')).toBeNull()
    expect(row('p2').querySelector('.tag--warn')!.textContent).toBe('依据已变')
    expect([...row('p2').querySelectorAll('.review-note--warn')].map((note) => note.textContent))
      .toEqual([expect.stringContaining('这些引句没有文字层可核对')])
    expect(apply('p1').disabled).toBe(false)
    expect(apply('p2').disabled).toBe(true)
    const chip = row('p1').querySelector<HTMLElement>('.wkrel .tagchip')!
    expect(chip.textContent).toBe('Speculative decoding')
    expect(chip.tagName).toBe('BUTTON')
    act(() => chip.click())
    expect(onOpenPage).toHaveBeenCalledWith('topics/sd')
  })

  it('提案标题、论文页名与改动行里的论文名都按 LaTeX 显示，引句照写', () => {
    expect(row('p7').querySelector('.review-title')!.innerHTML).toBe('收进《<strong>F</strong>lux》')
    expect(row('p7').querySelector('.wkrel .tagchip .tag-text')!.innerHTML).toBe('<strong>F</strong>lux')
    expect([...row('p7').querySelectorAll('.diff div')].map((d) => d.innerHTML)).toEqual([
      '+ 给「拐点在宽度 6」补证据', '+ 　证据 · <strong>F</strong>lux p.2「q」',
    ])
  })

  it('Core 写的提醒与拒收原因里的页 id 按页名显示、论文名按 LaTeX 显示，过期写成一个状态，用户自己写的拒绝原因照写', () => {
    const decided = { at: RECEIVED, by: '我' as const }
    const titles = { 'papers/flux': '\\textbf{F}lux', 'topics/sd': 'Speculative decoding' }
    act(() => root!.render(
      <MessagesProvider>
        <ReviewQueue
          proposals={[
            proposal('n1', { titles, notice: '这些引句没有文字层可核对：papers/flux p.1' }),
            proposal('n2', { titles, status: 'rejected', reason: { kind: 'invalid', message: '引句在原文第 2 页找不到：papers/flux' }, decided }),
            proposal('n3', { titles, status: 'rejected', reason: { kind: 'declined', message: '差 ~5% papers/flux' }, decided }),
            proposal('n4', {
              titles, status: 'rejected', decided,
              reason: { kind: 'stale', message: '提案过期：topics/sd 在提案生成之后改过（提案依据 fm 0123456789abcdef / body 0123456789abcdef，现在 不存在），没有落盘。按现在的页重新生成。' },
            }),
            proposal('n5', { titles, status: 'rejected', reason: { kind: 'invalid', message: '提案没有给出它依据的页的版本：topics/sd' }, decided }),
          ]}
          pending={false} onApply={onApply} onDecline={onDecline} onOpenPage={onOpenPage} onOpenConclusion={onOpenConclusion}
        />
      </MessagesProvider>,
    ))
    expect(row('n1').querySelector('.review-note--warn')!.innerHTML).toBe('这些引句没有文字层可核对：<strong>F</strong>lux p.1')
    expect(row('n2').querySelector('.review-note')!.innerHTML).toBe('引句在原文第 2 页找不到：<strong>F</strong>lux')
    expect(row('n3').querySelector('.review-note')!.textContent).toBe('差 ~5% papers/flux')
    expect(row('n4').querySelector('.review-note')!.textContent).toBe('依据的页在提案生成之后改过')
    expect(row('n5').querySelector('.review-note')!.textContent).toBe('提案没有给出它依据的页的版本：Speculative decoding')
  })

  it('引用了没验证的项目结论:标出结论未验证,不另写一句,应用按不了,点结论去验证它', () => {
    expect(row('p6').querySelector('.tag--warn')!.textContent).toBe('结论未验证')
    expect(row('p6').querySelector('.review-note--warn')).toBeNull()
    expect(apply('p6').disabled).toBe(true)
    const chip = row('p6').querySelector<HTMLElement>('.review-unverified .tagchip')!
    expect(chip.textContent).toBe('加宽实验')
    expect(chip.tagName).toBe('BUTTON')
    act(() => chip.click())
    expect(onOpenConclusion).toHaveBeenCalledWith('draft', 'wide')
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

  it('第一条能应用的提案的应用是主按钮，其余的应用是次要按钮；拒绝是红色的幽灵按钮，确认拒绝是浅红按钮', () => {
    expect(['p1', 'p2', 'p6', 'p7'].map((id) => apply(id).className)).toEqual(['btn pri', 'btn', 'btn', 'btn'])
    const actions = [...row('p2').querySelectorAll<HTMLButtonElement>('.review-actions button')]
    expect(actions.map((b) => `${b.textContent} ${b.className}`)).toEqual(['应用 btn', '拒绝 btn ghost danger'])
    act(() => actions[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(document.querySelector<HTMLButtonElement>('.review-decline button')!.className).toBe('btn danger')
  })

  it('拒绝的原因框从拒绝钮的左缘往右展开在它下方,不往左盖到侧栏上', async () => {
    // jsdom lays nothing out: give it the 1280×800 window, where the reject button spans x 318–370,
    // right of the 232px sidebar, and the 320px reason box.
    const html = document.documentElement
    const size = (prop: 'clientWidth' | 'clientHeight' | 'offsetWidth' | 'offsetHeight', of: (el: HTMLElement) => number) => {
      const spy = vi.spyOn(HTMLElement.prototype, prop, 'get').mockImplementation(function (this: HTMLElement) { return of(this) })
      onTestFinished(() => spy.mockRestore())
    }
    const isPopover = (el: HTMLElement) => el.hasAttribute('data-radix-popper-content-wrapper')
    size('clientWidth', (el) => (el === html ? 1280 : 0))
    size('clientHeight', (el) => (el === html ? 800 : 0))
    size('offsetWidth', (el) => (isPopover(el) ? 320 : 0))
    size('offsetHeight', (el) => (isPopover(el) ? 52 : 0))
    const decline = [...row('p1').querySelectorAll<HTMLButtonElement>('.review-actions button')].find((b) => b.textContent === '拒绝')!
    decline.getBoundingClientRect = () => ({ x: 318, y: 305, left: 318, top: 305, right: 370, bottom: 335, width: 52, height: 30, toJSON: () => ({}) })
    await act(async () => { decline.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(document.querySelector<HTMLElement>('[data-radix-popper-content-wrapper]')!.style.transform).toBe('translate(318px, 339px)')
  })

  it('已处理的在自己的小标题下列出,各带结果', () => {
    expect(host.querySelector('.section-heading')!.textContent).toBe('已处理 · 3')
    expect(row('p3').querySelector('.tag--good')!.textContent).toBe('已应用')
    expect(row('p4').querySelector('.tag--neutral')!.textContent).toBe('已拒绝 · 过期')
    expect(row('p4').querySelector('.review-note')!.textContent).toBe('依据的页在提案生成之后改过')
    expect([...row('p4').querySelectorAll('.diff div')].map((d) => d.textContent)).toEqual([
      '~ 「拐点在宽度 6」的冲突：不算冲突（场景不同）', '- 撤回「拐点在宽度 6」：重跑后不成立',
    ])
    expect(row('p5').querySelector('.review-title')!.textContent).toBe('读不了的提案')
    expect(row('p5').querySelector('.tag')!.textContent).toBe('已拒绝 · 无效')
    expect(row('p5').querySelector('.diff')).toBeNull()
  })

  it('被拒绝的提案的改动行淡下去并划掉，不再像应用了的那样标成增删；应用了的照旧', () => {
    const declined = proposal('p8', {
      status: 'rejected', reason: { kind: 'declined', message: '' }, decided: { at: RECEIVED, by: '我' },
    })
    act(() => root!.render(
      <MessagesProvider>
        <ReviewQueue proposals={[...PROPOSALS, declined]} pending={false} onApply={onApply} onDecline={onDecline} onOpenPage={onOpenPage} onOpenConclusion={onOpenConclusion} />
      </MessagesProvider>,
    ))
    for (const id of ['p4', 'p8']) {
      expect(row(id).querySelector('.diff')!.classList.contains('is-declined'), id).toBe(true)
      expect(row(id).querySelectorAll('.diff .add, .diff .del'), id).toHaveLength(0)
    }
    expect(row('p8').querySelector('.diff div')!.textContent).toMatch(/^\+ /)
    expect(row('p3').querySelector('.diff')!.classList.contains('is-declined')).toBe(false)
    expect(row('p3').querySelectorAll('.diff .add').length).toBeGreaterThan(0)
  })

  it('收到和处理的日期按本地的那一天算，半夜前后的不会挪到前一天或后一天', () => {
    // Local times, so the case holds in any zone: just after midnight and just before the next one.
    const early = new Date(2026, 9, 16, 0, 30).getTime()
    const late = new Date(2026, 9, 16, 23, 30).getTime()
    act(() => root!.render(
      <MessagesProvider>
        <ReviewQueue
          proposals={[proposal('q1', { received: early }), proposal('d1', { received: early, status: 'applied', decided: { at: late, by: '我' }, change: 'change-1' })]}
          pending={false} onApply={onApply} onDecline={onDecline} onOpenPage={onOpenPage} onOpenConclusion={onOpenConclusion}
        />
      </MessagesProvider>,
    ))
    expect(row('q1').querySelector('.review-meta')!.textContent).toBe('项目 draft 效率 · 节点 加宽实验 · 10月16日')
    expect(row('d1').querySelector('.review-meta')!.textContent).toBe('项目 draft 效率 · 节点 加宽实验 · 10月16日 → 10月16日')
    expect(row('d1').querySelector('.review-head .source-label')!.textContent).toBe('agent')
  })

  it('没有排队的提案时说一句;入口上的数是排队的条数', () => {
    act(() => root!.render(
      <MessagesProvider>
        <ReviewEntry count={2} onOpen={() => {}} />
        <ReviewQueue proposals={PROPOSALS.filter((p) => p.status !== 'queued')} pending={false} onApply={onApply} onDecline={onDecline} onOpenPage={onOpenPage} onOpenConclusion={onOpenConclusion} />
      </MessagesProvider>,
    ))
    expect(host.textContent).toContain('还没有待审阅的提案')
    expect(host.querySelector('.review-entry')!.textContent).toBe('待审阅2')
  })
})
