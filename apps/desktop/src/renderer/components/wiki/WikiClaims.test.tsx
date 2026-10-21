// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProposalOp, WikiAggregation } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { TOOLTIP_DELAY } from '../Tooltip.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  listProjects: vi.fn(() => Promise.resolve([{ id: 'draft', name: 'draft 效率' }])),
  getProject: vi.fn(() => Promise.resolve({
    id: 'draft',
    projectConclusions: [
      { id: 't.wide', node: 't.wide', text: '宽树在 B≥8 时净赚', state: 'verified', tasks: [], experiments: [], wiki: [] },
      { id: 't.open', node: 't.open', text: '还没验证的一条', state: 'pending', tasks: [], experiments: [], wiki: [] },
      { id: 'c1', source: '手动添加', text: '拐点是 batch size 的函数', date: '2026-06-25', state: 'verified', tasks: [], experiments: [], wiki: [] },
    ],
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
        { evidence: { kind: 'experiment', project: 'draft', node: 'exp1', text: '单请求实测' }, added: '2026-06-09', by: '我', title: 'draft 效率', point: '单请求实验' },
        { evidence: { kind: 'source', paper: 'papers/eagle', page: 7, quote: 'wide trees amortize', highlight: 'h-3' }, added: '2026-09-14', by: 'ai:skill.meridian', title: 'EAGLE-2' },
      ],
      conflicts: [{ id: 'batch', against: { kind: 'claim', ref: 'topics/batch#wins' }, note: '批量下拐点后移', since: '2026-09-14', by: '我', title: '批量场景仍净赚' }],
      history: [{ version: 1, text: '树宽收益递减', since: '2026-05-02', by: '我' }],
    },
    {
      id: 'plain', text: '另一条结论', version: 1, since: '2026-09-01', by: 'ai:skill.meridian',
      evidence: [{ evidence: { kind: 'experiment', project: 'draft', node: 'exp2', text: '批量实测' }, added: '2026-09-01', by: 'ai:skill.meridian', title: 'draft 效率', point: '批量实验' }],
      conflicts: [], history: [],
    },
  ],
} as WikiAggregation

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
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
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
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
  /** The form drafted in place, which stands where its change lands. */
  const draft = () => host.querySelector<HTMLElement>('.draft-form')
  /** The button labelled `label` in `area`. */
  const button = (area: HTMLElement, label: string) => [...area.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!
  const save = () => button(draft()!, '保存')
  const press = (target: Element, init: KeyboardEventInit) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  }
  const expectNoDialog = () => expect(document.querySelector('[role="dialog"]')).toBeNull()
  /** Opens the `nth` picker of the open draft and returns the labels of its options. */
  const openPicker = async (nth: number) => {
    await act(async () => {
      draft()!.querySelectorAll('.choice-picker')[nth]!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
      await flush()
    })
    return [...document.querySelectorAll<HTMLElement>('.choice-picker-menu [role="menuitemradio"]')]
  }
  const choose = async (item: HTMLElement) => {
    await act(async () => {
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    })
  }
  /** Picks the option shown as `label` in the draft's `nth` picker. */
  const pick = async (nth: number, label: string) => {
    await choose((await openPicker(nth)).find((candidate) => candidate.textContent === label)!)
  }

  it('每条结论:正文、版本、日期,agent 写的跟一个 agent 标签;证据一行一条,实验证据写节点的名字;冲突只用一个警示色标签标出并链到另一边;版本史默认收起', () => {
    const knee = host.querySelector<HTMLElement>('[data-claim="knee"]')!
    expect(knee.querySelector('.wkclaim-text')!.textContent).toBe('拐点在宽度 6')
    expect(knee.querySelector('.wkclaim-meta')!.textContent).toBe('v26月9日')
    expect(knee.querySelector('.source-label')).toBeNull()
    expect(host.querySelector('[data-claim="plain"] .wkclaim-head .source-label')!.textContent).toBe('agent')
    expect([...knee.querySelectorAll('.wkclaim-evidence')].map((li) => li.textContent))
      .toEqual(['个人判断直觉', '实验draft 效率单请求实验单请求实测', '证据EAGLE-2 p.7wide trees amortize'])
    expect(knee.className).toBe(host.querySelector('[data-claim="plain"]')!.className)
    expect(knee.querySelector('.wkclaim-conflict')!.textContent).toBe('冲突批量场景仍净赚批量下拐点后移处理冲突')
    expect([...knee.querySelectorAll('.wkclaim-conflict .tag')].map((tag) => tag.className)).toEqual(['tag tag--label tag--warn'])
    expect(host.querySelector('[data-claim="plain"] .wkclaim-evidence')!.textContent).toBe('实验draft 效率批量实验批量实测')
    const history = knee.querySelector<HTMLButtonElement>('.wkclaim-history .card-tray-toggle')!
    expect(history.querySelector('.card-tray-chevron svg')).not.toBeNull()
    expect(history.getAttribute('aria-expanded')).toBe('false')
    act(() => history.click())
    expect(history.getAttribute('aria-expanded')).toBe('true')
    expect([...knee.querySelectorAll('.card-tray-reveal .diff div')].map((d) => d.textContent)).toEqual(['- v1 · 5月2日 · 树宽收益递减', '+ v2 · 6月9日 · 拐点在宽度 6'])
  })

  it('整条结论是它那个 … 所属的行:悬停或聚焦结论的任何一处都露出 …', () => {
    expect([...host.querySelectorAll('[data-claim]')].map((row) => [row.getAttribute('data-claim'), row.hasAttribute('data-row-actions')]))
      .toEqual([['knee', true], ['plain', true]])
  })

  it('实验证据打开项目,原文证据的锚点打开阅读器到那一页与高亮,冲突的另一边打开它所在的页', () => {
    const [experiment, source] = [...host.querySelectorAll<HTMLButtonElement>('[data-claim="knee"] .wkclaim-evidence button')]
    expect([experiment!.className, source!.className]).toEqual(['entity-link entity-link--project', 'entity-link source-anchor'])
    expect(source!.textContent).toBe('p.7')
    act(() => experiment!.click())
    expect(links.openProject).toHaveBeenCalledWith('draft')
    act(() => source!.click())
    expect(links.openReader).toHaveBeenCalledWith('papers/eagle', { page: 7, highlight: 'h-3' })
    act(() => host.querySelector<HTMLButtonElement>('[data-claim="knee"] .wkclaim-conflict .entity-link--page')!.click())
    expect(links.openPage).toHaveBeenCalledWith('topics/batch')
  })

  it('原文证据的锚点悬停或聚焦时在共享 tooltip 里显示它锚定的原文', () => {
    const anchor = host.querySelector<HTMLButtonElement>('[data-claim="knee"] .source-anchor')!
    const tip = () => document.querySelector('[role="tooltip"]')?.textContent ?? null
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      anchor.focus()
    })
    expect(tip()).toBe('“wide trees amortize”')
    act(() => anchor.blur())
    expect(tip()).toBeNull()
    vi.useFakeTimers()
    act(() => { anchor.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    vi.useRealTimers()
    expect(tip()).toBe('“wide trees amortize”')
  })

  it('带着要落到的结论打开时,把那条结论移到眼前;没带时不动', async () => {
    const shown: (string | undefined)[] = []
    // jsdom lays nothing out and has no scrollIntoView.
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) { shown.push(this.dataset.claim) }
    try {
      expect(shown).toEqual([])
      const claim = PAGE.claims[1]!.id
      await act(async () => {
        root!.render(<MessagesProvider><WikiClaims page={PAGE} pending={false} links={links} onApply={onApply} arrival={claim} /></MessagesProvider>)
      })
      expect(shown).toEqual([claim])
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    }
  })

  it('添加结论在结论区的最后一行打开草稿,新结论就落在那里;焦点在正文,不弹对话框', () => {
    act(() => host.querySelector<HTMLButtonElement>('.add-action')!.click())
    expectNoDialog()
    const rows = [...host.querySelectorAll<HTMLElement>('.wkclaims > .wkclaim')]
    expect(rows.map((row) => row.dataset.claim ?? 'draft')).toEqual(['knee', 'plain', 'draft'])
    expect(rows.at(-1)!.contains(draft())).toBe(true)
    expect(document.activeElement).toBe(draft()!.querySelector('input'))
  })

  it('一条结论都没有时,草稿取代空状态,站在结论区的第一行', async () => {
    await act(async () => {
      root!.render(<MessagesProvider><WikiClaims page={{ ...PAGE, claims: [] }} pending={false} links={links} onApply={onApply} /></MessagesProvider>)
    })
    act(() => host.querySelector<HTMLButtonElement>('.add-action')!.click())
    expect(host.textContent).not.toContain('还没有结论')
    expect(host.querySelector('.wkclaims > .wkclaim')!.contains(draft())).toBe(true)
  })

  it('添加结论:个人判断作依据,回车写入,id 由正文算出', async () => {
    act(() => host.querySelector<HTMLButtonElement>('.add-action')!.click())
    const [text, note] = [...draft()!.querySelectorAll('input')]
    act(() => setValue(text!, 'Wide trees win at B ≥ 8'))
    act(() => setValue(note!, '看过日志'))
    await act(async () => { press(note!, { key: 'Enter' }); await flush() })
    expect(onApply).toHaveBeenCalledWith('给「Speculative decoding」添加结论', [{
      op: 'addClaim', page: 'topics/sd',
      claim: { id: 'wide-trees-win-at-b-8', text: 'Wide trees win at B ≥ 8', evidence: [{ kind: 'personal', text: '看过日志' }] },
    }])
    expect(draft()).toBeNull()
  })

  it('添加结论:正文空着时回车不写,正文标成无效;Esc 收起草稿,什么也不写', async () => {
    act(() => host.querySelector<HTMLButtonElement>('.add-action')!.click())
    const text = draft()!.querySelector('input')!
    expect(save().disabled).toBe(true)
    await act(async () => { press(text, { key: 'Enter' }); await flush() })
    expect(onApply).not.toHaveBeenCalled()
    expect(text.getAttribute('aria-invalid')).toBe('true')
    act(() => setValue(text, '拐点后移'))
    expect(text.hasAttribute('aria-invalid')).toBe(false)
    act(() => press(text, { key: 'Escape' }))
    expect(draft()).toBeNull()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('添加结论:只能选已验证的项目结论作依据,节点结论引用节点,旧版结论引用结论 id', async () => {
    act(() => host.querySelector<HTMLButtonElement>('.add-action')!.click())
    await act(async () => { [...draft()!.querySelectorAll<HTMLButtonElement>('.segmented-control button')][1]!.click(); await flush() })
    await pick(0, 'draft 效率')
    const verified = await openPicker(1)
    expect(verified.map((item) => item.textContent)).toEqual(['宽树在 B≥8 时净赚', '拐点是 batch size 的函数'])
    await choose(verified[0]!)
    expectNoDialog()
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls[0]![1]).toEqual([{
      op: 'addClaim', page: 'topics/sd',
      claim: { id: 'b-8', text: '宽树在 B≥8 时净赚', evidence: [{ kind: 'experiment', project: 'draft', node: 't.wide' }] },
    }])
  })

  it('添加结论:选一条旧版项目结论作依据,正文先填成那条结论', async () => {
    act(() => host.querySelector<HTMLButtonElement>('.add-action')!.click())
    await act(async () => { [...draft()!.querySelectorAll<HTMLButtonElement>('.segmented-control button')][1]!.click(); await flush() })
    await pick(0, 'draft 效率')
    await pick(1, '拐点是 batch size 的函数')
    expect(draft()!.querySelector('input')!.value).toBe('拐点是 batch size 的函数')
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls[0]![1]).toEqual([{
      op: 'addClaim', page: 'topics/sd',
      claim: { id: 'batch-size', text: '拐点是 batch size 的函数', evidence: [{ kind: 'experiment', project: 'draft', conclusion: 'c1' }] },
    }])
  })

  it('修订在结论自己那一行就地改写:正文换成输入框,回车发一条 reviseClaim,不弹对话框', async () => {
    openMenu('plain')
    // The draft opens once the menu has handed focus back, which Radix does in a 0 ms timeout.
    await act(async () => { menuItem('修订').click(); await new Promise((done) => setTimeout(done, 0)) })
    expectNoDialog()
    const row = host.querySelector<HTMLElement>('[data-claim="plain"]')!
    expect(row.contains(draft())).toBe(true)
    expect(row.querySelector('.wkclaim-text')).toBeNull()
    const text = draft()!.querySelector('input')!
    expect([text.value, document.activeElement]).toEqual(['另一条结论', text])
    act(() => setValue(text, '另一条结论,改过'))
    await act(async () => { press(text, { key: 'Enter' }); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([{ op: 'reviseClaim', page: 'topics/sd', claim: 'plain', text: '另一条结论,改过' }])
    expect(draft()).toBeNull()
    expect(row.querySelector('.wkclaim-text')!.textContent).toBe('另一条结论')
  })

  it('标记冲突在那条结论下面就地打开草稿:与哪一条冲突、说明两栏,回车发一条 markConflict,不弹对话框', async () => {
    openMenu('plain')
    await act(async () => { menuItem('标记冲突').click(); await new Promise((done) => setTimeout(done, 0)) })
    expectNoDialog()
    const lines = host.querySelector<HTMLElement>('[data-claim="plain"] .wkclaim-lines')!
    expect(lines.lastElementChild!.contains(draft())).toBe(true)
    expect([...draft()!.querySelectorAll('.draft-form-label')].map((label) => label.textContent)).toEqual(['与哪一条冲突', '说明'])
    expect(document.activeElement).toBe(draft()!.querySelector('.choice-picker'))
    const note = draft()!.querySelector('input')!
    await act(async () => { press(note, { key: 'Enter' }); await flush() })
    expect(onApply).not.toHaveBeenCalled()
    expect(draft()!.querySelectorAll('[aria-invalid="true"]')).toHaveLength(2)
    await pick(0, '拐点在宽度 6')
    act(() => setValue(note, '说法相反'))
    await act(async () => { press(note, { key: 'Enter' }); await flush() })
    expect(onApply.mock.calls.at(-1)!.slice(1)).toEqual([[{
      op: 'markConflict', page: 'topics/sd', claim: 'plain',
      conflict: { id: 'k1', against: { kind: 'claim', ref: 'topics/sd#knee' }, note: '说法相反' },
    }]])
    expect(draft()).toBeNull()
  })

  it('撤回立刻发一条 retractClaim,不弹对话框也不问理由,写入后的通知能撤销', async () => {
    openMenu('plain')
    await act(async () => { menuItem('撤回').click(); await flush() })
    expectNoDialog()
    expect(draft()).toBeNull()
    expect(onApply.mock.calls).toEqual([[
      '撤回「Speculative decoding」的一条结论',
      [{ op: 'retractClaim', page: 'topics/sd', claim: 'plain', reason: '撤回' }],
      { undoable: true },
    ]])
  })

  it('处理冲突在那条冲突下面就地打开,不弹对话框;不算冲突只发一条,修订或撤回时与对应的 op 一起发', async () => {
    const resolve = () => act(() => host.querySelector<HTMLButtonElement>('.wkclaim-resolve')!.click())
    const done = { op: 'resolveConflict', page: 'topics/sd', claim: 'knee', conflict: 'batch', note: '场景不同' }
    const note = () => [...draft()!.querySelectorAll('input')].at(-1)!
    resolve()
    expectNoDialog()
    expect(host.querySelector('.wkclaim-conflict')!.nextElementSibling!.contains(draft())).toBe(true)
    act(() => setValue(note(), '场景不同'))
    await act(async () => { press(note(), { key: 'Enter' }); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([{ ...done, outcome: 'dismissed' }])
    expect(draft()).toBeNull()

    resolve()
    await pick(0, '修订这一条')
    const revised = draft()!.querySelector('input')!
    expect(revised.value).toBe('拐点在宽度 6')
    act(() => setValue(revised, '单请求下拐点在宽度 6'))
    act(() => setValue(note(), '场景不同'))
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([
      { op: 'reviseClaim', page: 'topics/sd', claim: 'knee', text: '单请求下拐点在宽度 6' }, { ...done, outcome: 'revised' },
    ])

    resolve()
    await pick(0, '撤回这一条')
    act(() => setValue(note(), '场景不同'))
    await act(async () => { save().click(); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([
      { ...done, outcome: 'retracted' }, { op: 'retractClaim', page: 'topics/sd', claim: 'knee', reason: '场景不同' },
    ])
  })

  it('拆出一条新结论:新结论的正文在处理冲突的草稿里写,标明它落到结论区,回车连同处理一起写入', async () => {
    act(() => host.querySelector<HTMLButtonElement>('.wkclaim-resolve')!.click())
    await pick(0, '拆出一条新结论')
    expectNoDialog()
    expect(draft()!.querySelector('.draft-form-destination')!.textContent).toBe('→结论')
    const [text, note] = [...draft()!.querySelectorAll('input')]
    act(() => setValue(text!, '批量下拐点后移'))
    act(() => setValue(note!, '场景不同'))
    await act(async () => { press(text!, { key: 'Enter' }); await flush() })
    expect(onApply.mock.calls.at(-1)![1]).toEqual([
      { op: 'addClaim', page: 'topics/sd', claim: { id: 'c1', text: '批量下拐点后移', evidence: [{ kind: 'personal', text: '场景不同' }] } },
      { op: 'resolveConflict', page: 'topics/sd', claim: 'knee', conflict: 'batch', outcome: 'split', note: '场景不同' },
    ])
  })

  it('换到另一页时,上一页的草稿不跟过去', async () => {
    act(() => host.querySelector<HTMLButtonElement>('.add-action')!.click())
    act(() => setValue(draft()!.querySelector('input')!, '只属于这一页'))
    await act(async () => {
      root!.render(<MessagesProvider><WikiClaims page={{ ...PAGE, id: 'topics/other', title: 'Other' }} pending={false} links={links} onApply={onApply} /></MessagesProvider>)
    })
    expect(draft()).toBeNull()
  })
})
