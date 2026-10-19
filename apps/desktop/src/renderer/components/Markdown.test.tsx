// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { headingsOf, Markdown, MarkdownBox } from './Markdown.js'
import { TOOLTIP_DELAY } from './Tooltip.js'

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
    expect(out).toContain('<span class="entity-link entity-link--page" title="GPTQ: Accurate Post-Training Quantization" data-wk="papers/a">GPTQ</span>')
    expect(out).toContain('<span class="entity-link entity-link--page" title="PTQ" data-wk="topics/ptq">训练后量化</span>')
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
    act(() => { host.querySelector('.wl')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' })) })
    act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('GPTQ: Accurate Post-Training Quantization')
    act(() => root.unmount())
    vi.useRealTimers()
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

describe('MarkdownBox', () => {
  it('编辑时输入法组字的 Esc 不撤掉编辑,组完字后的 Esc 才撤', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const cancel = vi.fn()
    function Probe() {
      const box = useRef<HTMLDivElement>(null)
      return <MarkdownBox text="a/b" editing box={box} onCancel={cancel} onSave={vi.fn()} empty={null} />
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Probe />))
    const box = host.querySelector<HTMLElement>('.md.src')!
    act(() => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })))
    expect(cancel).not.toHaveBeenCalled()

    act(() => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(cancel).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
  })
})

describe('MarkdownBox 空正文', () => {
  it('正文空着时只放空态，不包在正文的内边距里，和别的分节空态一样齐', () => {
    function Box() {
      const box = useRef<HTMLDivElement>(null)
      return (
        <MarkdownBox
          text="" editing={false} box={box} onCancel={vi.fn()} onSave={vi.fn()} className="memo"
          empty={<span className="probe-empty">空</span>}
        />
      )
    }
    const out = renderToStaticMarkup(<MessagesProvider><Box /></MessagesProvider>)
    expect(out).toBe('<span class="probe-empty">空</span>')
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
