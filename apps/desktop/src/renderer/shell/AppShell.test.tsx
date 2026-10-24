// @vitest-environment jsdom
import { act, useRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownBox } from '../components/Markdown.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from './language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const fixture = vi.hoisted(() => ({
  watches: [{ id: 'w-topic', type: 'topic', name: '推测解码', active: true }],
  projects: [{ id: 'p1', name: '推理项目', status: '进行中' }],
  discovery: [{ id: 'e1', kind: 'discovery', watch: '', project: 'p1', source: '推理项目' }],
  delivered: [] as { id: string; kind: 'watch'; watch: string; title: string }[],
  chats: [{ id: 'c1', title: '讨论', archived: false, messageCount: 1 }],
  deleteChat: vi.fn(async () => ({ trash: 'trash-9' })),
  restoreTrash: vi.fn(async () => {}),
  back: vi.fn(),
  platform: 'darwin',
  fullScreen: [] as ((on: boolean) => void)[],
  today: () => Promise.resolve('2026-10-18'),
  /** What the native menu's Command Palette item sends, once the shell has subscribed to it. */
  openPalette: null as (() => void) | null,
}))

const none = () => Promise.resolve([])

vi.mock('../ipc.js', () => ({
  appMenu: {
    onOpenSettings: () => () => {}, onOpenAgentTutorial: () => () => {}, platform: () => fixture.platform,
    onOpenPalette: (handler: () => void) => {
      fixture.openPalette = handler
      return () => { fixture.openPalette = null }
    },
    onFullScreen: (handler: (on: boolean) => void) => {
      fixture.fullScreen.push(handler)
      return () => { fixture.fullScreen.splice(fixture.fullScreen.indexOf(handler), 1) }
    },
    setTitleBarTheme: vi.fn(), toggleMaximize: vi.fn(),
  },
  appUpdates: { check: vi.fn(), status: () => new Promise(() => {}), onChange: () => () => {}, install: vi.fn() },
  changelog: { list: none },
  colourThemes: { list: none },
  chat: {
    list: () => Promise.resolve(fixture.chats), create: () => new Promise(() => {}), setArchived: vi.fn(),
    delete: fixture.deleteChat,
  },
  extensions: { checkLatest: vi.fn() },
  idea: { list: none },
  inbox: { list: ({ kind }: { kind: string }) => Promise.resolve(kind === 'discovery' ? fixture.discovery : fixture.delivered) },
  jobs: { status: () => new Promise(() => {}) },
  later: { list: none },
  papers: { list: () => Promise.resolve({ rows: [], total: 0 }) },
  project: { list: () => Promise.resolve(fixture.projects) },
  search: { query: none },
  trash: { list: none, restore: fixture.restoreTrash },
  vault: { today: () => fixture.today() },
  watch: { list: () => Promise.resolve(fixture.watches) },
  wiki: { home: () => Promise.resolve({ aggregationCount: 0 }) },
}))
vi.mock('../components/AboutDialog.js', () => ({ AboutDialog: () => null }))

const {
  AppShell, useCrumbTail, useEscapeLayer, useJump, useNotice, usePaperChatCollapsed, useSettingsOpen,
} = await import('./AppShell.js')
const { useJumpOrigin } = await import('../hooks/useJumpOrigin.js')
const { TOOLTIP_DELAY } = await import('../components/Tooltip.js')

const TAIL = [{ text: '深层' }]

/** A screen one level below its top, so the breadcrumb links back to it. */
function Deeper() {
  useCrumbTail(TAIL, fixture.back)
  return <p>deeper</p>
}

/** Shows whether the shell reports the Reader's paper chat as collapsed. */
function PaperChatState() {
  return <p id="paperChatCollapsed">{String(usePaperChatCollapsed())}</p>
}

const SCREENS = {
  feed: <PaperChatState />, inbox: null, later: null, papers: <Deeper />, wiki: null, changelog: null, ideas: null,
  overview: null, project: null, trash: null, chat: null, reader: null,
}

let root: Root | null = null
let host: HTMLDivElement

/** Mounts the shell with `feed` as the content of its first screen and `more` as other screens' content. */
async function mount(feed: ReactNode = <PaperChatState />, more: Partial<Record<keyof typeof SCREENS, ReactNode>> = {}): Promise<void> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The breadcrumb's segments measure whether they fit, and jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<MessagesProvider><AppShell screens={{ ...SCREENS, ...more, feed }} settings={null} /></MessagesProvider>)
    await Promise.resolve()
  })
}

/** A panel that Escape closes, as a detail panel is, with a field inside it. */
function Panel({ onClose }: { onClose: () => void }) {
  useEscapeLayer(true, onClose)
  return <input aria-label="名称" />
}

/** A screen with a Markdown editor being edited, a select, and a button. */
function Editors() {
  const box = useRef<HTMLDivElement>(null)
  return (
    <>
      <MarkdownBox text="a" editing box={box} onCancel={() => {}} onSave={() => {}} empty={null} />
      <select><option>a</option></select>
      <button type="button">b</button>
    </>
  )
}

/** Presses "/" on `target` and returns whether the keydown's default action was prevented. */
function slash(target: HTMLElement): boolean {
  const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
  act(() => { target.dispatchEvent(event) })
  return event.defaultPrevented
}

afterEach(() => {
  if (root !== null) act(() => root!.unmount())
  root = null
  vi.unstubAllGlobals()
})

/** Shows which settings category the shell has asked to open, or nothing while settings are closed. */
function SettingsProbe() {
  const { open, requestedCategory } = useSettingsOpen()
  return <p id="settingsProbe">{open ? requestedCategory ?? 'default' : ''}</p>
}

describe('库打不开时', () => {
  afterEach(() => { fixture.today = () => Promise.resolve('2026-10-18') })

  it('报出原因，下面只有一个换论文库的操作，点它打开存储设置，不写一句该怎么做', async () => {
    fixture.today = () => Promise.reject(new Error('库里没有论文页目录'))
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // The failure page's title measures whether it fits, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root!.render(<MessagesProvider><AppShell screens={SCREENS} settings={<SettingsProbe />} /></MessagesProvider>)
      await Promise.resolve()
    })
    const page = document.querySelector('.bootfail')!
    expect([...page.querySelector('.desk-body')!.children].map((el) => el.getAttribute('role') ?? el.tagName)).toEqual(['alert', 'BUTTON'])
    const action = page.querySelector<HTMLButtonElement>('.btn')!
    expect(action.textContent).toBe('换论文库')
    act(() => action.click())
    expect(document.querySelector('#settingsProbe')!.textContent).toBe('storage')
  })
})

const press = (key: string, init: KeyboardEventInit = {}) => act(() => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
})

const crumbs = () => [...document.querySelectorAll('#crumb .cseg')].map((seg) => seg.textContent)

/** Rests the pointer on `selector` past the shared tooltip delay; returns the tooltip's name and shortcut. */
function hoverTip(selector: string): [string | undefined, string | undefined] {
  vi.useFakeTimers()
  act(() => {
    document.querySelector(selector)!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }))
  })
  act(() => { vi.advanceTimersByTime(TOOLTIP_DELAY) })
  vi.useRealTimers()
  const tip = document.querySelector('[role="tooltip"]')
  return [tip?.firstChild?.textContent ?? undefined, tip?.querySelector('.tooltip-key')?.textContent ?? undefined]
}

/** The button that activates a row: the row itself, or the first child of a row that holds other controls. */
function controlOf(selector: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(selector)!
  const control = row.tagName === 'BUTTON' ? row : row.firstElementChild as HTMLElement
  expect(control.tagName, selector).toBe('BUTTON')
  return control
}

describe('侧栏论文推送的计数', () => {
  const watches = fixture.watches
  afterEach(() => {
    fixture.watches = watches
    fixture.delivered = []
  })

  /** The text of the count badge in each of `rows`, or null where a row has none. */
  const counts = (rows: string[]) => Object.fromEntries(rows.map((row) => [row, document.querySelector(`${row} .count-badge`)?.textContent ?? null]))

  it('分组行数的是组里各个关注推来的条数,同名的两篇不同论文各算一篇;没有条目的组和关注都不显示数', async () => {
    fixture.watches = [
      { id: 'w-topic', type: 'topic', name: '推测解码', active: true },
      { id: 'w-moe', type: 'topic', name: '专家混合', active: true },
      { id: 'w-dao', type: 'author', name: 'Tri Dao', active: true },
    ]
    fixture.delivered = [
      { id: 'i1', kind: 'watch', watch: 'w-topic', title: 'EAGLE' },
      { id: 'i2', kind: 'watch', watch: 'w-topic', title: 'Medusa' },
      { id: 'i3', kind: 'watch', watch: 'w-topic', title: 'SpecInfer' },
      { id: 'i4', kind: 'watch', watch: 'w-moe', title: 'Medusa' },
    ]
    await mount()
    expect(counts(['#rowInboxAll', '[data-disc="topics"]', '[data-watchrow="w-topic"]', '[data-watchrow="w-moe"]', '[data-disc="authors"]', '[data-watchrow="w-dao"]']))
      .toEqual({
        '#rowInboxAll': '4', '[data-disc="topics"]': '4', '[data-watchrow="w-topic"]': '3', '[data-watchrow="w-moe"]': '1',
        '[data-disc="authors"]': null, '[data-watchrow="w-dao"]': null,
      })
  })

  it('暂停的关注照样显示它推来的条数,只是变灰', async () => {
    fixture.watches = [{ id: 'w-paused', type: 'topic', name: '已暂停的关注', active: false }]
    fixture.delivered = [
      { id: 'i1', kind: 'watch', watch: 'w-paused', title: 'EAGLE' },
      { id: 'i2', kind: 'watch', watch: 'w-paused', title: 'Medusa' },
    ]
    await mount()
    const row = document.querySelector('[data-watchrow="w-paused"]')!
    expect([row.classList.contains('dim'), row.querySelector('.count-badge')?.textContent ?? null]).toEqual([true, '2'])
  })

  it('侧栏没有一行显示 0:数为 0 的行和收件、垃圾桶一样不带计数', async () => {
    await mount()
    expect(counts(['[data-desk="wiki"]', '[data-desk="papers"]', '[data-desk="changelog"]', '[data-desk="resproj"]', '[data-desk="ideas"]', '[data-desk="later"]', '[data-desk="trash"]']))
      .toEqual({
        '[data-desk="wiki"]': null, '[data-desk="papers"]': null, '[data-desk="changelog"]': null, '[data-desk="resproj"]': '1',
        '[data-desk="ideas"]': null, '[data-desk="later"]': null, '[data-desk="trash"]': null,
      })
  })
})

describe('AppShell sidebar collapse', () => {
  let sidebar: HTMLElement
  let search: HTMLInputElement

  beforeEach(async () => {
    await mount()
    sidebar = document.querySelector<HTMLElement>('#sidebar')!
    search = document.querySelector<HTMLInputElement>('#sSearch')!
  })

  it('takes the collapsed sidebar out of the Tab order and gives it back when it opens again', () => {
    expect(sidebar.hasAttribute('inert')).toBe(false)
    press('b', { metaKey: true })
    expect(document.querySelector('#main')!.classList.contains('sbhide')).toBe(true)
    expect(sidebar.hasAttribute('inert')).toBe(true)
    press('b', { metaKey: true })
    expect(sidebar.hasAttribute('inert')).toBe(false)
  })

  it('names the sidebar toggle in the shared tooltip with the platform\'s shortcut', async () => {
    expect(hoverTip('#sbBtn')).toEqual(['收起/展开侧栏', '⌘B'])
    act(() => root!.unmount())
    fixture.platform = 'win32'
    await mount()
    expect(hoverTip('#sbBtn')).toEqual(['收起/展开侧栏', 'Ctrl+B'])
    fixture.platform = 'darwin'
  })

  it('names the sidebar grip in the shared tooltip by its action with ⌘B on macOS, with no drag hint and no tooltip of its own', () => {
    expect(hoverTip('#sbgrip')).toEqual(['收起侧栏', '⌘B'])
    expect(document.querySelector('[role="tooltip"] .tooltip-note')).toBeNull()
    expect(document.querySelector('#griptip')).toBeNull()
  })

  it('reports the paper chat as collapsed while the sidebar is collapsed', () => {
    const state = () => document.querySelector('#paperChatCollapsed')!.textContent
    expect(state()).toBe('false')
    press('b', { metaKey: true })
    expect(state()).toBe('true')
    press('b', { metaKey: true })
    expect(state()).toBe('false')
  })

  it('focuses the sidebar search with "/" only while the sidebar is shown', () => {
    press('/')
    expect(document.activeElement).toBe(search)
    search.blur()

    press('b', { metaKey: true })
    press('/')
    expect(document.activeElement).not.toBe(search)
  })
})

describe('AppShell title bar', () => {
  it('marks the document while the window is full screen, where macOS hides the traffic lights', async () => {
    await mount()
    const root = document.documentElement
    expect(root.hasAttribute('data-fullscreen')).toBe(false)
    act(() => fixture.fullScreen.forEach((handler) => handler(true)))
    expect(root.hasAttribute('data-fullscreen')).toBe(true)
    act(() => fixture.fullScreen.forEach((handler) => handler(false)))
    expect(root.hasAttribute('data-fullscreen')).toBe(false)
  })
})

describe('AppShell sidebar grip', () => {
  let grip: HTMLElement
  const width = () => (document.querySelector<HTMLElement>('#main')!.style.getPropertyValue('--sbw'))
  const mouse = (target: EventTarget, type: string, clientX = 0) => act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX }))
  })
  const key = (target: HTMLElement, name: string, init: KeyboardEventInit = {}) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }))
  })

  /** Mounts the shell with `feed` as its first screen, its sidebar laid out at the default 232px. */
  const setUp = async (feed?: ReactNode) => {
    await mount(feed)
    document.querySelector<HTMLElement>('#sidebar')!.getBoundingClientRect = () => ({ width: 232 }) as DOMRect
    grip = document.querySelector<HTMLElement>('#sbgrip')!
  }

  it('is a focusable separator that states the sidebar width and its limits', async () => {
    await setUp()
    expect(grip.getAttribute('role')).toBe('separator')
    expect(grip.getAttribute('aria-orientation')).toBe('vertical')
    expect(grip.tabIndex).toBe(0)
    expect(grip.getAttribute('aria-label')).toBe('侧栏宽度')
    expect([grip.getAttribute('aria-valuenow'), grip.getAttribute('aria-valuemin'), grip.getAttribute('aria-valuemax')])
      .toEqual(['232', '180', '320'])
  })

  it('leaves the sidebar open and its width unchanged after a press without moving', async () => {
    await setUp()
    mouse(grip, 'mousedown', 100)
    mouse(document, 'mousemove', 102)
    mouse(document, 'mouseup', 102)
    expect(document.querySelector('#main')!.classList.contains('sbhide')).toBe(false)
    expect(width()).toBe('232px')
  })

  it('puts the width back when Escape ends a drag, and that Escape closes no other layer', async () => {
    const close = vi.fn()
    await setUp(<Panel onClose={close} />)
    mouse(grip, 'mousedown', 100)
    mouse(document, 'mousemove', 160)
    expect(width()).toBe('292px')
    key(document.body, 'Escape')
    expect(width()).toBe('232px')
    expect(close).not.toHaveBeenCalled()
    mouse(document, 'mousemove', 200)
    mouse(document, 'mouseup', 200)
    expect(width()).toBe('232px')
  })

  it('steps the width with the arrow keys within its limits and resets it on a double-click', async () => {
    await setUp()
    key(grip, 'ArrowRight')
    expect(width()).toBe('242px')
    document.querySelector<HTMLElement>('#sidebar')!.getBoundingClientRect = () => ({ width: 242 }) as DOMRect
    key(grip, 'ArrowLeft', { shiftKey: true })
    expect(width()).toBe('192px')
    key(grip, 'End')
    expect(width()).toBe('320px')
    mouse(grip, 'dblclick')
    expect(width()).toBe('232px')
  })

  it('leaves an expand control with a visible glyph at the edge of the collapsed sidebar', async () => {
    await setUp()
    expect(document.querySelector('.grip-edge')).toBeNull()
    press('b', { metaKey: true })
    const edge = document.querySelector<HTMLButtonElement>('.grip-edge')!
    expect(edge.tagName).toBe('BUTTON')
    expect(edge.getAttribute('aria-label')).toBe('展开侧栏')
    expect(edge.getAttribute('aria-expanded')).toBe('false')
    expect(hoverTip('.grip-edge')).toEqual(['展开侧栏', '⌘B'])
    act(() => edge.click())
    expect(document.querySelector('#main')!.classList.contains('sbhide')).toBe(false)
    expect(document.querySelector('.grip-edge')).toBeNull()
  })
})

describe('AppShell keyboard navigation', () => {
  beforeEach(() => mount())

  it('takes the sidebar rows, from Feed to Trash, as one Tab stop with the up and down arrow keys between them', async () => {
    const nav = document.querySelector<HTMLElement>('#sidebar .sb-nav')!
    const stops = [...document.querySelectorAll<HTMLElement>('#sidebar *')].filter((element) => element.tabIndex >= 0)
    expect(stops).toEqual([
      document.querySelector('#sSearch'), nav, document.querySelector('[data-chat="c1"] .row-actions'), document.querySelector('#sbgrip'),
    ])
    const step = async (key: string) => {
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
        await new Promise((done) => setTimeout(done, 0))
      })
    }
    await act(async () => { nav.focus() })
    expect(document.activeElement).toBe(controlOf('[data-desk="feed"]'))
    await step('ArrowDown')
    expect(document.activeElement).toBe(controlOf('[data-sect="inbox"]'))
    await step('ArrowRight')
    expect(document.activeElement).toBe(controlOf('[data-sect="inbox"]'))
    await step('End')
    expect(document.activeElement).toBe(controlOf('[data-desk="trash"]'))
    await step('ArrowUp')
    expect(document.activeElement).toBe(controlOf('[data-desk="ideas"]'))
    await step('Home')
    expect(document.activeElement).toBe(controlOf('[data-desk="feed"]'))
  })

  it('opens every sidebar destination from a button', () => {
    const rows = [
      '[data-desk="later"]', '[data-desk="wiki"]', '[data-desk="papers"]', '[data-desk="changelog"]',
      '[data-desk="restl"]', '[data-desk="resproj"]', '[data-desk="ideas"]', '[data-desk="trash"]',
      '#rowInboxAll', '[data-inbox="discovery"]', '[data-watchrow="w-topic"]', '[data-discovery-project="p1"]',
      '[data-chat="c1"]', '[data-desk="feed"]',
    ]
    for (const selector of rows) {
      act(() => controlOf(selector).click())
      expect(document.querySelector(selector)!.classList.contains('on'), selector).toBe(true)
    }
  })

  it('folds each sidebar section from its heading button, and the new-chat button folds nothing', () => {
    for (const sect of ['inbox', 'chats', 'lib', 'research']) {
      const toggle = controlOf(`[data-sect="${sect}"]`)
      expect(toggle.getAttribute('aria-expanded'), sect).toBe('true')
      act(() => toggle.click())
      expect(toggle.getAttribute('aria-expanded'), sect).toBe('false')
      expect(document.querySelector(`#sect-${sect}`)!.classList.contains('closed'), sect).toBe(true)
      act(() => toggle.click())
    }
    act(() => document.querySelector<HTMLButtonElement>('[data-sect="chats"] .sb-add')!.click())
    expect(document.querySelector('#sect-chats')!.classList.contains('closed')).toBe(false)
  })

  it('folds the inbox groups from buttons without leaving the current screen', () => {
    const groups = [
      ['#rowInboxAll .sh-caret', '#g-inboxsub'],
      ['[data-inbox="discovery"] .sh-caret', '#g-discoverysub'],
      ['[data-disc="topics"]', '#g-topics'],
      ['[data-disc="authors"]', '#g-authors'],
    ] as const
    for (const [selector, group] of groups) {
      const toggle = document.querySelector<HTMLElement>(selector)!
      expect(toggle.tagName, selector).toBe('BUTTON')
      expect(toggle.getAttribute('aria-expanded'), selector).toBe('true')
      act(() => toggle.click())
      expect(toggle.getAttribute('aria-expanded'), selector).toBe('false')
      expect(document.querySelector(group)!.classList.contains('closed'), selector).toBe(true)
    }
    expect(crumbs()).toEqual(['动态'])
  })

  it('goes back through a linked breadcrumb segment that is a button', () => {
    act(() => document.querySelector<HTMLElement>('[data-desk="papers"]')!.click())
    expect(crumbs()).toEqual(['我的库', '论文', '深层'])
    const link = document.querySelector<HTMLElement>('#crumb .cseg.link')!
    expect(link.tagName).toBe('BUTTON')
    act(() => link.click())
    expect(fixture.back).toHaveBeenCalledOnce()
  })

  it('面包屑的每一段放不下时都淡出，返回的链接也一样，名字整段都在', () => {
    act(() => document.querySelector<HTMLElement>('[data-desk="papers"]')!.click())
    const faded = [...document.querySelectorAll<HTMLElement>('#crumb .cseg')]
      .map((segment) => (segment.matches('.fade-text') ? segment : segment.querySelector('.fade-text'))?.textContent)
    expect(faded).toEqual(['我的库', '论文', '深层'])
  })
})

/** Sends a success, then a refusal, through the shell's one notice. */
function Notifier() {
  const notice = useNotice()
  return (
    <>
      <button type="button" id="ok" onClick={() => notice.success('已保存')}>ok</button>
      <button type="button" id="no" onClick={() => notice.refusal('项目不存在：repro')}>no</button>
    </>
  )
}

describe('AppShell notice', () => {
  it('成功和拒绝都报在画布里同一个提示上，并被读出来', async () => {
    await mount(<Notifier />)
    act(() => host.querySelector<HTMLButtonElement>('#ok')!.click())
    const notice = host.querySelector<HTMLElement>('#notice')!
    expect(notice.closest('#main')).not.toBeNull()
    expect(notice.closest('[role="status"]')?.textContent).toBe('已保存')
    expect(notice.dataset['tone']).toBe('success')

    act(() => host.querySelector<HTMLButtonElement>('#no')!.click())
    expect(host.querySelectorAll('#notice')).toHaveLength(1)
    expect(notice.textContent).toBe('项目不存在：repro')
    expect(notice.dataset['tone']).toBe('refusal')
  })
})

describe('AppShell sidebar rows', () => {
  beforeEach(() => mount())

  it('names a watch, a discovery project and a chat in full in the shared tooltip, only while the row fades them out', () => {
    const names = {
      '[data-watchrow="w-topic"] .watch-name': '推测解码',
      '[data-discovery-project="p1"] .watch-name': '推理项目',
      '[data-chat="c1"] .ct-t': '讨论',
    }
    for (const [selector, name] of Object.entries(names)) {
      const text = document.querySelector<HTMLElement>(selector)!
      expect(text.hasAttribute('title'), selector).toBe(false)
      text.style.overflowX = 'hidden'
      const width = vi.spyOn(text, 'scrollWidth', 'get').mockReturnValue(100)
      vi.spyOn(text, 'clientWidth', 'get').mockReturnValue(100)
      expect(hoverTip(selector), selector).toEqual([undefined, undefined])
      act(() => {
        text.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }))
        text.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
      })
      act(() => { document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400, pointerType: 'mouse' })) })
      width.mockReturnValue(160)
      expect(hoverTip(selector), selector).toEqual([name, undefined])
      act(() => {
        text.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }))
        text.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
      })
      act(() => { document.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400, pointerType: 'mouse' })) })
    }
  })

  it('folds the delivery groups from inline icon buttons that state whether they are open', () => {
    for (const selector of ['#rowInboxAll .sh-caret', '[data-inbox="discovery"] .sh-caret']) {
      const toggle = document.querySelector<HTMLElement>(selector)!
      expect(toggle.classList.contains('icbtn'), selector).toBe(true)
      expect(toggle.classList.contains('xs'), selector).toBe(true)
      expect(toggle.getAttribute('aria-expanded'), selector).toBe('true')
    }
  })

  it('fades the sidebar\'s scroll area only toward the edge whose rows are hidden', () => {
    const top = document.querySelector<HTMLElement>('.sb-top')!
    let offset = 0
    Object.defineProperty(top, 'clientHeight', { configurable: true, get: () => 500 })
    Object.defineProperty(top, 'scrollHeight', { configurable: true, get: () => 700 })
    Object.defineProperty(top, 'scrollTop', { configurable: true, get: () => offset })
    act(() => { top.dispatchEvent(new Event('scroll')) })
    expect(top.dataset.fade).toBe('bottom')
    act(() => { offset = 200; top.dispatchEvent(new Event('scroll')) })
    expect(top.dataset.fade).toBe('top')
  })

  it('shows "/" as a keycap on the empty search field and names the shortcut on the field', () => {
    const search = document.querySelector<HTMLInputElement>('#sSearch')!
    const keycap = document.querySelector<HTMLElement>('#searchBox kbd')!
    expect(keycap.textContent).toBe('/')
    expect(keycap.getAttribute('aria-hidden')).toBe('true')
    expect(search.getAttribute('aria-keyshortcuts')).toBe('/')
  })
})

describe('AppShell Escape', () => {
  it('输入法组字时的 Esc 不收起最上层的面板，组完字后的 Esc 才收起', async () => {
    const close = vi.fn()
    await mount(<Panel onClose={close} />)
    const input = host.querySelector<HTMLInputElement>('.screenslot input')!
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })))
    expect(close).not.toHaveBeenCalled()

    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('AppShell "/" shortcut', () => {
  beforeAll(() => {
    // jsdom does not implement isContentEditable; this stands in for the browser's.
    Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
      configurable: true,
      get(this: HTMLElement) { return this.closest('[contenteditable="true"]') !== null },
    })
  })
  afterAll(() => { Reflect.deleteProperty(HTMLElement.prototype, 'isContentEditable') })

  beforeEach(async () => { await mount(<Editors />) })

  it('在 Markdown 编辑框和下拉框里按「/」照常输入，焦点不跳到搜索框', () => {
    const box = host.querySelector<HTMLElement>('.screenslot .md.src')!
    const select = host.querySelector<HTMLSelectElement>('.screenslot select')!
    for (const editable of [box, select]) {
      editable.focus()
      expect(slash(editable)).toBe(false)
      expect(document.activeElement).toBe(editable)
    }
  })

  it('焦点不在可编辑元素上时，「/」跳到搜索框', () => {
    const button = host.querySelector<HTMLButtonElement>('.screenslot button')!
    button.focus()
    expect(slash(button)).toBe(true)
    expect(document.activeElement).toBe(host.querySelector('#sSearch'))
  })
})

/** Shows the anchor of the jump aimed at its screen. */
/** A screen that scrolls and links to a project, as a feed run's name does. */
function LinkSource() {
  const { open } = useJump()
  return <div className="desk-body"><button type="button" id="toProject" onClick={() => open('project', 'p1')}>p1</button></div>
}

/** A screen a link lands on, with the back control a jump gives it. */
function BackTarget() {
  const { origin, back } = useJumpOrigin()
  return origin === null ? null : <button type="button" id="goBack" onClick={back}>back</button>
}

describe('AppShell jump and back', () => {
  it('按链接去别的屏再按返回,来的那一屏还是原来那个滚动区,停在原来滚到的位置', async () => {
    await mount(<LinkSource />, { project: <BackTarget /> })
    const scroller = document.querySelector<HTMLElement>('.screenslot:not([hidden]) .desk-body')!
    scroller.scrollTop = 160
    act(() => document.querySelector<HTMLButtonElement>('#toProject')!.click())
    expect(scroller.closest('.screenslot')!.hasAttribute('hidden')).toBe(true)
    act(() => document.querySelector<HTMLButtonElement>('#goBack')!.click())
    expect(document.querySelector('.screenslot:not([hidden]) .desk-body')).toBe(scroller)
    expect(scroller.scrollTop).toBe(160)
  })
})

function JumpProbe({ id }: { id: string }) {
  const { jump } = useJump()
  return <p id={id}>{JSON.stringify(jump?.anchor ?? null)}</p>
}

describe('AppShell command palette', () => {
  const palette = () => document.querySelector('.cmdk')
  /** Opens the palette from the native menu and chooses the command row labelled `label`. */
  const run = (label: string) => {
    act(() => fixture.openPalette!())
    const row = [...document.querySelectorAll<HTMLElement>('.cmdk .rrow')].find((r) => r.textContent?.startsWith(label))!
    act(() => { row.click() })
  }
  const shown = () => document.querySelector('.screenslot:not([hidden])')!.textContent

  beforeEach(() => { HTMLElement.prototype.scrollIntoView = () => {} })
  afterEach(() => { delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView })

  it('opens over the current screen from the native menu\'s 命令面板…, and ⌘K or Ctrl+K opens nothing', async () => {
    await mount()
    press('k', { metaKey: true })
    press('k', { ctrlKey: true })
    expect(palette()).toBeNull()
    act(() => fixture.openPalette!())
    expect(palette()).not.toBeNull()
    expect(document.activeElement?.id).toBe('cmdkq')
  })

  it('lists 命令面板… after 设置… in the App menu with ⇧⌘P on macOS and Ctrl+Shift+P elsewhere, and opens the palette from it', async () => {
    /** Opens the title bar's App menu and returns each item's label and shortcut. */
    const openMenu = () => {
      act(() => {
        document.querySelector('.appbtn')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      })
      return [...document.querySelectorAll('[data-appmenu] .mi')].map((item) => item.textContent)
    }
    await mount()
    expect(openMenu().slice(0, 2)).toEqual(['设置…⌘,', '命令面板…⇧⌘P'])
    const item = [...document.querySelectorAll<HTMLElement>('[data-appmenu] .mi')].find((mi) => mi.textContent?.startsWith('命令面板'))!
    await act(async () => {
      item.click()
      await new Promise((done) => setTimeout(done, 20))
    })
    expect(document.querySelector('[data-appmenu]')).toBeNull()
    expect(palette()).not.toBeNull()

    act(() => root!.unmount())
    fixture.platform = 'win32'
    await mount()
    expect(openMenu().slice(0, 2)).toEqual(['设置…Ctrl+,', '命令面板…Ctrl+Shift+P'])
    fixture.platform = 'darwin'
  })

  it('runs a new project, a PDF import, Settings and the sidebar screens from its commands', async () => {
    await mount(<SettingsProbe />, {
      project: <JumpProbe id="projectJump" />, papers: <JumpProbe id="papersJump" />, ideas: <p>ideas</p>,
    })

    run('新建项目')
    expect(palette()).toBeNull()
    expect(shown()).toBe('{"newProject":true}')
    run('导入 PDF')
    expect(shown()).toBe('{"importPdf":true}')
    run('想法')
    expect(shown()).toBe('ideas')
    run('设置…')
    expect(document.querySelector('#settingsProbe')!.textContent).toBe('default')
  })

  it('lists 设置 · <pane> right after 设置…, one per pane in the Settings side list\'s order, each opening Settings on its pane', async () => {
    const panes = [
      ['外观', 'appearance'], ['存储', 'storage'], ['API', 'api'], ['模型', 'model'], ['科研', 'research'],
      ['扩展', 'extensions'], ['论文推送', 'delivery'], ['关注', 'delivery-watch'], ['发现', 'delivery-discovery'],
      ['归档的对话', 'archived'],
    ]
    await mount(<SettingsProbe />)
    act(() => fixture.openPalette!())
    const labels = [...document.querySelectorAll('.cmdk .rrow')].map((row) => row.textContent)
    const settings = labels.indexOf('设置…⌘,')
    expect(labels.slice(settings + 1, settings + 1 + panes.length)).toEqual(panes.map(([name]) => `设置 · ${name}`))
    for (const [name, pane] of panes) {
      run(`设置 · ${name}`)
      expect(document.querySelector('#settingsProbe')!.textContent).toBe(pane)
    }
  })

  it('新建想法打开想法屏,带着打开新建想法编辑框的落点', async () => {
    await mount(undefined, { ideas: <JumpProbe id="ideasJump" /> })
    run('新建想法')
    expect(palette()).toBeNull()
    expect(shown()).toBe('{"newIdea":true}')
  })
})


describe('侧栏对话行的删除', () => {
  /** Opens the More menu of chat `id`'s sidebar row and returns its items. */
  async function chatMenu(id: string): Promise<HTMLElement[]> {
    await act(async () => {
      document.querySelector(`#chatList [data-chat="${id}"] .dots`)!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    return [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
  }

  beforeEach(() => {
    fixture.deleteChat.mockClear()
    fixture.restoreTrash.mockClear()
  })

  it('更多菜单里归档之后是标红的删除；删除不弹确认，提示已移入垃圾桶，撤销把垃圾桶里那一条放回', async () => {
    await mount()
    const items = await chatMenu('c1')
    expect(items.map((item) => [item.textContent, item.classList.contains('danger')])).toEqual([['归档', false], ['删除', true]])
    await act(async () => { items[1]!.click() })
    expect(fixture.deleteChat).toHaveBeenCalledExactlyOnceWith('c1')
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(document.querySelector('#notice .notice-text')!.textContent).toBe('已移入垃圾桶')
    const undo = document.querySelector<HTMLButtonElement>('#notice button')!
    expect(undo.textContent).toBe('撤销')
    await act(async () => { undo.click() })
    expect(fixture.restoreTrash).toHaveBeenCalledExactlyOnceWith('trash-9')
  })

  it('删掉对话屏正打开着的那段对话，像归档一样回到动态', async () => {
    await mount()
    await act(async () => { controlOf('#chatList [data-chat="c1"]').click() })
    expect(crumbs()).toEqual(['对话'])
    const items = await chatMenu('c1')
    await act(async () => { items.find((item) => item.textContent === '删除')!.click() })
    expect(crumbs()).toEqual(['动态'])
  })
})
