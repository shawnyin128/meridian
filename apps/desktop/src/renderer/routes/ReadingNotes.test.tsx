// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading, ReadingMutation } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ReadingNotes } from '../components/reader/ReadingNotes.js'
import { useDrafts, type EditDraft } from '../hooks/useDrafts.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const READING: PaperReading = {
  paperId: 'paper-1',
  remark: '',
  highlights: [{
    id: 'highlight-1', page: 2, quote: 'quoted evidence',
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    color: 'yellow', note: '', created: '2026-09-14', updated: '2026-09-14',
  }],
  notes: [{
    id: 'note-1', page: 3, text: '原笔记', created: '2026-09-14', updated: '2026-09-14',
  }],
}

/** The notes panel with the drafts the reader rail holds for it. */
function Notes(props: Omit<ComponentProps<typeof ReadingNotes>, 'drafts' | 'edits'>) {
  return <ReadingNotes {...props} drafts={useDrafts(['paper', 'p1'])} edits={useDrafts<EditDraft>(['paper', 'p1', 'edits'])} />
}

function setValue(input: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ReadingNotes', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  const roots: ReturnType<typeof createRoot>[] = []

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
  })

  it('在页上选中的那段高亮,它的卡片滚到眼前、显示为选中,焦点不挪进它的批注', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const scrolled: unknown[] = []
    Element.prototype.scrollIntoView = function (this: Element, options?: unknown) { scrolled.push([this.className, options]) }
    const panel = (selected: string | null) => (
      <MessagesProvider>
        <Notes
          reading={READING} currentPage={2} saving={false} onJump={vi.fn()} onMutate={async () => true}
          mode="highlights" selectedHighlightId={selected}
        />
      </MessagesProvider>
    )
    act(() => root.render(panel(null)))
    const card = () => host.querySelector('.highlight-card')!
    expect([card().classList.contains('item--selected'), card().getAttribute('aria-current'), scrolled]).toEqual([false, null, []])
    act(() => root.render(panel('highlight-1')))
    expect([card().classList.contains('item--selected'), card().getAttribute('aria-current')]).toEqual([true, 'true'])
    expect(scrolled).toEqual([['item item--card item--slotted item--selected item--marked reading-card highlight-card yellow', { block: 'nearest' }]])
    expect(document.activeElement).toBe(document.body)
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  it('新笔记带当前页提交成功后清空草稿', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const mutations: ReadingMutation[] = []
    act(() => root.render(
      <MessagesProvider>
        <Notes
          reading={READING} currentPage={4} saving={false} onJump={vi.fn()}
          onMutate={async (mutation) => { mutations.push(mutation); return true }}
        />
      </MessagesProvider>,
    ))
    const draft = host.querySelector<HTMLTextAreaElement>('[aria-label="新笔记"]')!
    act(() => setValue(draft, '  一个新想法  '))
    await act(async () => { host.querySelector<HTMLButtonElement>('.note-compose .btn')!.click() })
    expect(mutations).toEqual([{ kind: 'note.add', page: 4, text: '一个新想法' }])
    expect(draft.value).toBe('')
  })

  it('新笔记、改笔记与改高亮批注的保存钮都只叫保存', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(
      <MessagesProvider>
        <Notes reading={READING} currentPage={1} saving={false} onJump={vi.fn()} onMutate={async () => true} />
      </MessagesProvider>,
    ))
    const saves = [...host.querySelectorAll('.note-compose > .btn, .reading-actions > .btn')].map((button) => button.textContent)
    expect(saves).toHaveLength(3)
    expect(new Set(saves)).toEqual(new Set(['保存']))
  })

  it('笔记和高亮卡片的删除是卡片顶行操作槽里的图标钮，悬停时标红；保存留在槽外', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    act(() => root.render(
      <MessagesProvider>
        <Notes reading={READING} currentPage={1} saving={false} onJump={vi.fn()} onMutate={async () => true} />
      </MessagesProvider>,
    ))
    const slot = (row: Element) => [...row.querySelectorAll('.row-actions button')].map((item) => [
      item.getAttribute('aria-label'), item.textContent, item.classList.contains('icbtn'), item.classList.contains('danger'),
    ])
    for (const card of host.querySelectorAll('.reading-card')) {
      expect(card.hasAttribute('data-row-actions')).toBe(true)
      expect(slot(card)).toEqual([['删除', '', true, true]])
      expect(card.querySelector('.row-actions .btn')).toBeNull()
    }
  })

  it('已有高亮与笔记只发精确的修改、删除命令，页码按钮负责定位', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const mutations: ReadingMutation[] = []
    const jump = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <Notes
          reading={READING} currentPage={1} saving={false} onJump={jump}
          onMutate={async (mutation) => { mutations.push(mutation); return true }}
        />
      </MessagesProvider>,
    ))

    const highlightNote = host.querySelector<HTMLTextAreaElement>('[aria-label="第 2 页高亮批注"]')!
    act(() => setValue(highlightNote, '高亮判断'))
    await act(async () => { highlightNote.closest('article')!.querySelector<HTMLButtonElement>('.reading-actions .btn')!.click() })
    const note = host.querySelector<HTMLTextAreaElement>('[aria-label="第 3 页笔记"]')!
    act(() => setValue(note, '修订笔记'))
    await act(async () => { note.closest('article')!.querySelector<HTMLButtonElement>('.reading-actions .btn')!.click() })
    await act(async () => { note.closest('article')!.querySelector<HTMLButtonElement>('.reading-delete')!.click() })
    act(() => { host.querySelector<HTMLButtonElement>('.highlight-card .item-meta .source-anchor')!.click() })

    expect(mutations).toEqual([
      { kind: 'highlight.update', id: 'highlight-1', note: '高亮判断' },
      { kind: 'note.update', id: 'note-1', text: '修订笔记' },
      { kind: 'note.delete', id: 'note-1' },
    ])
    expect(jump).toHaveBeenCalledWith(2)
  })
})
