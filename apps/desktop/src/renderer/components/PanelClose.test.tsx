// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { PanelClose } from './PanelClose.js'

describe('PanelClose', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('is one icon button with the same name everywhere', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><PanelClose onClose={() => undefined} /></MessagesProvider>,
    )
    expect(html).toContain('title="收起详情"')
    expect(html).toContain('aria-label="收起详情"')
    expect(html).toContain('class="icbtn panel-close"')
    expect(html).toContain('<svg')
    expect(html).not.toContain('×')
  })
})
