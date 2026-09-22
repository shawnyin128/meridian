// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading, ReadingMutation } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ReadingNotes } from '../components/reader/ReadingNotes.js'

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

function setValue(input: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ReadingNotes', () => {
  const roots: ReturnType<typeof createRoot>[] = []

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
  })

  it('新笔记带当前页提交成功后清空草稿', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const mutations: ReadingMutation[] = []
    act(() => root.render(
      <MessagesProvider>
        <ReadingNotes
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

  it('已有高亮与笔记只发精确的修改、删除命令，页码按钮负责定位', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    roots.push(root)
    const mutations: ReadingMutation[] = []
    const jump = vi.fn()
    act(() => root.render(
      <MessagesProvider>
        <ReadingNotes
          reading={READING} currentPage={1} saving={false} onJump={jump}
          onMutate={async (mutation) => { mutations.push(mutation); return true }}
        />
      </MessagesProvider>,
    ))

    const highlightNote = host.querySelector<HTMLTextAreaElement>('[aria-label="第 2 页高亮笔记"]')!
    act(() => setValue(highlightNote, '高亮判断'))
    await act(async () => { highlightNote.closest('article')!.querySelector<HTMLButtonElement>('.btn')!.click() })
    const note = host.querySelector<HTMLTextAreaElement>('[aria-label="第 3 页笔记"]')!
    act(() => setValue(note, '修订笔记'))
    await act(async () => { note.closest('article')!.querySelector<HTMLButtonElement>('.btn')!.click() })
    await act(async () => { note.closest('article')!.querySelector<HTMLButtonElement>('.reading-delete')!.click() })
    act(() => { host.querySelector<HTMLButtonElement>('.highlight-card .reading-page')!.click() })

    expect(mutations).toEqual([
      { kind: 'highlight.update', id: 'highlight-1', note: '高亮判断' },
      { kind: 'note.update', id: 'note-1', text: '修订笔记' },
      { kind: 'note.delete', id: 'note-1' },
    ])
    expect(jump).toHaveBeenCalledWith(2)
  })
})
