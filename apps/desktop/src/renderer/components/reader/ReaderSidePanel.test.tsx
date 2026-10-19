// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ReaderSidePanel, type ReaderSideTab } from './ReaderSidePanel.js'

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
  const show = (tab: ReaderSideTab | null, held: PaperReading, onSave = async () => true) => act(() => root!.render(
    <MessagesProvider>
      <ReaderSidePanel
        tab={tab} onTab={vi.fn()} paper={null} onPaper={vi.fn()} reading={held} currentPage={1}
        saving={false} onMutate={onSave} onSaveRemark={onSave} onJump={vi.fn()} focusHighlightId={null}
      />
    </MessagesProvider>,
  ))
  const field = (selector: string) => host.querySelector<HTMLTextAreaElement>(selector)!
  const type = (selector: string, value: string) => act(() => setValue(field(selector), value))

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
    await act(async () => { field(NOTE).closest('article')!.querySelector<HTMLButtonElement>('.btn')!.click() })
    const saved = { ...PAPER_ONE, notes: [{ ...PAPER_ONE.notes[0]!, text: '改过的笔记' }] }
    show('notes', saved)
    expect(field(NOTE).value).toBe('改过的笔记')

    show('remark', saved)
    type(REMARK, '  整篇的随想  ')
    await act(async () => { host.querySelector<HTMLButtonElement>('.remark-compose .btn')!.click() })
    show('remark', { ...saved, remark: '整篇的随想' })
    expect(field(REMARK).value).toBe('整篇的随想')
  })
})
