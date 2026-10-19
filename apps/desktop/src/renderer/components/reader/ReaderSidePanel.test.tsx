// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading, PaperRow } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'

vi.mock('../../ipc.js', () => ({
  harness: { pendingPaperWiki: () => new Promise(() => {}), preparePaperWiki: vi.fn() },
  papers: { update: vi.fn(), get: vi.fn() },
  project: { list: () => new Promise(() => {}), addPaper: vi.fn(), removePaper: vi.fn() },
}))
vi.mock('../../shell/AppShell.js', () => ({
  useBanner: () => vi.fn(),
  useToast: () => vi.fn(),
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))

const { ReaderSidePanel } = await import('./ReaderSidePanel.js')
type ReaderSideTab = import('./ReaderSidePanel.js').ReaderSideTab

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A paper's reading state with one highlight on page 2 and one note on page 3, ids numbered `n`. */
const reading = (paperId: string, n: number): PaperReading => ({
  paperId,
  remark: '',
  highlights: [{
    id: `highlight-${n}`, page: 2, quote: 'quoted evidence',
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    color: 'yellow', note: '', created: '2026-09-14', updated: '2026-09-14',
  }],
  notes: [{
    id: `note-${n}`, page: 3, text: '原笔记', created: '2026-09-14', updated: '2026-09-14',
  }],
})
const PAPER: PaperRow = {
  id: 'paper-1', title: '一篇论文', venue: 'arXiv', topics: [], methods: [], datasets: [], metrics: [],
  pageState: 'draft', readState: '未读', pageCount: 1, noteCount: 0, conclusionCount: 0,
  updated: '2026-01-01', custom: {}, projects: [],
}
const PAPER_ONE = reading('paper-1', 1)
const PAPER_TWO = reading('paper-2', 2)

const NEW_NOTE = '[aria-label="新笔记"]'
const NOTE = '[aria-label="第 3 页笔记"]'
const HIGHLIGHT_NOTE = '[aria-label="第 2 页高亮笔记"]'
const REMARK = 'textarea[aria-label="随笔"]'

function setValue(input: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ReaderSidePanel', () => {
  let root: Root | null = null
  let host: HTMLElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  /** Renders the rail on `tab` for `held`, as the reader does on every tab switch or paper change. */
  const show = (
    tab: ReaderSideTab | null, held: PaperReading, onSave = async () => true, paper: PaperRow | null = null,
  ) => act(() => root!.render(
    <MessagesProvider>
      <ReaderSidePanel
        tab={tab} onTab={vi.fn()} paper={paper} onPaper={vi.fn()} reading={held} currentPage={1}
        saving={false} onMutate={onSave} onSaveRemark={onSave} onJump={vi.fn()} focusHighlightId={null}
      />
    </MessagesProvider>,
  ))
  const field = (selector: string) => host.querySelector<HTMLTextAreaElement>(selector)!
  const type = (selector: string, value: string) => act(() => setValue(field(selector), value))
  const saveButton = (selector: string) => field(selector).closest('article, .remark-compose')!.querySelector<HTMLButtonElement>('.btn.pri')!
  const escape = (selector: string) => act(() => {
    field(selector).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  })

  it('右栏的每个面板都以同一种标题栏开头，元数据面板也有', () => {
    const heads = (['metadata', 'highlights', 'notes', 'remark', 'wiki'] as const).map((tab) => {
      show(tab, PAPER_ONE, undefined, PAPER)
      const panel = host.querySelector('.reader-side')!.firstElementChild!
      const head = panel.firstElementChild!
      return [head.tagName, head.className, head.querySelector('strong')?.textContent]
    })
    expect(heads).toEqual([
      ['HEADER', 'reader-panel-head', '元数据'],
      ['HEADER', 'reader-panel-head', '高亮与批注'],
      ['HEADER', 'reader-panel-head', '阅读笔记 · 1'],
      ['HEADER', 'reader-panel-head', '随笔 · 本篇'],
      ['HEADER', 'reader-panel-head', '内化到 Wiki'],
    ])
  })

  it('没保存的新笔记、笔记修改、高亮笔记和随笔留在各自的论文上：切右栏、收起右栏、换一篇再回来都还在，也不出现在另一篇', () => {
    show('notes', PAPER_ONE)
    type(NEW_NOTE, '一个新想法')
    type(NOTE, '改过的笔记')
    show('highlights', PAPER_ONE)
    type(HIGHLIGHT_NOTE, '高亮旁的判断')
    show('remark', PAPER_ONE)
    type(REMARK, '整篇的随想')
    show(null, PAPER_ONE)

    show('notes', PAPER_TWO)
    expect(field(NEW_NOTE).value).toBe('')
    expect(field(NOTE).value).toBe('原笔记')
    show('highlights', PAPER_TWO)
    expect(field(HIGHLIGHT_NOTE).value).toBe('')
    show('remark', PAPER_TWO)
    expect(field(REMARK).value).toBe('')

    show('notes', PAPER_ONE)
    expect(field(NEW_NOTE).value).toBe('一个新想法')
    expect(field(NOTE).value).toBe('改过的笔记')
    show('highlights', PAPER_ONE)
    expect(field(HIGHLIGHT_NOTE).value).toBe('高亮旁的判断')
    show('remark', PAPER_ONE)
    expect(field(REMARK).value).toBe('整篇的随想')
  })

  it('保存成功后不再留草稿：输入框显示库里存下的文字', async () => {
    show('notes', PAPER_ONE)
    type(NOTE, '  改过的笔记  ')
    await act(async () => { field(NOTE).closest('article')!.querySelector<HTMLButtonElement>('.btn.pri')!.click() })
    const saved = { ...PAPER_ONE, notes: [{ ...PAPER_ONE.notes[0]!, text: '改过的笔记' }] }
    show('notes', saved)
    expect(field(NOTE).value).toBe('改过的笔记')

    show('remark', saved)
    type(REMARK, '  整篇的随想  ')
    await act(async () => { host.querySelector<HTMLButtonElement>('.remark-compose .btn')!.click() })
    show('remark', { ...saved, remark: '整篇的随想' })
    expect(field(REMARK).value).toBe('整篇的随想')
  })

  it('回来时库里的文字已被改过：草稿照旧显示但标为保存被拒，接着打字也一样，保存不写入，Esc 丢掉草稿露出库里的文字', async () => {
    show('notes', PAPER_ONE)
    type(NOTE, '我改的笔记')
    show('highlights', PAPER_ONE)
    type(HIGHLIGHT_NOTE, '我写的高亮笔记')
    show('remark', PAPER_ONE)
    type(REMARK, '我写的随笔')
    show(null, PAPER_ONE)

    // Meanwhile an agent plugin rewrote all three in the vault.
    const changed: PaperReading = {
      ...PAPER_ONE, remark: '插件写的随笔',
      highlights: [{ ...PAPER_ONE.highlights[0]!, note: '插件写的高亮笔记' }],
      notes: [{ ...PAPER_ONE.notes[0]!, text: '插件改的笔记' }],
    }
    const save = vi.fn(async () => true)
    for (const [tab, selector, typed, stored] of [
      ['notes', NOTE, '我改的笔记', '插件改的笔记'],
      ['highlights', HIGHLIGHT_NOTE, '我写的高亮笔记', '插件写的高亮笔记'],
      ['remark', REMARK, '我写的随笔', '插件写的随笔'],
    ] as const) {
      show(tab, changed, save)
      expect(field(selector).value).toBe(typed)
      expect(field(selector).getAttribute('aria-invalid')).toBe('true')
      await act(async () => { saveButton(selector).click() })
      expect(save).not.toHaveBeenCalled()
      expect(field(selector).value).toBe(typed)
      // Typing on does not make the draft an edit of the newer text.
      type(selector, `${typed}，再补一句`)
      expect(field(selector).getAttribute('aria-invalid')).toBe('true')
      await act(async () => { saveButton(selector).click() })
      expect(save).not.toHaveBeenCalled()

      escape(selector)
      expect(field(selector).value).toBe(stored)
      expect(field(selector).getAttribute('aria-invalid')).toBeNull()
    }
  })
})
