// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { WikiProposal } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ReviewQueue } from './ReviewQueue.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const RECEIVED = new Date(2026, 8, 22, 8).getTime()
const WIDE = { kind: 'experiment' as const, project: 'draft', node: 'wide' }
const EAGLE = { kind: 'source' as const, paper: 'papers/eagle', page: 7, quote: 'wide trees amortize' }

const proposal = (id: string, over: Partial<WikiProposal> = {}): WikiProposal => ({
  id, digest: '0000000000000000', received: RECEIVED, path: 'review', status: 'queued', reason: null, decided: null,
  change: null, notice: null, staleNow: false, pages: ['topics/sd'],
  titles: {
    'topics/sd': 'Speculative decoding', 'topics/other': 'Tree attention', 'papers/eagle': 'EAGLE-2',
    'projects/draft': 'draft 效率', 'projects/draft#wide': '加宽实验', 'projects/draft#seed': '换种子重跑',
  },
  claimTexts: { 'topics/sd#knee': '拐点在宽度 6', 'topics/other#tree': '树注意力省显存' },
  proposal: {
    protocol: 1, key: id, producer: { kind: 'ai', id: 'skill.meridian' }, trigger: { kind: 'experiment', project: 'draft', node: 'wide' },
    title: `提案 ${id}`, base: {},
    ops: [{ op: 'addClaim', page: 'topics/sd', claim: { id: 'wide', text: '新结论', evidence: [WIDE] } }],
  },
  ...over,
})

const PROPOSALS: WikiProposal[] = [
  proposal('p1', { pages: ['topics/sd', 'topics/other'], proposal: { ...proposal('p1').proposal!, rationale: '重跑了一遍', ops: [
    { op: 'addClaim', page: 'topics/sd', claim: { id: 'wide', text: '新结论', evidence: [WIDE, EAGLE] } },
    { op: 'reviseClaim', page: 'topics/sd', claim: 'knee', text: '拐点在宽度 8', evidence: [WIDE] },
    { op: 'addEvidence', page: 'topics/sd', claim: 'knee', evidence: [EAGLE] },
    { op: 'markConflict', page: 'topics/sd', claim: 'knee', conflict: { id: 'b', against: { kind: 'claim', ref: 'topics/other#tree' }, note: '批量下不同' } },
    { op: 'resolveConflict', page: 'topics/sd', claim: 'knee', conflict: 'b', outcome: 'dismissed', note: '场景不同' },
    { op: 'retractClaim', page: 'topics/sd', claim: 'knee', reason: '重跑后不成立' },
  ] } }),
  proposal('p2', { staleNow: true, stalePage: 'topics/sd', notice: '这些引句没有文字层可核对：papers/eagle p.1' }),
  proposal('p3', { status: 'applied', decided: { at: RECEIVED, by: '我' }, change: 'change-9' }),
  proposal('p4', {
    status: 'rejected', reason: { kind: 'stale', message: '提案过期:topics/sd' }, decided: { at: RECEIVED, by: 'policy' },
    proposal: { ...proposal('p4').proposal!, ops: [
      { op: 'retractClaim', page: 'topics/sd', claim: 'knee', reason: '重跑后不成立' },
    ] },
  }),
  { ...proposal('p5', { status: 'rejected', reason: { kind: 'invalid', message: 'x.json:提案的格式不对' } }), proposal: null, pages: [], titles: {}, claimTexts: {} },
  proposal('p6', { unverified: ['projects/draft#wide'] }),
  proposal('p7', { pages: ['topics/sd', 'papers/flux'], titles: { 'topics/sd': 'Speculative decoding', 'papers/flux': '\\textbf{F}lux' }, proposal: {
    ...proposal('p7').proposal!, title: '收进《\\textbf{F}lux》',
    ops: [{ op: 'addEvidence', page: 'topics/sd', claim: 'knee', evidence: [{ kind: 'source', paper: 'papers/flux', page: 2, quote: 'q' }] }],
  } }),
  proposal('p8', {
    status: 'rejected', reason: { kind: 'invalid', message: 'agent 只能提交结论相关的提案' }, decided: { at: RECEIVED, by: 'policy' },
    pages: ['topics/new', 'papers/eagle', 'topics/sd'],
    titles: {
      'topics/sd': 'Speculative decoding', 'topics/old': '旧主题', 'papers/eagle': 'EAGLE-2', 'topics/sd#speedup': '加速比', topic: '主题',
    },
    proposal: { ...proposal('p8').proposal!, ops: [
      {
        op: 'createAggregation', kind: 'topic', id: 'topics/new', title: '新主题', parents: ['topics/sd'],
        columns: [{ key: 'speedup', label: '加速比' }], describe: '先猜后验', splitOn: '草稿来源',
      },
      { op: 'setMembership', paper: 'papers/eagle', in: 'topics/sd', cells: { speedup: { value: '3×', page: 2, quote: 'three times faster' } } },
      { op: 'removeMembership', paper: 'papers/eagle', in: 'topics/old' },
      { op: 'appendEntry', page: 'topics/sd', section: '实验', date: '2026-09-20', text: '13B 上复现' },
      { op: 'setColumns', page: 'topics/sd', columns: [{ key: 'speedup', label: '加速比' }, { key: 'draft', label: '草稿来源' }] },
      { op: 'setParents', page: 'topics/sd', parents: [] },
      { op: 'setAggregationMetadata', page: 'topics/sd', title: '推测解码', splitOn: null },
    ] },
  }),
  proposal('p9', { proposal: { ...proposal('p9').proposal!, trigger: { kind: 'experiment', project: 'draft', node: 'seed' } } }),
  proposal('p10', { proposal: { ...proposal('p10').proposal!, ops: [{ op: 'retractClaim', page: 'topics/sd', claim: 'knee', reason: '不成立' }] } }),
]

describe('ReviewQueue', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  const onApply = vi.fn()
  const onDecline = vi.fn()
  const links = { openPage: vi.fn(), openProject: vi.fn(), openReader: vi.fn() }
  const onOpenConclusion = vi.fn()

  const render = (proposals: WikiProposal[]) => act(() => root!.render(
    <MessagesProvider>
      <ReviewQueue proposals={proposals} pending={false} onApply={onApply} onDecline={onDecline} links={links} onOpenConclusion={onOpenConclusion} />
    </MessagesProvider>,
  ))

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    render(PROPOSALS)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const row = (id: string) => host.querySelector<HTMLElement>(`[data-proposal="${id}"]`)!
  const apply = (id: string) => [...row(id).querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '应用')!
  /** What sits in the row of a queued proposal's apply button, in order. */
  const decision = (id: string) => [...apply(id).parentElement!.children] as HTMLElement[]
  /** What the last line of a decided proposal shows, in order. */
  const outcome = (id: string) => [...row(id).querySelector('.proposal-decision')!.children] as HTMLElement[]
  const text = (el: Element | null) => el?.textContent ?? null

  /** Each block of proposal `id`: its change type, its target, each text it writes with its role, and its labelled rows. */
  const blocks = (id: string) => [...row(id).querySelectorAll('.proposal-change')].map((block) => ({
    kind: text(block.querySelector('.proposal-where > .tag')),
    target: text(block.querySelector('.proposal-target')),
    texts: [...block.querySelectorAll('.proposal-text')].map((t) => `${t.className.split('--')[1]}: ${t.textContent}`),
    rows: [...block.querySelectorAll('.proposal-row')]
      .map((r) => [text(r.querySelector('dt')), text(r.querySelector('.proposal-value')), text(r.querySelector('.proposal-quote'))]),
  }))

  it('一条改动一块:改动类型、它写入的页、写入的内容(修订先列淡掉的原文、撤回列要撤的结论),再是依据;结论的六种改动各有一块', () => {
    expect(blocks('p1')).toEqual([
      { kind: '添加结论', target: 'Speculative decoding', texts: ['new: 新结论'], rows: [
        ['实验结论', 'draft 效率›加宽实验已验证', null], ['原文', 'EAGLE-2 · p.7', 'wide trees amortize'],
      ] },
      { kind: '修订结论', target: 'Speculative decoding', texts: ['removed: 拐点在宽度 6', 'new: 拐点在宽度 8'], rows: [
        ['实验结论', 'draft 效率›加宽实验已验证', null],
      ] },
      { kind: '补充依据', target: 'Speculative decoding', texts: ['context: 拐点在宽度 6'], rows: [['原文', 'EAGLE-2 · p.7', 'wide trees amortize']] },
      { kind: '标记冲突', target: 'Speculative decoding', texts: ['context: 拐点在宽度 6'], rows: [
        ['说明', '批量下不同', null], ['冲突', 'Tree attention', '树注意力省显存'],
      ] },
      { kind: '处理冲突', target: 'Speculative decoding', texts: ['context: 拐点在宽度 6'], rows: [['处理结果', '不算冲突', '场景不同']] },
      { kind: '撤回结论', target: 'Speculative decoding', texts: ['removed: 拐点在宽度 6'], rows: [['撤回理由', '重跑后不成立', null]] },
    ])
    expect(row('p1').querySelectorAll('.diff')).toHaveLength(0)
    expect(row('p1').textContent).not.toContain('提案 p1')
  })

  it('依据那一组行前面有看得见的「依据」,它就是那组行的名字;没有依据的改动没有这一行', () => {
    const changes = [...row('p1').querySelectorAll('.proposal-change')]
    expect(changes.map((block) => [...block.querySelectorAll(':scope > .proposal-rows-label')].map((label) => label.textContent)))
      .toEqual([['依据'], ['依据'], ['依据'], ['依据'], [], []])
    const label = changes[0]!.querySelector(':scope > .proposal-rows-label')!
    expect(label.nextElementSibling!.getAttribute('aria-labelledby')).toBe(label.id)
    expect([...label.nextElementSibling!.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual(['实验结论', '原文'])
  })

  it('结论以外的改动也一种一块,写的是页名、论文名、列名和值,不写 id 和存的键', () => {
    expect(blocks('p8')).toEqual([
      { kind: '新建页', target: '新主题', texts: ['new: 先猜后验'], rows: [
        ['种类', '主题', null], ['上级', 'Speculative decoding', null], ['列', '加速比', null], ['细分依据', '草稿来源', null],
      ] },
      { kind: '归入', target: 'Speculative decoding', texts: [], rows: [['论文', 'EAGLE-2', null], ['加速比', '3× · p.2', 'three times faster']] },
      { kind: '移出', target: '旧主题', texts: [], rows: [['论文', 'EAGLE-2', null]] },
      { kind: '追加记录', target: 'Speculative decoding', texts: ['new: 13B 上复现'], rows: [['实验', '9月20日', null]] },
      { kind: '修改列', target: 'Speculative decoding', texts: [], rows: [['列', '加速比 · 草稿来源', null]] },
      { kind: '修改上级', target: 'Speculative decoding', texts: [], rows: [['上级', '暂无', null]] },
      { kind: '修改元数据', target: 'Speculative decoding', texts: [], rows: [['标题', '推测解码', null], ['细分依据', '暂无', null]] },
    ])
    expect(row('p8').textContent).not.toMatch(/topics\/|papers\/|speedup/)
  })

  it('第一行末尾是 agent 和收到的日期;卡片不拿提案标题当标题', () => {
    const first = row('p1').querySelector('.proposal-change')!
    expect(first.querySelector('.proposal-by .source-label')!.textContent).toBe('agent')
    expect(first.querySelector('.proposal-by')!.textContent).toBe('agent9月22日')
    expect(row('p1').querySelectorAll('.proposal-by')).toHaveLength(1)
    expect(row('p1').textContent).toContain('重跑了一遍')
    expect(host.querySelector('.review-title')).toBeNull()
  })

  it('依据里实验结论是项目 › 节点两个链接加验证状态,原文是论文 · 页码锚点,引句单独一行;点页名打开那一页', () => {
    const item = (named: string) => [...row('p1').querySelectorAll('dd, li')].find((el) => el.textContent!.includes(named))!
    const [experiment, source] = [item('加宽实验'), item('wide trees amortize')]
    const parts = [...experiment.querySelectorAll<HTMLButtonElement>('.entity-link')]
    expect(parts.map((link) => link.textContent)).toEqual(['draft 效率', '加宽实验'])
    const [project, node] = parts
    act(() => project!.click())
    expect(links.openProject).toHaveBeenCalledWith('draft')
    act(() => node!.click())
    expect(onOpenConclusion).toHaveBeenCalledWith('draft', 'wide')
    expect(experiment!.querySelector('.tag--good')!.textContent).toBe('已验证')
    expect(row('p6').querySelector('.proposal-row .tag--warn')!.textContent).toBe('未验证')
    expect(row('p3').querySelector('.proposal-row .tag')).toBeNull()
    const anchor = source!.querySelector<HTMLButtonElement>('.source-anchor')!
    expect([anchor.tagName, anchor.textContent]).toEqual(['BUTTON', 'p.7'])
    act(() => anchor.click())
    expect(links.openReader).toHaveBeenCalledWith('papers/eagle', { page: 7 })
    expect([...source!.children].map((part) => part.className)).toEqual(['proposal-value', 'proposal-quote'])
    act(() => row('p1').querySelector<HTMLButtonElement>('.proposal-target .entity-link')!.click())
    expect(links.openPage).toHaveBeenCalledWith('topics/sd')
  })

  it('原文依据和归入的格子里,「 · 」连同锚点是一段不断行的内容,紧贴论文名或格子的值', () => {
    const keeps = [...row('p1').querySelectorAll('.source-anchor'), ...row('p8').querySelectorAll('.source-anchor')]
      .map((anchor) => anchor.parentElement!)
    expect(keeps.map((keep) => [keep.className, keep.previousSibling?.textContent, keep.textContent])).toEqual([
      ['source-anchor-keep', 'EAGLE-2', ' · p.7'], ['source-anchor-keep', 'EAGLE-2', ' · p.7'], ['source-anchor-keep', '3×', ' · p.2'],
    ])
  })

  it('依据里的项目和节点与触发它的一样时不另写一行;不一样或改动没有依据时,项目 · 节点留作提出者的来由', () => {
    for (const id of ['p1', 'p6']) expect(row(id).textContent, id).not.toContain('项目 draft 效率 · 节点')
    expect(row('p1').querySelector('.proposal-context')!.textContent).toBe('重跑了一遍')
    expect(text(row('p9').querySelector('.proposal-context'))).toBe('项目 draft 效率 · 节点 换种子重跑')
    expect(text(row('p10').querySelector('.proposal-context'))).toBe('项目 draft 效率 · 节点 加宽实验')
  })

  it('应用按不了时,原因就在应用后面,点它去修:实验结论未验证 · 去验证打开那条实验结论,依据已变打开改过的页', () => {
    expect(decision('p6').map((part) => [part.tagName, part.textContent])).toEqual([
      ['BUTTON', '拒绝'], ['BUTTON', '应用'], ['BUTTON', '实验结论未验证 · 去验证'],
    ])
    expect(apply('p6').disabled).toBe(true)
    expect(decision('p6')[2]!.className).toBe('tag tag--label tag--warn')
    act(() => decision('p6')[2]!.click())
    expect(onOpenConclusion).toHaveBeenCalledWith('draft', 'wide')
    expect(decision('p2').map((part) => part.textContent)).toEqual(['拒绝', '应用', '依据已变'])
    expect(apply('p2').disabled).toBe(true)
    act(() => decision('p2')[2]!.click())
    expect(links.openPage).toHaveBeenCalledWith('topics/sd')
    expect(decision('p1').map((part) => part.textContent)).toEqual(['拒绝', '应用'])
    expect(apply('p1').disabled).toBe(false)
    for (const id of ['p2', 'p6']) expect(row(id).querySelector('.proposal-where .tag--warn'), id).toBeNull()
  })

  it('「涉及」只列各块写入的页以外的页,没有这样的页就不出这一行', () => {
    const others = (id: string) => [...row(id).querySelectorAll(':scope .proposal-card > .proposal-rows .proposal-row')]
    expect(others('p2')).toHaveLength(0)
    expect(others('p1').map((r) => [text(r.querySelector('dt')), [...r.querySelectorAll('.entity-link')].map((l) => l.getAttribute('data-wk'))]))
      .toEqual([['涉及', ['topics/other']]])
    // A membership's paper shows in its block, so it is not listed again.
    expect(others('p8')).toHaveLength(0)
  })

  it('依据和涉及里的论文名都按 LaTeX 显示,引句照写', () => {
    expect(row('p7').querySelector('.proposal-card > .proposal-rows .entity-link')!.innerHTML).toBe('<strong>F</strong>lux')
    expect(row('p7').querySelector('.proposal-change .proposal-value')!.innerHTML).toContain('<strong>F</strong>lux')
    expect(row('p7').querySelector('.proposal-change .proposal-quote')!.textContent).toBe('q')
  })

  it('Core 写的提醒与拒收原因里的页 id 按页名显示、论文名按 LaTeX 显示，过期写成一个状态，用户自己写的拒绝原因照写', () => {
    const decided = { at: RECEIVED, by: '我' as const }
    const titles = { 'papers/flux': '\\textbf{F}lux', 'topics/sd': 'Speculative decoding' }
    render([
      proposal('n1', { titles, notice: '这些引句没有文字层可核对：papers/flux p.1' }),
      proposal('n2', { titles, status: 'rejected', reason: { kind: 'invalid', message: '引句在原文第 2 页找不到：papers/flux' }, decided }),
      proposal('n3', { titles, status: 'rejected', reason: { kind: 'declined', message: '差 ~5% papers/flux' }, decided }),
      proposal('n4', {
        titles, status: 'rejected', decided,
        reason: { kind: 'stale', message: '提案过期：topics/sd 在提案生成之后改过（提案依据 fm 0123456789abcdef / body 0123456789abcdef，现在 不存在），没有落盘。按现在的页重新生成。' },
      }),
      proposal('n5', { titles, status: 'rejected', reason: { kind: 'invalid', message: '提案没有给出它依据的页的版本：topics/sd' }, decided }),
    ])
    expect(row('n1').querySelector('.review-note--warn')!.innerHTML).toBe('这些引句没有文字层可核对：<strong>F</strong>lux p.1')
    expect(row('n2').querySelector('.review-reason')!.innerHTML).toBe('引句在原文第 2 页找不到：<strong>F</strong>lux')
    expect(row('n3').querySelector('.review-reason')!.textContent).toBe('差 ~5% papers/flux')
    expect(row('n4').querySelector('.review-reason')!.textContent).toBe('依据的页在提案生成之后改过')
    expect(row('n5').querySelector('.review-reason')!.textContent).toBe('提案没有给出它依据的页的版本：Speculative decoding')
  })

  it('应用直接交给调用方;拒绝先填可选的原因再确认', () => {
    act(() => apply('p1').click())
    expect(onApply).toHaveBeenCalledWith(PROPOSALS[0])
    const decline = decision('p2').find((b) => b.textContent === '拒绝')!
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

  it('拒绝在前、应用在后；第一条能应用的提案的应用是主按钮，其余的应用是次要按钮；拒绝是红色的幽灵按钮，确认拒绝是浅红按钮', () => {
    expect(['p1', 'p2', 'p6', 'p7'].map((id) => apply(id).className)).toEqual(['btn pri', 'btn', 'btn', 'btn'])
    const actions = decision('p2').filter((part) => part.classList.contains('btn'))
    expect(actions.map((b) => `${b.textContent} ${b.className}`)).toEqual(['拒绝 btn ghost danger', '应用 btn'])
    act(() => actions[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
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
    const decline = decision('p1').find((b) => b.textContent === '拒绝')!
    decline.getBoundingClientRect = () => ({ x: 318, y: 305, left: 318, top: 305, right: 370, bottom: 335, width: 52, height: 30, toJSON: () => ({}) })
    await act(async () => { decline.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(document.querySelector<HTMLElement>('[data-radix-popper-content-wrapper]')!.style.transform).toBe('translate(318px, 339px)')
  })

  it('已处理的在自己的小标题下列出,同样一块一块,淡下去,末行是结果、处理的日期和原因', () => {
    expect(host.querySelector('.section-heading')!.textContent).toBe('已处理 · 4')
    expect(outcome('p3').map((part) => part.textContent)).toEqual(['已应用', '9月22日'])
    expect(row('p3').querySelector('.proposal-decision .tag--good')).not.toBeNull()
    expect(outcome('p4').map((part) => part.textContent)).toEqual(['已拒绝 · 过期', '9月22日', '依据的页在提案生成之后改过'])
    expect(blocks('p4')).toEqual([
      { kind: '撤回结论', target: 'Speculative decoding', texts: ['removed: 拐点在宽度 6'], rows: [['撤回理由', '重跑后不成立', null]] },
    ])
    expect(blocks('p5')).toEqual([{ kind: '读不了的提案', target: null, texts: [], rows: [] }])
    expect(outcome('p5')[0]!.textContent).toBe('已拒绝 · 无效')
    expect(row('p3').querySelectorAll('.proposal-decision button')).toHaveLength(0)
  })

  it('已处理的卡片淡下去;被拒绝的再把写入的内容划掉,应用了的不划', () => {
    expect(row('p3').querySelector('.proposal-card')!.className).toBe('proposal-card is-decided')
    for (const id of ['p4', 'p8']) expect(row(id).querySelector('.proposal-card')!.className, id).toBe('proposal-card is-decided is-declined')
    expect(row('p1').querySelector('.proposal-card')!.className).toBe('proposal-card')
  })

  it('收到和处理的日期按本地的那一天算，半夜前后的不会挪到前一天或后一天', () => {
    // Local times, so the case holds in any zone: just after midnight and just before the next one.
    const early = new Date(2026, 9, 16, 0, 30).getTime()
    const late = new Date(2026, 9, 17, 23, 30).getTime()
    render([proposal('q1', { received: early }), proposal('d1', { received: early, status: 'applied', decided: { at: late, by: '我' }, change: 'change-1' })])
    expect(row('q1').querySelector('.proposal-by')!.textContent).toBe('agent10月16日')
    expect(row('d1').querySelector('.proposal-by')!.textContent).toBe('agent10月16日')
    expect(outcome('d1').map((part) => part.textContent)).toEqual(['已应用', '10月17日'])
  })

  it('没有排队的提案时说一句', () => {
    render(PROPOSALS.filter((p) => p.status !== 'queued'))
    expect(host.textContent).toContain('还没有待审阅的提案')
  })
})
