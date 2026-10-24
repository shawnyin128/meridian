// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading, ReadingMutation } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const shell = vi.hoisted(() => ({
  revision: 0,
  jump: { screen: 'reader', target: 'paper-1', from: 'papers', seq: 1 },
  returnTo: vi.fn(),
  reading: { paperId: 'paper-1', highlights: [], notes: [], remark: '' } as PaperReading,
  /** Each success notice's text and the action it offered, in the order shown. */
  successes: [] as [text: unknown, action: { label: string; onAction: () => void } | undefined][],
  /** The change entries changelog.undo was asked to undo, in order. */
  undone: [] as string[],
}))

vi.mock('../ipc.js', () => ({
  papers: {
    get: () => Promise.resolve({ id: 'paper-1', title: 'Paper One' }),
    reading: () => Promise.resolve(structuredClone(shell.reading)),
    // The PDF never arrives: these cases are about the reading state beside it.
    source: () => new Promise(() => {}),
    // As in Core, a deletion answers the reading without the deleted item and the change it recorded.
    mutateReading: (_id: string, mutation: ReadingMutation & { id: string }) => {
      const { notes, highlights } = shell.reading
      shell.reading = {
        ...shell.reading,
        notes: notes.filter((held) => held.id !== mutation.id),
        highlights: highlights.filter((held) => held.id !== mutation.id),
      }
      return Promise.resolve({ reading: structuredClone(shell.reading), change: `change-${mutation.kind}` })
    },
  },
  changelog: { undo: (id: string) => { shell.undone.push(id); return Promise.resolve() } },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({
    success: (text: unknown, action?: { label: string; onAction: () => void }) => { shell.successes.push([text, action]) },
    refusal: vi.fn(),
  }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: shell.jump, open: vi.fn(), returnTo: shell.returnTo }),
  useVaultRevision: () => ({ revision: shell.revision, bump: vi.fn() }),
}))

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

vi.mock('../components/chat/PaperChat.js', () => ({
  PaperChat: ({ onBack }: { onBack: () => void }) => <button type="button" className="back" onClick={onBack} />,
}))

vi.mock('../components/reader/ReaderSidePanel.js', () => ({
  ReaderSidePanel: ({ reading, onMutate }: {
    reading: PaperReading | null
    onMutate: (mutation: ReadingMutation) => Promise<boolean>
  }) => (
    <>
      <ul className="notes">{reading?.notes.map((note) => (
        <li key={note.id}>
          {note.text}
          <button type="button" className="drop" onClick={() => { void onMutate({ kind: 'note.delete', id: note.id }) }} />
        </li>
      ))}</ul>
      <ul className="highlights">{reading?.highlights.map((highlight) => (
        <li key={highlight.id}>
          <button type="button" className="drop" onClick={() => { void onMutate({ kind: 'highlight.delete', id: highlight.id }) }} />
        </li>
      ))}</ul>
    </>
  ),
}))

const { Reader } = await import('./Reader.js')

const note = (id: string, text: string) => ({ id, page: 1, text, created: '2026-10-18', updated: '2026-10-18' })
const highlight = (id: string) => ({
  id, page: 1, quote: 'Speculative decoding', rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.02 }],
  color: 'yellow' as const, note: '', created: '2026-10-18', updated: '2026-10-18',
})

describe('Reader', () => {
  let root: Root
  let host: HTMLDivElement

  const render = async () => {
    await act(async () => { root.render(<MessagesProvider><Reader /></MessagesProvider>) })
  }
  const notes = () => [...host.querySelectorAll('.notes li')].map((li) => li.textContent)

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // jsdom has no ResizeObserver; the reader watches its scroll area's width with one.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    shell.revision = 0
    shell.reading = { paperId: 'paper-1', highlights: [], notes: [note('note-1', '留着的')], remark: '' }
    shell.successes = []
    shell.undone = []
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('缩放到上限或下限时那一侧的按钮变淡，点百分比回到 100%', async () => {
    await render()
    const button = (label: string) => host.querySelector<HTMLButtonElement>(`.zoomctl [aria-label="${label}"]`)!
    const reset = () => host.querySelector<HTMLButtonElement>('.zoomctl .zoom-reset')!
    const shown = () => reset().textContent
    const press = async (label: string, times: number) => {
      for (let n = 0; n < times; n += 1) await act(async () => { button(label).click() })
    }
    await press('Zoom in', 7)
    expect([shown(), button('Zoom in').disabled, button('Zoom out').disabled]).toEqual(['240%', true, false])
    await act(async () => { reset().click() })
    expect(shown()).toBe('100%')
    await press('Zoom out', 2)
    expect([shown(), button('Zoom in').disabled, button('Zoom out').disabled]).toEqual(['60%', false, true])
  })

  it('从别的屏点链接打开时,阅读器头上的返回回到来的那一屏', async () => {
    shell.jump = { screen: 'reader', target: 'paper-1', from: 'feed', seq: 2 }
    await render()
    await act(async () => { host.querySelector<HTMLButtonElement>('.back')!.click() })
    expect(shell.returnTo).toHaveBeenCalledWith('feed')
    shell.jump = { screen: 'reader', target: 'paper-1', from: 'papers', seq: 1 }
  })

  it('别处的写(在最近变动里撤销一条)之后重取阅读记录,放回来的笔记出现在侧栏', async () => {
    await render()
    expect(notes()).toEqual(['留着的'])

    shell.reading = { ...shell.reading, notes: [note('note-0', '撤销放回来的'), ...shell.reading.notes] }
    shell.revision = 1
    await render()
    expect(notes()).toEqual(['撤销放回来的', '留着的'])
  })

  it('删掉一条笔记,提示带撤销,撤销的是这次删除记下的那条变动', async () => {
    await render()
    await act(async () => { host.querySelector<HTMLButtonElement>('.notes .drop')!.click() })
    expect(notes()).toEqual([])
    const [text, action] = shell.successes.at(-1) ?? []
    expect([text, action?.label]).toEqual(['Note deleted', 'Undo'])
    await act(async () => { action!.onAction() })
    expect(shell.undone).toEqual(['change-note.delete'])
  })

  it('删掉一处高亮,提示带撤销,撤销的是这次删除记下的那条变动', async () => {
    shell.reading = { ...shell.reading, highlights: [highlight('highlight-1')] }
    await render()
    await act(async () => { host.querySelector<HTMLButtonElement>('.highlights .drop')!.click() })
    expect(host.querySelectorAll('.highlights li')).toHaveLength(0)
    const [text, action] = shell.successes.at(-1) ?? []
    expect([text, action?.label]).toEqual(['Highlight deleted', 'Undo'])
    await act(async () => { action!.onAction() })
    expect(shell.undone).toEqual(['change-highlight.delete'])
  })

  describe('选中文字后的工具条', () => {
    const SELECTED = DOMRect.fromRect({ x: 160, y: 250, width: 120, height: 14 })

    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('pdfpagebox')
          ? DOMRect.fromRect({ x: 100, y: 50, width: 600, height: 800 })
          : DOMRect.fromRect()
      })
      // jsdom does not lay text out, so a selected range reports the box of the selected words here.
      Range.prototype.getClientRects = () => [SELECTED] as unknown as DOMRectList
    })

    afterEach(() => {
      vi.restoreAllMocks()
      delete (Range.prototype as Partial<Range>).getClientRects
    })

    /** Puts one page with a selection layer and a text layer on the sheet, selects its words and releases the mouse. */
    const select = async () => {
      const sheet = host.querySelector('.pdfsheet')!
      sheet.innerHTML = '<div class="pdfpagebox" data-page="1"><div class="paper-selection"></div>'
        + '<div class="textLayer"><span>Speculative decoding</span></div></div>'
      const range = document.createRange()
      range.selectNodeContents(sheet.querySelector('.textLayer span')!)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      await act(async () => { host.querySelector('.pdfwrap')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
      await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
    }
    const tools = () => document.querySelector<HTMLElement>('.selection-tools')

    it('用共享的浮层面,贴着选中的文字放', async () => {
      await render()
      await select()
      expect(tools()!.classList.contains('ctxmenu')).toBe(true)
      const wrapper = tools()!.closest<HTMLElement>('[data-radix-popper-content-wrapper]')!
      const anchor = (side: string) => parseFloat(wrapper.style.getPropertyValue(`--radix-popper-anchor-${side}`))
      expect(anchor('width')).toBeCloseTo(SELECTED.width, 6)
      expect(anchor('height')).toBeCloseTo(SELECTED.height, 6)
    })

    it('页面一滚动就收起', async () => {
      await render()
      await select()
      expect(tools()).not.toBeNull()
      await act(async () => { host.querySelector('.pdfwrap')!.dispatchEvent(new Event('scroll')) })
      expect(tools()).toBeNull()
    })

    it('按 Esc 收起', async () => {
      await render()
      await select()
      expect(tools()).not.toBeNull()
      await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
      expect(tools()).toBeNull()
    })

    it('选区一变就按高亮的画法画在页上：一页一个形状，一行一个矩形；选区收起就擦掉', async () => {
      await render()
      const sheet = host.querySelector('.pdfsheet')!
      sheet.innerHTML = '<div class="pdfpagebox" data-page="1"><div class="paper-selection"></div>'
        + '<div class="textLayer"><span>Speculative decoding</span><br><span>drafts tokens</span></div></div>'
      // Two lines 18px apart whose text boxes overlap by 2px, as a page's tightly set lines do.
      const lines = new Map([
        ['Speculative decoding', DOMRect.fromRect({ x: 160, y: 250, width: 240, height: 20 })],
        ['drafts tokens', DOMRect.fromRect({ x: 160, y: 268, width: 150, height: 20 })],
      ])
      Range.prototype.getClientRects = function (this: Range) { return [lines.get(this.toString())!] as unknown as DOMRectList }
      const range = document.createRange()
      range.selectNodeContents(sheet.querySelector('.textLayer')!)
      const changed = async () => {
        await act(async () => {
          document.dispatchEvent(new Event('selectionchange'))
          await new Promise((done) => requestAnimationFrame(() => done(undefined)))
        })
      }
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      await changed()

      const shapes = [...sheet.querySelectorAll<SVGSVGElement>('.paper-selection svg')]
      expect(shapes).toHaveLength(1)
      const paths = [...shapes[0]!.querySelectorAll('path')]
      expect(paths).toHaveLength(1)
      // One closed rectangle per line, in the page's own units, both in one shape.
      expect(paths[0]!.getAttribute('d')).toBe('M0.1 0.25h0.4v0.025h-0.4zM0.1 0.2725h0.25v0.025h-0.25z')
      expect([shapes[0]!.style.left, shapes[0]!.style.top, shapes[0]!.style.width]).toEqual(['10%', '25%', '40%'])

      window.getSelection()!.removeAllRanges()
      await changed()
      expect(sheet.querySelectorAll('.paper-selection svg')).toHaveLength(0)
    })

    it('缩放页面时收起', async () => {
      await render()
      await select()
      expect(tools()).not.toBeNull()
      await act(async () => { host.querySelector<HTMLButtonElement>('.zoomctl button:last-child')!.click() })
      expect(tools()).toBeNull()
    })
  })
})
