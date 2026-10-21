// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedEntry } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const feedList = vi.hoisted(() => ({ rows: [] as FeedEntry[], open: vi.fn() }))
vi.mock('../ipc.js', () => ({ feed: { list: async () => feedList.rows } }))
vi.mock('../shell/AppShell.js', () => ({
  useJump: () => ({ open: feedList.open }),
  useToday: () => '2026-09-20',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
// The checklist reads the library and Settings on its own; here it stands in by a marker of where it sits.
vi.mock('../components/FirstRunChecklist.js', () => ({
  FirstRunChecklist: ({ className }: { className?: string }) => <div className={`firstrun-stub ${className ?? ''}`} />,
}))

const { Feed, FeedRows } = await import('./Feed.js')

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

  it('aligns the day heading with the card column and shows the time as the date and time pair', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider>
          <FeedRows rows={[{ ...ENTRY, createdAt: new Date(2026, 8, 20, 14, 5).toISOString() }]} onOpenConflict={() => {}} />
      </MessagesProvider>,
    )

    expect(html).toContain('<div class="mwrap feed-day"><div class="day-heading">今天</div></div>')
    expect(html).toMatch(/<span class="ftime"><span class="date-time-display">.*>9月20日<.*>14:05<.*<\/span><\/span>/)
  })

  it('an entry written before entries kept their time shows its stored time in the same chip', () => {
    const legacy: FeedEntry = { ...ENTRY, time: '昨天 21:40' }
    delete legacy.createdAt
    const html = renderToStaticMarkup(
      <MessagesProvider>
          <FeedRows rows={[legacy]} onOpenConflict={() => {}} />
      </MessagesProvider>,
    )

    expect(html).toMatch(/<span class="ftime"><span class="tag tag--chip tag--neutral date-chip"><span class="fade-text tag-text" data-state="closed">昨天 21:40<\/span><\/span><\/span>/)
  })

  it('heads each card with its source as a neutral label, the icon in the label colour rather than a tone of its own', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider>
          <FeedRows
            rows={[{ ...ENTRY, source: 'me' }, { ...ENTRY, id: 'entry-2', source: 'lab' }]} onOpenConflict={() => {}}
          />
      </MessagesProvider>,
    )

    expect(html).not.toContain('style="color')
    expect(html.match(/<div class="fsrc"><span class="tag tag--label tag--neutral source-label"><span class="fic">/g)).toHaveLength(2)
    expect(html).toContain('<span class="fade-text tag-text" data-state="closed">我</span>')
    expect(html).toContain('<span class="fade-text tag-text" data-state="closed">实验</span>')
  })

  it('renders the LaTeX of a paper title in an emphasized run', () => {
    const entry: FeedEntry = {
      ...ENTRY,
      body: { kind: 'runs', runs: [{ kind: 'text', text: '已入库：' }, { kind: 'strong', text: '《\\textbf{F}luxBin $\\times$》' }] },
    }
    const html = renderToStaticMarkup(
      <MessagesProvider>
          <FeedRows rows={[entry]} onOpenConflict={() => {}} />
      </MessagesProvider>,
    )

    expect(html).toMatch(/<b>《<strong>F<\/strong>luxBin <span><span class="katex">.*<\/span><\/span>》<\/b>/)
  })

  it('a run that names its entity is a link that opens it, in the look of its run; a run naming a kind it does not know reads as its text', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const entry: FeedEntry = {
      ...ENTRY,
      body: { kind: 'runs', runs: [
        { kind: 'strong', text: '「推测解码加速」', target: { kind: 'project', id: 'project-57' } },
        { kind: 'text', text: '读完' },
        { kind: 'strong', text: '《EAGLE》', target: { kind: 'paper', id: '2401-15077' } },
        { kind: 'text', text: '，更新了' },
        { kind: 'text', text: '推测解码', target: { kind: 'page', id: 'topics/sd' } },
        { kind: 'cite', text: '「树宽收益拐点」', target: { kind: 'claim', id: 'topics/sd#knee' } },
      ] },
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><FeedRows rows={[entry]} onOpenConflict={() => {}} /></MessagesProvider>))
    const body = host.querySelector('.fbody')!
    expect(body.textContent).toBe('「推测解码加速」读完《EAGLE》，更新了推测解码「树宽收益拐点」')
    const links = [...body.querySelectorAll<HTMLAnchorElement>('.entity-link')]
    expect(links.map((link) => [link.tagName, link.className, link.parentElement!.tagName, link.textContent])).toEqual([
      ['A', 'entity-link entity-link--project', 'B', '「推测解码加速」'],
      ['A', 'entity-link entity-link--paper', 'B', '《EAGLE》'],
      ['A', 'entity-link entity-link--page', 'DIV', '推测解码'],
    ])
    feedList.open.mockClear()
    for (const link of links) act(() => link.click())
    expect(feedList.open.mock.calls).toEqual([['project', 'project-57'], ['reader', '2401-15077'], ['wiki', 'topics/sd']])
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('names the day sections in the interface language and dates entries before today', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    const earlier = {
      ...ENTRY, id: 'entry-0', day: '更早', createdAt: new Date(2026, 8, 12, 9, 28).toISOString(),
    }
    const html = renderToStaticMarkup(
      <MessagesProvider>
          <FeedRows rows={[ENTRY, earlier]} onOpenConflict={() => {}} />
      </MessagesProvider>,
    )

    expect(html).toContain('<div class="day-heading">Today</div>')
    expect(html).toContain('<div class="day-heading">Earlier</div>')
    expect(html).toMatch(/>Sep 12<.*>09:28 AM</)
  })

  it('开始使用清单排在动态流的最上面、筛选条之上，和卡片一样宽', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    feedList.rows = [ENTRY]
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Feed /></MessagesProvider>) })
    expect([...host.querySelector('.feedcol > .desk-body > .msgs')!.children].slice(0, 2).map((child) => child.className))
      .toEqual(['firstrun-stub mwrap', 'page-toolbar mwrap'])
    await act(async () => { root.unmount() })
    host.remove()
    vi.unstubAllGlobals()
  })

  it('filtering by source keeps the day headings of the entries it shows', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // The page title measures whether it fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    feedList.rows = [
      { ...ENTRY, id: 'a', source: 'lab' },
      { ...ENTRY, id: 'b', source: 'me', day: '昨天' },
      { ...ENTRY, id: 'c', source: 'lab', day: '昨天' },
    ]
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => { root.render(<MessagesProvider><Feed /></MessagesProvider>) })
    // shared/feed-source-switch.test.ts centres the switch through this path.
    expect(host.querySelector('.feedcol > .desk-body > .msgs > .page-toolbar > .segmented-control')).not.toBeNull()
    const lab = [...host.querySelectorAll<HTMLButtonElement>('.page-toolbar button')].find((b) => b.textContent === '实验')!
    await act(async () => { lab.click() })
    expect(host.querySelectorAll('.fitem')).toHaveLength(2)
    expect([...host.querySelectorAll('.feed-day .day-heading')].map((h) => h.textContent)).toEqual(['今天', '昨天'])
    await act(async () => { root.unmount() })
    host.remove()
    vi.unstubAllGlobals()
  })
})
