// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
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
})
