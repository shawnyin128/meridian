// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { DateChip, DateTimeDisplay, TrailingDate } from './DateTimeDisplay.js'

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

  it('a timestamp shows its local day, then its local clock time', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider><DateTimeDisplay at={new Date(2026, 8, 16, 7, 45).getTime()} /></MessagesProvider>,
    )
    expect([...html.matchAll(/<span class="fade-text tag-text"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['9月16日', '07:45'])
  })

  it('a trailing date shows its label and reserves the label of every month with a two-digit day, the widest of the locale', () => {
    document.body.innerHTML = renderToStaticMarkup(
      <MessagesProvider><TrailingDate date="2026-10-04" label={(date) => `${date} 更新`} /></MessagesProvider>,
    )
    const slot = document.querySelector('.trailing-date')!
    expect(slot.textContent).toBe('10月4日 更新')
    expect(slot.getAttribute('data-widest')!.split('\n'))
      .toEqual(Array.from({ length: 12 }, (_, month) => `${month + 1}月28日 更新`))
  })
})
