// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { EmptyState } from './EmptyState.js'

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(<MessagesProvider>{node}</MessagesProvider>)

describe('EmptyState', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('draws an empty page as the screen glyph alone, without a sentence', () => {
    expect(render(<EmptyState variant="page" icon={<svg />} />)).toBe('<div class="empty-state empty-state--page"><svg></svg></div>')
  })

  it('puts the one action that ends the emptiness after the glyph', () => {
    expect(render(<EmptyState variant="page" icon={<svg />} action={<button type="button" className="btn">打开项目列表</button>} />))
      .toBe('<div class="empty-state empty-state--page"><svg></svg><button type="button" class="btn">打开项目列表</button></div>')
  })

  it('draws an empty section as one line holding the shared empty value', () => {
    expect(render(<EmptyState variant="section" />)).toBe('<div class="empty-state empty-state--section">—</div>')
  })

  it('draws an empty option list as that line holding the no-result word, its word where an option\'s text starts', () => {
    expect(render(<EmptyState variant="option" />)).toBe('<div class="empty-state empty-state--option">无结果</div>')
  })

  it('draws a search or picker that found nothing as the same line holding the no-result word', () => {
    expect(render(<EmptyState variant="results" />)).toBe('<div class="empty-state empty-state--section">无结果</div>')
  })

  it('stands the shared empty value in a value\'s place inline', () => {
    expect(render(<EmptyState variant="inline" />)).toBe('<span class="empty-state empty-state--inline">—</span>')
  })
})
