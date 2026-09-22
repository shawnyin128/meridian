// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { FeedRows } from './Feed.js'

const ENTRY: FeedEntry = {
  id: 'entry-1',
  source: 'steward',
  day: '今天',
  time: '刚刚',
  createdAt: '2026-09-20T12:00:00.000Z',
  body: { kind: 'runs', runs: [{ kind: 'text', text: '已入库' }] },
}

describe('feed rows', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh'))

  it('aligns the day heading with the card column and renders an advancing time', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider>
        <FeedRows
          rows={[ENTRY]} showDays nowMs={Date.parse('2026-09-20T12:03:00.000Z')}
          onOpenConflict={() => {}}
        />
      </MessagesProvider>,
    )

    expect(html).toContain('<div class="mwrap feed-day"><div class="day-heading">今天</div></div>')
    expect(html).toContain('<span class="ftime">3分钟前</span>')
  })
})
