// @vitest-environment jsdom
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { editText, useDrafts, type EditDraft, type TextEdit } from '../hooks/useDrafts.js'
import { headingsOf, Markdown, MarkdownField, MarkdownSection } from './Markdown.js'
import { TOOLTIP_DELAY } from './Tooltip.js'

/** The platform the preload reports, which decides the commit key; `window.meridian` stands in for the preload. */
let platform = 'darwin'
beforeEach(() => {
  platform = 'darwin'
  vi.stubGlobal('meridian', { get platform() { return platform } })
})
afterEach(() => { vi.unstubAllGlobals() })

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const html = (src: string) => renderToStaticMarkup(<MessagesProvider><Markdown src={src} /></MessagesProvider>)

describe('Markdown', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('表格、粗体、行内码按 markdown 渲染', () => {
    const out = html('| 论文 | 位宽 |\n|---|---|\n| GPTQ | **W4** `A16` |')
    expect(out).toContain('<table>')
    expect(out).toContain('<th>论文</th>')
    expect(out).toContain('<td>GPTQ</td>')
    expect(out).toContain('<strong>W4</strong>')
    expect(out).toContain('<code>A16</code>')
  })

  it('[[id|文字]] 与 [[id]] 是实体链接;能打开原文时 (p.N) 是锚点控件,打不开时只是文字', () => {
    const out = html('见 [[topics/ptq|PTQ]] 与 [[papers/a]](p.3)。')
    expect(out).toContain('<span class="entity-link entity-link--page" data-wk="topics/ptq">PTQ</span>')
    expect(out).toContain('<span class="entity-link entity-link--page" data-wk="papers/a">papers/a</span>')
    expect(out).toContain('</span>p.3。')
    const anchored = renderToStaticMarkup(
      <MessagesProvider><Markdown src="见 (p.3)。" onAnchor={() => undefined} /></MessagesProvider>,
    )
    expect(anchored).toContain('<button type="button" class="entity-link source-anchor" aria-label="原文第 3 页">p.3</button>')
  })

  it('点锚点控件按它的页码打开原文', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const onAnchor = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><Markdown src="见 (p.12)。" onAnchor={onAnchor} /></MessagesProvider>))
    act(() => host.querySelector<HTMLButtonElement>('.source-anchor')!.click())
    expect(onAnchor).toHaveBeenCalledWith(12)
    act(() => root.unmount())
  })

  it('能打开页面时页内链接是键盘能到的链接，点它打开页面而不改地址', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const onOpen = vi.fn()
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><Markdown src="见 [[topics/ptq|PTQ]]。" onOpen={onOpen} /></MessagesProvider>))
    const link = host.querySelector<HTMLElement>('.entity-link')!
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('#wiki:topics/ptq')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    act(() => { link.dispatchEvent(click) })
    expect(click.defaultPrevented).toBe(true)
    expect(onOpen).toHaveBeenCalledWith('topics/ptq')
    act(() => root.unmount())
  })

  it('[[id]] 没写别名时文字取 titles 里的短名,写了别名以别名为准,titles 里没有的按原文', () => {
    const titles = {
      'papers/a': { id: 'papers/a', title: 'GPTQ', fullTitle: 'GPTQ: Accurate Post-Training Quantization' },
      'topics/ptq': { id: 'topics/ptq', title: 'PTQ' },
    }
    const out = renderToStaticMarkup(
      <MessagesProvider><Markdown src="[[papers/a]] [[topics/ptq|训练后量化]] [[topics/ptq]] [[papers/z]]" titles={titles} /></MessagesProvider>,
    )
    expect(out).toContain('<span class="entity-link entity-link--page" data-wk="papers/a" data-state="closed">GPTQ</span>')
    expect(out).toContain('<span class="entity-link entity-link--page" data-wk="topics/ptq" data-state="closed">训练后量化</span>')
    expect(out).toContain('<span class="entity-link entity-link--page" data-wk="topics/ptq">PTQ</span>')
    expect(out).toContain('[[papers/z]]')
    expect(out).not.toContain('data-wk="papers/z"')
    expect(out).not.toContain('title=')
  })

  it('页内链接的文字不是页的全名时，悬停用共享 tooltip 显示全名', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    const titles = { 'papers/a': { id: 'papers/a', title: 'GPTQ', fullTitle: 'GPTQ: Accurate Post-Training Quantization' } }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><Markdown src="[[papers/a]]" titles={titles} /></MessagesProvider>))
    act(() => { host.querySelector('.entity-link')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('GPTQ: Accurate Post-Training Quantization')
    act(() => root.unmount())
    vi.useRealTimers()
  })

  const parts = (src: string, block: string) => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><Markdown src={src} onAnchor={() => undefined} /></MessagesProvider>))
    const out = [...host.querySelector(block)!.childNodes]
      .map((node) => (node instanceof Element ? `${node.className || node.localName}|${node.textContent}` : node.textContent))
    act(() => root.unmount())
    return out
  }

  it('(p.N) 前面的空白连同锚点是一段不断行的内容,锚点紧贴前面文字的最后一个字', () => {
    expect(parts('草稿头只需要一层解码 (p.8)', 'p')).toEqual(['草稿头只需要一层解码', 'source-anchor-keep| p.8'])
    expect(parts('as reported in Table 2 (p.7).', 'p')).toEqual(['as reported in Table 2', 'source-anchor-keep| p.7', '.'])
    expect(parts('第一行\n(p.3)', 'p')).toEqual(['第一行', 'source-anchor-keep|\np.3'])
    expect(parts('**一层解码器** (p.5)', 'p')).toEqual(['strong|一层解码器', 'source-anchor-keep| p.5'])
    expect(parts('- 特征层自回归 (p.2)', 'li')).toEqual(['特征层自回归', 'source-anchor-keep| p.2'])
  })

  it('前面没有空白的 (p.N) 和段首的 (p.N) 照旧;打不开原文时 (p.N) 前面的空白仍是文字里的空格', () => {
    expect(parts('接受率更要紧。(p.4)', 'p')).toEqual(['接受率更要紧。', 'source-anchor-keep|p.4'])
    expect(parts('(p.1) 开头的锚点', 'p')).toEqual(['source-anchor-keep|p.1', ' 开头的锚点'])
    expect(html('见 (p.3)。')).toContain('<p>见 p.3。</p>')
  })

  it('没给 titles 的随笔一律当链接;给了 titles 的页上,原文标记后面的 (p.N) 仍是锚点', () => {
    expect(html('[[papers/z]]')).toContain('<span class="entity-link entity-link--page" data-wk="papers/z">papers/z</span>')
    const out = renderToStaticMarkup(
      <MessagesProvider><Markdown src="见 [[papers/z]](p.3)。" titles={{}} onAnchor={() => undefined} /></MessagesProvider>,
    )
    expect(out).toContain('[[papers/z]]')
    expect(out).toContain('aria-label="原文第 3 页">p.3</button>')
  })

  it('行内与行间公式渲染成 KaTeX,套在粗体里也是', () => {
    expect(html('拐点在 $c(B)$ 处')).toContain('class="katex"')
    expect(html('拐点在 $c(B)$ 处')).not.toContain('$')
    expect(html('$$\n\\partial c\n$$')).toContain('katex-display')
    expect(html('**$c(B)$ 单调下降**')).toMatch(/<strong><span class="katex">.*单调下降<\/strong>/)
  })

  it('原始 HTML 与注释按文本转义,不渲染', () => {
    const out = html('<b>粗</b>\n\n<!-- generated:table -->')
    expect(out).not.toContain('<b>')
    expect(out).toContain('&lt;b&gt;')
    expect(out).toContain('&lt;!--')
  })

  it('普通链接开在新窗口目标上,由 main 进程转交系统浏览器,末尾带外链标记,和页内链接分得开', () => {
    const out = html('[站点](https://example.com) 与 [[topics/ptq|PTQ]]')
    expect(out).toMatch(
      /<a class="entity-link entity-link--external" href="https:\/\/example.com" target="_blank" rel="noreferrer">站点<span class="entity-link-mark" aria-hidden="true"><svg/,
    )
    expect(out).toMatch(/data-wk="topics\/ptq">PTQ<\/span>/)
  })

  it('标题带 id,是 h- 接它在原文里的行号', () => {
    const out = html('# 一\n\n文\n\n## 二')
    expect(out).toContain('<h1 id="h-1">一</h1>')
    expect(out).toContain('<h2 id="h-5">二</h2>')
  })

  it('标记不跨行:没闭合的 [[ 是原文,改写不增删换行,标题 id 与 headingsOf 一致', () => {
    const src = '# [[a|甲]] 与 [[b]](p.2)\n\n正文 [[未闭合\n\n## 标题二\n\n文字 [[topics/ptq]]'
    const out = html(src)
    expect(out).toContain('<h1 id="h-1">')
    expect(out).toContain('<h2 id="h-5">标题二</h2>')
    expect(out.match(/标题二/g)).toHaveLength(1)
    expect(out).toContain('[[未闭合')
    expect(out).toContain('<span class="entity-link entity-link--page" data-wk="topics/ptq">topics/ptq</span>')
    expect(headingsOf(src).map((h) => h.id)).toEqual(['h-1', 'h-5'])
  })

  it('协议被过滤掉的链接不画成链接', () => {
    const out = html('[x](javascript:alert(1))')
    expect(out).not.toContain('<a')
    expect(out).toContain('x')
  })
})

/**
 * Mounts a MarkdownSection over the stored text `stored`, its edit kept in memory, and returns the
 * host, the spy its saves reach (each save drops the edit, as the callers do) and helpers to drive it.
 */
function mountSection(stored: string, props: Partial<Parameters<typeof MarkdownSection>[0]> = {}, wrap = (node: ReactNode) => node) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const saved = vi.fn()
  let edit: TextEdit | null = null
  function Section({ text }: { text: string }) {
    const held = editText(useDrafts<EditDraft>(['probe']), 'body', text)
    edit = held
    return (
      <MarkdownSection
        title="随笔" edit={held} {...props}
        onSave={(next) => { held.drop(); saved(next) }}
      />
    )
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (text: string) => act(() => root.render(<MessagesProvider>{wrap(<Section text={text} />)}</MessagesProvider>))
  render(stored)
  const box = () => host.querySelector<HTMLElement>('.md')!
  const editorDom = () => host.querySelector<HTMLElement>('.md.src .cm-editor')
  const view = () => EditorView.findFromDOM(editorDom()!)!
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('.section-heading-actions .btn')].map((button) => button.textContent)
  const click = (target: Element) => act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 1, clientY: 1 })) })
  const pressOn = (target: Element) => act(() => { target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })) })
  const type = (text: string) => act(() => {
    view().dispatch({ changes: { from: 0, to: view().state.doc.length, insert: text }, userEvent: 'input.type' })
  })
  const key = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    act(() => { view().contentDOM.dispatchEvent(event) })
    return event
  }
  const done = () => {
    act(() => root.unmount())
    host.remove()
  }
  return { host, saved, render, box, editorDom, view, buttons, click, pressOn, type, key, done, edit: () => edit! }
}

describe('MarkdownSection', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('看的时候抬头里没有编辑按钮;点正文就在点到的那一块打开编辑器,那一块是原文,抬头换成取消和保存', () => {
    const s = mountSection('第一段\n\n**第二段**')
    expect(s.buttons()).toEqual([])
    expect(s.editorDom()).toBeNull()
    s.click(s.host.querySelectorAll('.md p')[1]!)
    expect(s.editorDom()).not.toBeNull()
    expect(s.buttons()).toEqual(['取消', '保存'])
    expect(document.activeElement).toBe(s.view().contentDOM)
    expect([...s.host.querySelectorAll('.cm-line')].map((line) => line.textContent)).toContain('**第二段**')
    expect(s.host.querySelector('.md-block')!.textContent).toBe('第一段')
    s.done()
  })

  it('点正文里的链接只打开链接,不进编辑;选着一段文字时点也不进', () => {
    const open = vi.fn()
    const s = mountSection('看 [[topics/ptq|PTQ]] 这一页', { onOpen: open })
    s.click(s.host.querySelector('.md a')!)
    expect(open).toHaveBeenCalledWith('topics/ptq')
    expect(s.editorDom()).toBeNull()

    const range = document.createRange()
    range.selectNodeContents(s.host.querySelector('.md p')!)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    s.click(s.host.querySelector('.md p')!)
    expect(s.editorDom()).toBeNull()
    window.getSelection()!.removeAllRanges()
    s.done()
  })

  it('正文空着时点空态那一行就开始写;用键盘聚焦正文按回车也打开编辑器', () => {
    const empty = mountSection('')
    empty.click(empty.host.querySelector('.empty-state')!)
    expect(empty.editorDom()).not.toBeNull()
    expect(empty.view().state.doc.toString()).toBe('')
    empty.done()

    const s = mountSection('一段')
    act(() => { s.box().focus() })
    act(() => { s.box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(s.editorDom()).not.toBeNull()
    s.done()
  })

  it('在外面按下就存下改过的字;没改过就只收起,不写', () => {
    const s = mountSection('原来的')
    s.click(s.host.querySelector('.md p')!)
    s.type('  改过的  ')
    s.pressOn(document.body)
    expect(s.saved).toHaveBeenCalledTimes(1)
    expect(s.saved).toHaveBeenLastCalledWith('改过的')
    expect(s.editorDom()).toBeNull()

    s.click(s.host.querySelector('.md p')!)
    s.pressOn(document.body)
    expect(s.saved).toHaveBeenCalledTimes(1)
    expect(s.editorDom()).toBeNull()
    s.done()
  })

  it('按抬头里的取消不先存一遍,改过的字丢掉;保存只写一次', () => {
    const s = mountSection('原来的')
    const button = (label: string) => [...s.host.querySelectorAll<HTMLButtonElement>('.section-heading-actions .btn')]
      .find((held) => held.textContent === label)!
    s.click(s.host.querySelector('.md p')!)
    s.type('不要了')
    s.pressOn(button('取消'))
    act(() => button('取消').click())
    expect(s.saved).not.toHaveBeenCalled()
    expect(s.host.querySelector('.md p')!.textContent).toBe('原来的')

    s.click(s.host.querySelector('.md p')!)
    s.type('要的')
    s.pressOn(button('保存'))
    act(() => button('保存').click())
    expect(s.saved).toHaveBeenCalledTimes(1)
    expect(s.saved).toHaveBeenLastCalledWith('要的')
    s.done()
  })

  it('藏起来的屏上开着的编辑,在别处按下不存,还开着', () => {
    const s = mountSection('原来的', {}, (node) => <div className="screenslot" hidden>{node}</div>)
    act(() => { s.edit().start() })
    s.type('留着的草稿')
    s.pressOn(document.body)
    expect(s.saved).not.toHaveBeenCalled()
    expect(s.editorDom()).not.toBeNull()
    s.done()
  })

  it('库里的字在编辑之后被改过时,保存按不动,⌘回车和在外面按下都不写', () => {
    const s = mountSection('原来的')
    s.click(s.host.querySelector('.md p')!)
    s.type('我的改动')
    s.render('别处改过的')
    expect(s.host.querySelector<HTMLButtonElement>('.section-heading-actions .btn:last-child')!.disabled).toBe(true)
    s.key({ key: 'Enter', metaKey: true })
    s.pressOn(document.body)
    expect(s.saved).not.toHaveBeenCalled()
    expect(s.editorDom()).not.toBeNull()
    s.done()
  })

  it('必填的正文删空了不存:保存按不动,在外面按下编辑还开着', () => {
    const s = mountSection('原来的', { required: true })
    s.click(s.host.querySelector('.md p')!)
    s.type('   ')
    expect(s.host.querySelector<HTMLButtonElement>('.section-heading-actions .btn:last-child')!.disabled).toBe(true)
    s.pressOn(document.body)
    expect(s.saved).not.toHaveBeenCalled()
    expect(s.editorDom()).not.toBeNull()
    s.done()
  })

  it('看的时候每个顶层块和顶层列表的每一项带着它在原文里开始的行号', () => {
    const s = mountSection('# 标题\n\n- 甲\n- 乙\n  - 乙一\n\n一段\n两行')
    expect([...s.host.querySelectorAll('.md [data-line]')].map((el) => `${el.tagName}:${el.getAttribute('data-line')}`))
      .toEqual(['H1:1', 'LI:3', 'LI:4', 'P:7'])
    s.done()
  })
})

describe('MarkdownSection 编辑器的按键', () => {
  let s: ReturnType<typeof mountSection>

  beforeEach(() => {
    s = mountSection('第一行\n第二行')
    s.click(s.host.querySelector('.md p')!)
  })

  afterEach(() => { s.done() })

  it('输入法组字时的 ⌘回车和 Esc 归输入法,既不保存也不撤掉编辑;组完字后 ⌘回车才保存,Esc 才撤', () => {
    s.type('改过')
    s.key({ key: 'Enter', metaKey: true, isComposing: true })
    s.key({ key: 'Escape', isComposing: true })
    expect(s.saved).not.toHaveBeenCalled()
    expect(s.editorDom()).not.toBeNull()

    s.key({ key: 'Enter', metaKey: true })
    expect(s.saved).toHaveBeenCalledTimes(1)
    s.click(s.host.querySelector('.md p')!)
    s.key({ key: 'Escape' })
    expect(s.editorDom()).toBeNull()
  })

  it('⌘回车只保存,不往原文里插空行;单按回车是换行,不保存', () => {
    act(() => s.view().dispatch({ selection: { anchor: 3 } }))
    s.key({ key: 'Enter' })
    expect(s.saved).not.toHaveBeenCalled()
    expect(s.view().state.doc.toString()).toBe('第一行\n\n第二行')
    s.key({ key: 'Enter', metaKey: true })
    expect(s.saved).toHaveBeenLastCalledWith('第一行\n\n第二行')
  })

  it('macOS 上 Control-回车不保存;其他平台 Ctrl+回车保存', () => {
    s.type('改过')
    s.key({ key: 'Enter', ctrlKey: true })
    expect(s.saved).not.toHaveBeenCalled()
    platform = 'win32'
    s.key({ key: 'Enter', ctrlKey: true })
    expect(s.saved).toHaveBeenCalledTimes(1)
  })

  it('Esc 撤掉编辑就停在这里,外层面板不跟着收起', () => {
    const outer = vi.fn()
    document.addEventListener('keydown', outer)
    s.key({ key: 'Escape' })
    document.removeEventListener('keydown', outer)
    expect(s.editorDom()).toBeNull()
    expect(outer).not.toHaveBeenCalled()
  })

  it('Tab 不被编辑器拿走,焦点照常移到下一个控件,原文不变', () => {
    expect(s.key({ key: 'Tab' }).defaultPrevented).toBe(false)
    expect(s.view().state.doc.toString()).toBe('第一行\n第二行')
  })

  it('打的字可以在编辑器里撤回再重做,每一步都留在草稿里', () => {
    act(() => s.view().dispatch({ changes: { from: 7, insert: '加一句' }, userEvent: 'input.type' }))
    expect(s.edit().text).toBe('第一行\n第二行加一句')
    s.key({ key: 'z', ctrlKey: true })
    expect(s.edit().text).toBe('第一行\n第二行')
    s.key({ key: 'y', ctrlKey: true })
    expect(s.edit().text).toBe('第一行\n第二行加一句')
  })
})

describe('MarkdownSection 实时预览', () => {
  it('光标不在的块渲染得和看的时候一模一样,光标所在的块是原文;打完「# 标题」回车,标题马上渲染', () => {
    const s = mountSection('# 标题\n\n- 甲 [[topics/ptq|PTQ]]\n- 乙\n\n`code` 与 $x^2$', { onOpen: vi.fn() })
    s.click(s.host.querySelector('.md h1')!)
    const blocks = () => [...s.host.querySelectorAll<HTMLElement>('.cm-editor .md-block')]
    const lines = () => [...s.host.querySelectorAll<HTMLElement>('.cm-editor .cm-line')].map((line) => line.textContent)
    /** The markup the read view renders for `src`. */
    const asRead = (src: string) => {
      const read = document.createElement('div')
      const reader = createRoot(read)
      act(() => reader.render(<MessagesProvider><Markdown src={src} onOpen={vi.fn()} /></MessagesProvider>))
      const markup = read.innerHTML
      act(() => reader.unmount())
      return markup
    }

    expect(lines()).toEqual(['# 标题', '', ''])
    expect(blocks().map((block) => block.innerHTML))
      .toEqual([asRead('- 甲 [[topics/ptq|PTQ]]'), asRead('- 乙'), asRead('`code` 与 $x^2$')])

    act(() => s.view().dispatch({ selection: { anchor: s.view().state.doc.length } }))
    expect(blocks()[0]!.innerHTML).toBe(asRead('# 标题'))
    expect(lines().at(-1)).toBe('`code` 与 $x^2$')

    const typed = '\n\n# 新标题\n'
    act(() => s.view().dispatch({
      changes: { from: s.view().state.doc.length, insert: typed }, selection: { anchor: s.view().state.doc.length + typed.length },
    }))
    expect(blocks().map((block) => block.querySelector('h1')?.textContent).filter(Boolean)).toEqual(['标题', '新标题'])
    expect(lines().at(-1)).toBe('')
    s.done()
  })

  it('空行不在光标上时不占高度,每块按看的时候的间距留出上方的空', () => {
    const s = mountSection('# 标题\n\n一段\n\n\n- 甲\n- 乙\n\n---\n\n尾段')
    s.click(s.host.querySelector('.md h1')!)
    const gaps = () => [...s.host.querySelectorAll('.cm-line')].filter((line) => line.classList.contains('md-gap')).length
    expect(gaps()).toBe(5)
    expect([...s.host.querySelectorAll('.cm-content > [data-space]')].map((el) => el.getAttribute('data-space')))
      .toEqual(['none', 'tight', 'block', 'none', 'wide', 'wide'])
    act(() => s.view().dispatch({ selection: { anchor: s.view().state.doc.line(4).from } }))
    expect(gaps()).toBe(4)
    s.done()
  })
})

describe('MarkdownField', () => {
  it('表单里的长文本是同一个编辑器:不抢焦点,空着时显示提示,打的字交给调用方,拒收时标出', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const change = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><MarkdownField text="" label="正文" placeholder="写点什么" invalid onChange={change} /></MessagesProvider>))
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>('.form-markdown .cm-editor')!)!
    expect(document.activeElement).not.toBe(view.contentDOM)
    expect(view.contentDOM.getAttribute('aria-label')).toBe('正文')
    expect(host.querySelector('.cm-placeholder')!.textContent).toBe('写点什么')
    expect(host.querySelector('.form-markdown')!.getAttribute('aria-invalid')).toBe('true')
    act(() => view.dispatch({ changes: { from: 0, insert: '- 一条' }, userEvent: 'input.type' }))
    expect(change).toHaveBeenLastCalledWith('- 一条')
    act(() => root.unmount())
    host.remove()
  })
})

describe('headingsOf', () => {
  it('列一到三级标题,id 是 h-行号;围栏代码块里的 # 不算,四级不算,尾部的 # 去掉', () => {
    expect(headingsOf('# 一\n\n```\n# 不是\n```\n\n## 二 ##\n#### 四\n### 三')).toEqual([
      { depth: 1, text: '一', id: 'h-1' },
      { depth: 2, text: '二', id: 'h-7' },
      { depth: 3, text: '三', id: 'h-9' },
    ])
    expect(headingsOf('没有标题')).toEqual([])
  })
})
