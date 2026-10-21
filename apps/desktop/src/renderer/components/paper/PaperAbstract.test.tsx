// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { PaperAbstract } from './PaperAbstract.js'

describe('PaperAbstract', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('把摘要里的行内 LaTeX 交给 KaTeX 渲染', () => {
    const out = renderToStaticMarkup(
      <MessagesProvider><PaperAbstract text={'speedup from 2.4$\\times$ to 2.9$\\times$.'} /></MessagesProvider>,
    )
    expect(out).toContain('class="katex"')
    expect(out).toContain('×')
    expect(out).not.toContain('$\\times$')
  })

  it('把摘要里的 \\textbf 等文本命令渲染成格式，不显示命令本身', () => {
    const out = renderToStaticMarkup(
      <MessagesProvider>
        <PaperAbstract text={'we propose FluxBin (\\textbf{F}lexible \\textbf{L}UT-based \\textbf{U}ltra-low-bit e\\textbf{X}ecution with \\textbf{Bin}ary bases)'} />
      </MessagesProvider>,
    )
    expect(out).toContain('(<strong>F</strong>lexible <strong>L</strong>UT-based <strong>U</strong>ltra-low-bit e<strong>X</strong>ecution with <strong>Bin</strong>ary bases)')
    expect(out).not.toContain('\\textbf')
  })

  it('普通摘要仍保持一个无额外外边距的段落', () => {
    const out = renderToStaticMarkup(
      <MessagesProvider><PaperAbstract text="A plain abstract." /></MessagesProvider>,
    )
    expect(out).toContain('<div class="paper-abstract pabs"><p>A plain abstract.</p></div>')
  })

  describe('folded', () => {
    let host: HTMLDivElement
    beforeEach(() => {
      vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
      host = document.createElement('div')
      document.body.append(host)
    })
    afterEach(() => {
      host.remove()
      vi.unstubAllGlobals()
    })

    /**
     * Renders a folded abstract whose text box reports `scrollHeight` against a 57px clipped box, its third
     * and last whole line ending 212px from its left edge and a fourth line hidden below it.
     */
    async function renderFolded(scrollHeight: number) {
      const heights = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
      const clipped = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(57)
      const frame = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, bottom: 57, width: 300 } as DOMRect)
      const lines = [{ top: 40, bottom: 55, right: 212, width: 212 }, { top: 59, bottom: 74, right: 90, width: 90 }]
      const range = vi.spyOn(document, 'createRange').mockReturnValue({ selectNodeContents() {}, getClientRects: () => lines } as unknown as Range)
      const root = createRoot(host)
      await act(async () => {
        root.render(<MessagesProvider><PaperAbstract text="A long abstract." folded /></MessagesProvider>)
      })
      for (const spy of [heights, clipped, frame, range]) spy.mockRestore()
      return root
    }

    it('超过三行时用共用的多行淡出在第三行文字末尾淡出并给「展开摘要」，点开后整段显示、按钮改成「收起摘要」', async () => {
      const root = await renderFolded(200)
      const body = host.querySelector<HTMLElement>('.paper-abstract')!
      expect([body.classList.contains('is-folded'), body.classList.contains('fade-lines'), body.classList.contains('clipped')]).toEqual([true, true, true])
      expect(body.style.getPropertyValue('--line-end')).toBe('212px')
      const toggle = host.querySelector<HTMLButtonElement>('.paper-abstract-toggle')!
      expect(toggle.textContent).toBe('展开摘要')
      expect(toggle.classList.contains('btn')).toBe(true)
      await act(async () => { toggle.click() })
      expect(body.classList.contains('is-folded')).toBe(false)
      expect(host.querySelector('.paper-abstract-toggle')?.textContent).toBe('收起摘要')
      await act(async () => { root.unmount() })
    })

    it('三行放得下时不淡出也不给展开按钮', async () => {
      const root = await renderFolded(57)
      expect(host.querySelector('.paper-abstract')?.classList.contains('clipped')).toBe(false)
      expect(host.querySelector('.paper-abstract-toggle')).toBeNull()
      await act(async () => { root.unmount() })
    })
  })
})
