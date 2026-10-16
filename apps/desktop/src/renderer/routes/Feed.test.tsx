// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { TodayContext } from '../shell/AppShell.js'
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
        <TodayContext.Provider value="2026-09-20">
          <FeedRows
            rows={[ENTRY]} showDays nowMs={Date.parse('2026-09-20T12:03:00.000Z')}
            onOpenConflict={() => {}}
          />
        </TodayContext.Provider>
      </MessagesProvider>,
    )

    expect(html).toContain('<div class="mwrap feed-day"><div class="day-heading">今天</div></div>')
    expect(html).toContain('<span class="ftime">3分钟前</span>')
  })

  it('renders the LaTeX of a paper title in an emphasized run', () => {
    const entry: FeedEntry = {
      ...ENTRY,
      body: { kind: 'runs', runs: [{ kind: 'text', text: '已入库：' }, { kind: 'strong', text: '《\\textbf{F}luxBin $\\times$》' }] },
    }
    const html = renderToStaticMarkup(
      <MessagesProvider>
        <TodayContext.Provider value="2026-09-20">
          <FeedRows rows={[entry]} showDays={false} nowMs={Date.parse('2026-09-20T12:03:00.000Z')} onOpenConflict={() => {}} />
        </TodayContext.Provider>
      </MessagesProvider>,
    )

    expect(html).toMatch(/<b>《<strong>F<\/strong>luxBin <span><span class="katex">.*<\/span><\/span>》<\/b>/)
  })

  it('names the day sections in the interface language and dates entries before today', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    const earlier = {
      ...ENTRY, id: 'entry-0', day: '更早', createdAt: new Date(2026, 8, 12, 9, 28).toISOString(),
    }
    const html = renderToStaticMarkup(
      <MessagesProvider>
        <TodayContext.Provider value="2026-09-20">
          <FeedRows
            rows={[ENTRY, earlier]} showDays nowMs={Date.parse('2026-09-20T12:03:00.000Z')}
            onOpenConflict={() => {}}
          />
        </TodayContext.Provider>
      </MessagesProvider>,
    )

    expect(html).toContain('<div class="day-heading">Today</div>')
    expect(html).toContain('<div class="day-heading">Earlier</div>')
    expect(html).toContain('<span class="ftime">Sep 12, 2026, 09:28 AM</span>')
  })
})
