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

  it('关闭可选能力时不产生空摘要或推荐区', () => {
    const out = renderToStaticMarkup(
      <MessagesProvider><PaperCard paperId="paper-2" title="Plain" actions={null} metadata="Ada" /></MessagesProvider>,
    )
    expect(out).not.toContain('Abstract')
    expect(out).not.toContain('推荐理由')
  })
})
