// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { PaperText } from './PaperText.js'

const html = (text: string, block = false) =>
  renderToStaticMarkup(<MessagesProvider><PaperText text={text} block={block} /></MessagesProvider>)

describe('PaperText', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('行内模式下没有 LaTeX 的标题只输出原文，不加任何元素', () => {
    expect(html('Attention Is All You Need')).toBe('Attention Is All You Need')
  })

  it('行内模式把文本命令渲染成格式、公式交给 KaTeX，不包段落', () => {
    const out = html('e\\textbf{X}ecution in $\\times$ \\emph{y} \\texttt{z}')
    expect(out).toContain('e<strong>X</strong>ecution in ')
    expect(out).toContain('class="katex"')
    expect(out).toContain('<em>y</em>')
    expect(out).toContain('<code class="paper-text-mono">z</code>')
    expect(out).not.toContain('\\textbf')
    expect(out).not.toContain('$')
    expect(out).not.toContain('<p>')
  })

  it('块模式在 Markdown 文本里渲染文本命令，Markdown、公式和行内码照旧', () => {
    const out = html(
      'we propose FluxBin (\\textbf{F}lexible \\textbf{L}UT-based)\n\n**bold**, `\\textbf{code}` and $\\times$',
      true,
    )
    expect(out).toContain('<p>we propose FluxBin (<strong>F</strong>lexible <strong>L</strong>UT-based)</p>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<code>\\textbf{code}</code>')
    expect(out).toContain('class="katex"')
  })

  it('块模式里命令的参数可以包着公式', () => {
    expect(html('achieves \\textbf{3.2$\\times$} speedup', true))
      .toMatch(/achieves <strong>3\.2<span class="katex">.*<\/span><\/strong> speedup/)
  })

  it('块模式里 ~、连字符和转义按 LaTeX 的意思显示', () => {
    expect(html('Fig.~1 and Table~2 cover 2019--2020 with 50\\% fewer \\texttt{ops}', true))
      .toContain('<p>Fig.\u00a01 and Table\u00a02 cover 2019–2020 with 50% fewer <code class="paper-text-mono">ops</code></p>')
  })
})
