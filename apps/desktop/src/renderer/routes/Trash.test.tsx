// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrashEntry } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import { TOOLTIP_DELAY } from '../components/Tooltip.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  entries: [{
    id: 'trash-1', kind: 'paper', title: 'Draft trees', deletedAt: Date.parse('2026-08-25T00:00:00Z'),
    restorable: true,
  }, {
    id: 'trash-2', kind: 'paper', title: '\\textbf{F}luxBin -- $\\times$', deletedAt: Date.parse('2026-08-25T00:00:00Z'),
    restorable: true,
  }, {
    id: 'trash-3', kind: 'attachment', title: 'notes--v2.pdf', deletedAt: Date.parse('2026-08-25T00:00:00Z'),
    restorable: false,
  }, {
    id: 'trash-4', kind: 'attachment', title: 'MoE 路由用熵正则代替负载均衡 load balancing.pdf',
    deletedAt: Date.parse('2026-08-25T00:00:00Z'), restorable: true,
  }] as TrashEntry[],
  purge: vi.fn(async () => {}),
  notes: [] as unknown[],
  listError: null as unknown,
  revision: 0,
}))

vi.mock('../ipc.js', () => ({
  trash: {
    list: async () => {
      if (api.listError !== null) throw api.listError
      return structuredClone(api.entries)
    },
    restore: vi.fn(async () => {}),
    purge: api.purge,
    clear: vi.fn(async () => {}),
  },
}))
vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useToday: () => '2026-08-25',
  useVaultRevision: () => ({ revision: api.revision, bump: vi.fn() }),
}))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>, opts: { note?: unknown } = {}) => {
    await work
    api.notes.push(opts.note)
    return true
  },
}))

const { Trash } = await import('./Trash.js')

/** The button in `scope` whose visible text or, for an icon button, accessible name is `label`. */
function button(scope: ParentNode, label: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')]
    .find((item) => item.textContent === label || item.getAttribute('aria-label') === label)
  if (found === undefined) throw new Error(`找不到按钮 ${label}`)
  return found
}

/**
 * What a row shows about restoring it: whether its Restore is disabled, the tag on the row, and the
 * name and note of the tooltip the pointer opens on Restore, which is closed again afterwards.
 */
function restoreState(row: Element): [boolean, string | null, [string | null, string | null] | null] {
  const restore = button(row, '恢复')
  vi.useFakeTimers()
  try {
    act(() => { restore.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    const tip = document.querySelector('[role="tooltip"]')
    const shown = tip === null
      ? null
      : [tip.childNodes[0]?.textContent ?? null, tip.querySelector('.tooltip-note')?.textContent ?? null] as [string | null, string | null]
    act(() => {
      restore.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }))
      restore.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
    })
    act(() => { document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400, pointerType: 'mouse' })) })
    act(() => { vi.runAllTimers() })
    return [restore.disabled, row.querySelector('.tag')?.textContent ?? null, shown]
  } finally {
    vi.useRealTimers()
  }
}

describe('Trash', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // The page title measures whether it fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    api.purge.mockClear()
    api.notes.length = 0
    api.listError = null
    api.revision = 0
    root = createRoot(host)
    await act(async () => { root!.render(<MessagesProvider><Trash /></MessagesProvider>) })
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.unstubAllGlobals()
  })

  it('垃圾桶读不到时页上只有原因的标签，带路径的原话不上屏', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cases = [
      [new CallError('trash.list', 'newer-version'), '需要更新 App'],
      [new Error("EACCES: permission denied, open '/Users/me/vault/.meridian/trash.json'"), '出了点问题'],
    ] as const
    for (const [thrown, label] of cases) {
      api.listError = thrown
      act(() => root!.unmount())
      root = createRoot(host)
      await act(async () => { root!.render(<MessagesProvider><Trash /></MessagesProvider>) })
      expect(host.querySelector('.page-error')?.textContent).toBe(label)
      expect(host.textContent).not.toContain('/Users/me/vault')
    }
    vi.restoreAllMocks()
  })

  it('读垃圾桶失败过一次，下一次读取成功时错误横幅收起，条目照常列出', async () => {
    const reread = async (revision: number) => {
      api.revision = revision
      await act(async () => { root!.render(<MessagesProvider><Trash /></MessagesProvider>) })
    }
    api.listError = new CallError('trash.list', 'newer-version')
    await reread(1)
    expect(host.querySelector('.page-error')?.textContent).toBe('需要更新 App')

    api.listError = null
    await reread(2)
    expect([host.querySelector('.page-error'), host.querySelectorAll('.trow').length]).toEqual([null, 4])
  })

  it('每条只写还剩几天，几天后自动清除那句放进它的提示，页脚不再用一句话重复保留期', () => {
    const left = host.querySelector<HTMLElement>('.trow .tm2')!
    expect(left.textContent).toBe('7 天')
    vi.useFakeTimers()
    act(() => { left.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    vi.useRealTimers()
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('7 天后自动清除')
    expect(host.querySelector('.desk-foot')).toBeNull()
  })

  it('附件所属项目已删除时恢复按不了，原因项目已删除写在恢复的提示里，行上没有标签；能恢复的提示只有恢复', () => {
    const rows = [...host.querySelectorAll('.trow')]
    expect(rows.map(restoreState)).toEqual([
      [false, null, ['恢复', null]], [false, null, ['恢复', null]], [true, null, ['恢复', '项目已删除']], [false, null, ['恢复', null]],
    ])
  })

  it('论文原来的位置被同名论文占了时恢复按不了，原因库中已有同名论文写在恢复的提示里，行上没有标签', async () => {
    const held = api.entries
    api.entries = [{
      id: 'trash-5', kind: 'paper', title: 'Draft trees', deletedAt: Date.parse('2026-08-25T00:00:00Z'), restorable: false,
    }]
    try {
      act(() => root!.unmount())
      root = createRoot(host)
      await act(async () => { root!.render(<MessagesProvider><Trash /></MessagesProvider>) })
      expect(restoreState(host.querySelector('.trow')!)).toEqual([true, null, ['恢复', '库中已有同名论文']])
    } finally {
      api.entries = held
    }
  })

  it('每一类条目是页面上的嵌入列表，不套卡片外框', () => {
    expect([...host.querySelectorAll('.tgroup')].map((list) => list.className))
      .toEqual(['list list--embedded tgroup', 'list list--embedded tgroup'])
  })

  it('恢复和彻底删除是行尾操作槽里的图标钮，彻底删除悬停时标红', async () => {
    const row = host.querySelector('.trow')!
    expect(row.hasAttribute('data-row-actions')).toBe(true)
    expect([...row.querySelectorAll('.row-actions button')].map((item) => [
      item.getAttribute('aria-label'), item.textContent, item.classList.contains('icbtn'), item.classList.contains('danger'),
    ])).toEqual([['恢复', '', true, false], ['彻底删除', '', true, true]])
  })

  it('清空垃圾桶是整页的操作,放在屏头右端;分组标题只有名字和条数', async () => {
    const actions = host.querySelector('.desk-head > .page-actions')!
    expect([...actions.querySelectorAll('button')].map((b) => [b.textContent, b.className])).toEqual([['清空垃圾桶', 'btn danger']])
    expect([...host.querySelectorAll('.section-heading')].map((h) => h.textContent)).toEqual(['论文 · 2', '附件 · 2'])
    await act(async () => { button(actions, '清空垃圾桶').click() })
    expect(document.querySelector('[role="alertdialog"] .modal-title')!.textContent).toBe('清空垃圾桶？')
  })

  it('移出稍后阅读的条目自成一组，排在论文推送之后、论文之前，标题按论文标题显示', async () => {
    const held = api.entries
    const deletedAt = Date.parse('2026-08-25T00:00:00Z')
    api.entries = [
      { id: 'trash-5', kind: 'later', title: '\\textbf{L}ater trees', deletedAt, restorable: true },
      { id: 'trash-6', kind: 'inbox', title: 'Pushed trees', deletedAt, restorable: true },
      ...held,
    ]
    act(() => root!.unmount())
    root = createRoot(host)
    await act(async () => { root!.render(<MessagesProvider><Trash /></MessagesProvider>) })
    api.entries = held
    expect([...host.querySelectorAll('.section-heading')].map((h) => h.textContent))
      .toEqual(['论文推送 · 1', '稍后阅读 · 1', '论文 · 2', '附件 · 2'])
    expect(host.querySelectorAll('.tgroup')[1]!.querySelector('.tt2')!.innerHTML).toMatch(/^<strong>L<\/strong>ater trees/)
  })

  it('删掉的对话自成一组，排在论文之前，标题按论文标题显示；论文已有新对话时恢复按不了，原因论文已有新的对话写在恢复的提示里，行上没有标签', async () => {
    const held = api.entries
    const deletedAt = Date.parse('2026-08-25T00:00:00Z')
    api.entries = [
      { id: 'trash-7', kind: 'chat', title: '\\textbf{C}hat trees', deletedAt, restorable: false },
      { id: 'trash-8', kind: 'chat', title: '推测解码的树宽怎么定', deletedAt, restorable: true },
      { id: 'trash-9', kind: 'idea', title: '按接受率调整树宽', deletedAt, restorable: true },
      ...held,
    ]
    act(() => root!.unmount())
    root = createRoot(host)
    await act(async () => { root!.render(<MessagesProvider><Trash /></MessagesProvider>) })
    api.entries = held
    expect([...host.querySelectorAll('.section-heading')].map((h) => h.textContent))
      .toEqual(['对话 · 2', '论文 · 2', '想法 · 1', '附件 · 2'])
    const rows = [...host.querySelectorAll('.tgroup')[0]!.querySelectorAll('.trow')]
    expect(rows[0]!.querySelector('.tt2')!.innerHTML).toMatch(/^<strong>C<\/strong>hat trees/)
    expect(rows.map(restoreState)).toEqual([[true, null, ['恢复', '论文已有新的对话']], [false, null, ['恢复', null]]])
  })

  it('彻底删除一条要先确认,标题已说彻底,下面不再写一句,确认后才清除', async () => {
    await act(async () => { button(host.querySelector('.trow')!, '彻底删除').click() })
    expect(api.purge).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.querySelector('.modal-title')!.textContent).toBe('彻底删除「Draft trees」？')
    expect(dialog.querySelector('.modal-detail')).toBeNull()

    await act(async () => { button(dialog, '彻底删除').click() })
    expect(api.purge).toHaveBeenCalledExactlyOnceWith('trash-1')
  })

  it('论文条目的标题按 LaTeX 显示、确认框用纯文本标题，附件条目原样显示', async () => {
    const [, paper, attachment] = [...host.querySelectorAll('.trow .tt2')]
    expect(paper!.innerHTML).toMatch(/^<strong>F<\/strong>luxBin – <span><span class="katex">/)
    expect(attachment!.textContent).toBe('notes--v2.pdf')

    await act(async () => { button(host.querySelectorAll('.trow')[1]!, '彻底删除').click() })
    expect(document.querySelector('[role="alertdialog"]')!.textContent).toContain('彻底删除「FluxBin – \\times」？')
  })

  it('取消确认后条目不会被彻底删除', async () => {
    await act(async () => { button(host.querySelector('.trow')!, '彻底删除').click() })
    const dialog = document.querySelector('[role="alertdialog"]')
    expect(dialog).not.toBeNull()

    await act(async () => { button(dialog!, '取消').click() })
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(api.purge).not.toHaveBeenCalled()
  })

  it('恢复一条后它从列表上离开，不另弹通知', async () => {
    await act(async () => { button(host.querySelectorAll('.trow')[3]!, '恢复').click() })
    expect(api.notes).toEqual([undefined])
  })
})
