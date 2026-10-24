// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaperReading, ReadingMutation } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY, setLanguagePreference } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const shell = vi.hoisted(() => ({
  revision: 0,
  jump: { screen: 'reader', target: 'paper-1', from: 'papers', seq: 1 },
  returnTo: vi.fn(),
  reading: { paperId: 'paper-1', highlights: [], notes: [], remark: '' } as PaperReading,
  writes: [] as ReadingMutation[],
  /** The reading state after `mutation`, as Core applies the highlight commands. */
  written(held: PaperReading, mutation: ReadingMutation): PaperReading {
    if (mutation.kind === 'highlight.add') {
      const { page, quote, rects, color } = mutation
      const highlight = { id: `highlight-${held.highlights.length + 1}`, page, quote, rects, color, note: '', created: '2026-10-24', updated: '2026-10-24' }
      return { ...held, highlights: [...held.highlights, highlight] }
    }
    if (mutation.kind === 'highlight.update') {
      return {
        ...held,
        highlights: held.highlights.map((item) => (item.id === mutation.id
          ? { ...item, note: mutation.note, ...(mutation.color === undefined ? {} : { color: mutation.color }) }
          : item)),
      }
    }
    throw new Error(`no fake for ${mutation.kind}`)
  },
}))

vi.mock('../ipc.js', () => ({
  papers: {
    get: () => Promise.resolve({ id: 'paper-1', title: 'Paper One' }),
    reading: () => Promise.resolve(structuredClone(shell.reading)),
    // The PDF never arrives: these cases are about the reading state beside it.
    source: () => new Promise(() => {}),
    mutateReading: (_id: string, mutation: ReadingMutation) => {
      shell.writes.push(mutation)
      shell.reading = shell.written(shell.reading, mutation)
      return Promise.resolve(structuredClone(shell.reading))
    },
  },
}))

vi.mock('../shell/AppShell.js', () => ({
  useNotice: () => ({ success: vi.fn(), refusal: vi.fn() }),
  useCrumbTail: () => {},
  useJump: () => ({ jump: shell.jump, open: vi.fn(), returnTo: shell.returnTo }),
  useVaultRevision: () => ({ revision: shell.revision, bump: vi.fn() }),
}))

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

vi.mock('../components/chat/PaperChat.js', () => ({
  PaperChat: ({ onBack, prompt }: { onBack: () => void; prompt: { quote: string } | null }) => (
    <button type="button" className="back" data-asked={prompt?.quote ?? ''} onClick={onBack} />
  ),
}))

vi.mock('../components/reader/ReaderSidePanel.js', () => ({
  ReaderSidePanel: ({ reading }: { reading: PaperReading | null }) => (
    <>
      <ul className="notes">{reading?.notes.map((note) => <li key={note.id}>{note.text}</li>)}</ul>
      <ul className="highlights">
        {reading?.highlights.map((highlight) => <li key={highlight.id} className={highlight.color}>{highlight.note}</li>)}
      </ul>
    </>
  ),
}))

const { Reader } = await import('./Reader.js')

const note = (id: string, text: string) => ({ id, page: 1, text, created: '2026-10-18', updated: '2026-10-18' })

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
    shell.writes = []
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
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
      sheet.innerHTML = '<div class="pdfpagebox" data-page="1" data-aspect="0.75"><div class="paper-highlights"></div>'
        + '<div class="paper-selection"></div><div class="textLayer"><span>Speculative decoding</span></div></div>'
      const range = document.createRange()
      range.selectNodeContents(sheet.querySelector('.textLayer span')!)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      await act(async () => { host.querySelector('.pdfwrap')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
      await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
    }
    const tools = () => document.querySelector<HTMLElement>('.selection-tools')
    const control = (label: string) => tools()!.querySelector<HTMLElement>(`[aria-label="${label}"]`)!
    const noteBox = () => tools()!.querySelector<HTMLTextAreaElement>('textarea')!
    const click = (element: HTMLElement) => act(async () => { element.click() })
    /** The colour circles that show as picked. */
    const picked = () => [...tools()!.querySelectorAll('[aria-checked="true"]')].map((circle) => circle.getAttribute('aria-label'))
    const highlights = () => shell.reading.highlights.map(({ color, note }) => ({ color, note }))
    const ADDED = { kind: 'highlight.add', page: 1, quote: 'Speculative decoding', rects: expect.any(Array) }
    /** Writes `text` into the note box as typing does. */
    const write = (text: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(noteBox(), text)
      noteBox().dispatchEvent(new Event('input', { bubbles: true }))
    })
    /** Presses `key` in the note box; returns whether the press kept its default action. */
    const press = async (key: string, init: KeyboardEventInit = {}) => {
      let kept = true
      await act(async () => {
        kept = noteBox().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
      })
      return kept
    }
    const frame = () => act(async () => { await new Promise((done) => requestAnimationFrame(() => done(undefined))) })
    /** A click outside the toolbar; Radix dismisses on the click that follows the press. */
    const clickOutside = () => act(async () => {
      for (const type of ['pointerdown', 'click']) document.body.dispatchEvent(new MouseEvent(type, { bubbles: true }))
    })

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

    it('两行,一个字也不写:上面是问 AI 的标记和四个高亮颜色圈,下面是批注框;每个控件都有中英文的名字', async () => {
      await render()
      await select()
      const names = () => [...tools()!.querySelectorAll('button, textarea')].map((control) => control.getAttribute('aria-label'))
      expect(tools()!.textContent).toBe('')
      expect(noteBox().placeholder).toBe('')
      expect(names()).toEqual(['Ask AI', 'Yellow', 'Green', 'Blue', 'Pink', 'Annotation'])
      await act(async () => { setLanguagePreference('zh') })
      expect(names()).toEqual(['问 AI', '黄色', '绿色', '蓝色', '粉色', '批注'])
    })

    it('点一个颜色就按那个颜色划成高亮,工具条还开着,点中的圈显示为选中', async () => {
      await render()
      await select()
      expect(picked()).toEqual([])
      await click(control('Green'))
      expect(shell.writes).toEqual([{ ...ADDED, color: 'green' }])
      expect(tools()).not.toBeNull()
      expect(picked()).toEqual(['Green'])
    })

    it('再点另一个颜色给这段高亮换色,不另划一段', async () => {
      await render()
      await select()
      await click(control('Green'))
      await click(control('Blue'))
      expect(shell.writes.slice(1)).toEqual([{ kind: 'highlight.update', id: 'highlight-1', note: '', color: 'blue' }])
      expect(highlights()).toEqual([{ color: 'blue', note: '' }])
      expect(picked()).toEqual(['Blue'])
      expect(tools()).not.toBeNull()
    })

    it('Enter 把批注记到选了颜色的那段高亮上,工具条收起,侧栏里看得到', async () => {
      await render()
      await select()
      await click(control('Pink'))
      await write('  要点  ')
      expect(await press('Enter')).toBe(false)
      expect(shell.writes.slice(1)).toEqual([{ kind: 'highlight.update', id: 'highlight-1', note: '要点' }])
      expect(highlights()).toEqual([{ color: 'pink', note: '要点' }])
      expect(tools()).toBeNull()
      expect(host.querySelector('.highlights li.pink')!.textContent).toBe('要点')
    })

    it('没选颜色时 Enter 划一段带着这条批注的黄色高亮,工具条收起', async () => {
      await render()
      await select()
      await write('第一行\n第二行')
      await press('Enter')
      expect(shell.writes).toEqual([
        { ...ADDED, color: 'yellow' }, { kind: 'highlight.update', id: 'highlight-1', note: '第一行\n第二行' },
      ])
      expect(highlights()).toEqual([{ color: 'yellow', note: '第一行\n第二行' }])
      expect(tools()).toBeNull()
    })

    it('批注框空着按 Enter:还没划高亮就什么也不做,划了就收起', async () => {
      await render()
      await select()
      await press('Enter')
      expect([shell.writes, tools() === null]).toEqual([[], false])
      await click(control('Blue'))
      await press('Enter')
      expect(shell.writes.map((write) => write.kind)).toEqual(['highlight.add'])
      expect(tools()).toBeNull()
    })

    it('Shift+Enter 在批注里换行,输入法选字的 Enter 归输入法:都不保存也不收起', async () => {
      await render()
      await select()
      await write('第一行')
      expect(await press('Enter', { shiftKey: true })).toBe(true)
      expect(await press('Enter', { isComposing: true })).toBe(true)
      expect(shell.writes).toEqual([])
      expect(tools()).not.toBeNull()
    })

    it('按 Esc 或点工具条外面收起,已经划的高亮留着', async () => {
      await render()
      await select()
      await click(control('Yellow'))
      await write('还没写完')
      await press('Escape')
      expect(tools()).toBeNull()
      await select()
      await click(control('Green'))
      await clickOutside()
      expect(tools()).toBeNull()
      expect(shell.writes.map((write) => write.kind)).toEqual(['highlight.add', 'highlight.add'])
      expect(highlights()).toEqual([{ color: 'yellow', note: '' }, { color: 'green', note: '' }])
    })

    it('点工具条外面时批注框里写了字,就像 Enter 一样存下:没选颜色划成带它的黄色高亮,选了颜色记到那段高亮上', async () => {
      await render()
      await select()
      await write('点外面也留着')
      await clickOutside()
      expect(tools()).toBeNull()
      expect(shell.writes).toEqual([{ ...ADDED, color: 'yellow' }, { kind: 'highlight.update', id: 'highlight-1', note: '点外面也留着' }])

      await select()
      await click(control('Blue'))
      await write('选了颜色再写')
      await clickOutside()
      expect(shell.writes.slice(2)).toEqual([
        { ...ADDED, color: 'blue' }, { kind: 'highlight.update', id: 'highlight-2', note: '选了颜色再写' },
      ])
      expect(highlights()).toEqual([{ color: 'yellow', note: '点外面也留着' }, { color: 'blue', note: '选了颜色再写' }])
    })

    it('页面滚动收起或问 AI 时,批注框里写的字也存下', async () => {
      await render()
      await select()
      await write('滚走之前写的')
      await act(async () => { host.querySelector('.pdfwrap')!.dispatchEvent(new Event('scroll')) })
      expect(tools()).toBeNull()
      await select()
      await write('问之前写的')
      await click(control('Ask AI'))
      expect(host.querySelector('.back')!.getAttribute('data-asked')).toBe('Speculative decoding')
      expect(highlights()).toEqual([{ color: 'yellow', note: '滚走之前写的' }, { color: 'yellow', note: '问之前写的' }])
    })

    it('点问 AI 的标记,和原来的「问 AI」一样把选中的话交给论文对话并收起', async () => {
      await render()
      await select()
      await click(control('Ask AI'))
      expect(host.querySelector('.back')!.getAttribute('data-asked')).toBe('Speculative decoding')
      expect(tools()).toBeNull()
      expect(shell.writes).toEqual([])
    })

    it('焦点进了批注框、文档的选区没了,选中的那段照旧画在页上;划成高亮后就不再画', async () => {
      await render()
      await select()
      const drawn = () => host.querySelectorAll('.paper-selection svg').length
      await act(async () => {
        noteBox().focus()
        // A focused text field takes the document's selection, as Chromium does when the box is clicked.
        window.getSelection()!.removeAllRanges()
        document.dispatchEvent(new Event('selectionchange'))
      })
      await frame()
      expect(drawn()).toBe(1)
      await click(control('Yellow'))
      await frame()
      expect(drawn()).toBe(0)
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
