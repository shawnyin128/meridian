// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { PaperCard, PaperCardBadge, PaperCardNotice } from './PaperCard.js'

describe('PaperCard', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('用插槽组合不同入口的动作与提示，可选摘要继续支持公式', () => {
    const out = renderToStaticMarkup(
      <MessagesProvider>
        <PaperCard
          paperId="paper-1" watchId="watch-1" title="A paper"
          actions={<button>稍后阅读</button>}
          notices={<PaperCardNotice action={<button>重试</button>}>下载失败</PaperCardNotice>}
          metadata={<>Ada<PaperCardBadge>ICLR</PaperCardBadge></>}
          abstract={'A $\\times$ B'} recommendation="与当前课题相关"
        />
      </MessagesProvider>,
    )
    expect(out).toContain('data-pid="paper-1"')
    expect(out).toContain('data-w="watch-1"')
    expect(out).toContain('稍后阅读')
    expect(out).toContain('下载失败')
    expect(out).toContain('class="katex"')
    expect(out).toContain('推荐理由')
  })

  it('卡片是操作槽的宿主，标题行尾的动作都放在槽里', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <MessagesProvider>
        <PaperCard paperId="paper-2" title="A paper" actions={<button>稍后阅读</button>} metadata="Ada" />
      </MessagesProvider>,
    )
    const card = host.querySelector('.paper-card')!
    expect(card.hasAttribute('data-row-actions')).toBe(true)
    expect(card.querySelector('.paper-card-heading .row-actions')!.textContent).toBe('稍后阅读')
  })

  it('元数据里的会场徽标是中性的标签，不用强调色', () => {
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(<PaperCardBadge>ICLR</PaperCardBadge>)
    expect(host.firstElementChild!.className).toBe('tag tag--label tag--neutral paper-card-badge venue')
    expect(host.textContent).toBe('ICLR')
  })

  it('标题里的公式与文本命令按 LaTeX 渲染', () => {
    const out = renderToStaticMarkup(
      <MessagesProvider>
        <PaperCard paperId="paper-3" title={'$\\alpha$-\\textbf{Net}: 50\\% Faster'} actions={null} metadata="Ada" />
      </MessagesProvider>,
    )
    expect(out).toMatch(/<h3><span><span class="katex">.*<\/span><\/span>-<strong>Net<\/strong>: 50% Faster<\/h3>/)
  })

  it('关闭可选能力时不产生空摘要或推荐区', () => {
    const out = renderToStaticMarkup(
      <MessagesProvider><PaperCard paperId="paper-2" title="Plain" actions={null} metadata="Ada" /></MessagesProvider>,
    )
    expect(out).not.toContain('摘要')
    expect(out).not.toContain('推荐理由')
  })

  it('摘要和推荐理由的小标签都来自词表，跟着界面语言走', () => {
    const labels = (language: 'zh' | 'en') => {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
      const host = document.createElement('div')
      host.innerHTML = renderToStaticMarkup(
        <MessagesProvider>
          <PaperCard paperId="paper-4" title="A paper" actions={null} metadata="Ada" abstract="Text" recommendation="Why" />
        </MessagesProvider>,
      )
      return [...host.querySelectorAll('.paper-card-label')].map((label) => label.textContent)
    }
    expect(labels('zh')).toEqual(['摘要', '推荐理由'])
    expect(labels('en')).toEqual(['Abstract', 'Why recommended'])
  })
})
