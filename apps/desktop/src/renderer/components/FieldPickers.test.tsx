// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { DotsMenu } from './FieldPickers.js'

describe('DotsMenu', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('always names itself 更多 and takes an extra accessible name', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><DotsMenu label="管理想法：蒸馏预算"><span>归档</span></DotsMenu></MessagesProvider>,
    )
    expect(html).toContain('title="更多"')
    expect(html).toContain('aria-label="管理想法：蒸馏预算"')
    expect(html).toContain('class="dots"')
  })
})
