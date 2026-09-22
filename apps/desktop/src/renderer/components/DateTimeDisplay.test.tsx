// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { DateChip, DateTimeDisplay } from './DateTimeDisplay.js'

describe('DateTimeDisplay', () => {
  beforeEach(() => { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh') })

  it('uses the global Chinese date format', () => {
    expect(renderToStaticMarkup(
      <MessagesProvider><DateChip date="2026-09-16" /></MessagesProvider>,
    )).toContain('9月16日')
  })

  it('keeps the date before the optional time', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><DateTimeDisplay start="2026-09-16" time="08:00–10:00" /></MessagesProvider>,
    )
    expect(html.indexOf('9月16日')).toBeLessThan(html.indexOf('08:00–10:00'))
  })

  it('can disable the time without leaving a placeholder', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><DateTimeDisplay start="2026-09-16" /></MessagesProvider>,
    )
    expect(html.match(/date-chip/g)).toHaveLength(1)
  })
})
