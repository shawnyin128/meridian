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

    /** Renders a folded abstract whose text box reports `scrollHeight` against a 57px clipped box. */
    async function renderFolded(scrollHeight: number) {
      const heights = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
      const clipped = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(57)
      const root = createRoot(host)
      await act(async () => {
        root.render(<MessagesProvider><PaperAbstract text="A long abstract." folded /></MessagesProvider>)
      })
      heights.mockRestore()
      clipped.mockRestore()
      return root
    }

    it('超过三行时淡出并给「展开摘要」，点开后整段显示、按钮改成「收起摘要」', async () => {
      const root = await renderFolded(200)
      const body = host.querySelector('.paper-abstract')!
      expect(body.classList.contains('is-folded')).toBe(true)
      expect(body.classList.contains('is-clipped')).toBe(true)
      const toggle = host.querySelector<HTMLButtonElement>('.paper-abstract-toggle')!
      expect(toggle.textContent).toBe('展开摘要')
      await act(async () => { toggle.click() })
      expect(body.classList.contains('is-folded')).toBe(false)
      expect(host.querySelector('.paper-abstract-toggle')?.textContent).toBe('收起摘要')
      await act(async () => { root.unmount() })
    })

    it('三行放得下时不淡出也不给展开按钮', async () => {
      const root = await renderFolded(57)
      expect(host.querySelector('.paper-abstract')?.classList.contains('is-clipped')).toBe(false)
      expect(host.querySelector('.paper-abstract-toggle')).toBeNull()
      await act(async () => { root.unmount() })
    })
  })
})
