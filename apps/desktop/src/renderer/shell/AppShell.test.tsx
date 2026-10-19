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
  chats: [{ id: 'c1', title: '讨论', archived: false, messageCount: 1 }],
  back: vi.fn(),
  fullScreen: [] as ((on: boolean) => void)[],
}))

const none = () => Promise.resolve([])

vi.mock('../ipc.js', () => ({
  appMenu: {
    onOpenSettings: () => () => {}, onOpenAgentTutorial: () => () => {}, platform: () => 'darwin',
    onFullScreen: (handler: (on: boolean) => void) => {
      fixture.fullScreen.push(handler)
      return () => { fixture.fullScreen.splice(fixture.fullScreen.indexOf(handler), 1) }
    },
    setTitleBarTheme: vi.fn(), toggleMaximize: vi.fn(),
  },
  appUpdates: { check: vi.fn(), status: () => new Promise(() => {}), onChange: () => () => {}, install: vi.fn() },
  changelog: { list: none },
  chat: {
    list: () => Promise.resolve(fixture.chats), create: () => new Promise(() => {}), setArchived: vi.fn(),
  },
  extensions: { checkLatest: vi.fn() },
  idea: { list: none },
  inbox: { list: ({ kind }: { kind: string }) => Promise.resolve(kind === 'discovery' ? fixture.discovery : []) },
  jobs: { status: () => new Promise(() => {}) },
  later: { list: none },
  papers: { list: () => Promise.resolve({ rows: [], total: 0 }) },
  project: { list: () => Promise.resolve(fixture.projects) },
  search: { query: none },
  trash: { list: none },
  vault: { today: () => Promise.resolve('2026-10-18') },
  watch: { list: () => Promise.resolve(fixture.watches) },
  wiki: { home: () => Promise.resolve({ aggregationCount: 0 }) },
}))
vi.mock('../components/AboutDialog.js', () => ({ AboutDialog: () => null }))

const { AppShell, useCrumbTail, useEscapeLayer, usePaperChatCollapsed } = await import('./AppShell.js')

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

/** Mounts the shell with `feed` as the content of its first screen. */
async function mount(feed: ReactNode = <PaperChatState />): Promise<void> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<MessagesProvider><AppShell screens={{ ...SCREENS, feed }} settings={null} /></MessagesProvider>)
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
})

const press = (key: string, init: KeyboardEventInit = {}) => act(() => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
})

const crumbs = () => [...document.querySelectorAll('#crumb .cseg')].map((seg) => seg.textContent)

/** The button that activates a row: the row itself, or the first child of a row that holds other controls. */
function controlOf(selector: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(selector)!
  const control = row.tagName === 'BUTTON' ? row : row.firstElementChild as HTMLElement
  expect(control.tagName, selector).toBe('BUTTON')
  return control
}

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
    act(() => edge.click())
    expect(document.querySelector('#main')!.classList.contains('sbhide')).toBe(false)
    expect(document.querySelector('.grip-edge')).toBeNull()
  })
})

describe('AppShell keyboard navigation', () => {
  beforeEach(() => mount())

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
})

describe('AppShell sidebar rows', () => {
  beforeEach(() => mount())

  it('names a watch, a discovery project and a chat in full on hover, where the row fades them out', () => {
    expect(document.querySelector('[data-watchrow="w-topic"] .watch-name')!.getAttribute('title')).toBe('推测解码')
    expect(document.querySelector('[data-discovery-project="p1"] .watch-name')!.getAttribute('title')).toBe('推理项目')
    expect(document.querySelector('[data-chat="c1"] .ct-t')!.getAttribute('title')).toBe('讨论')
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
