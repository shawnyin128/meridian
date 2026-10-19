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
  platform: 'darwin',
}))

const none = () => Promise.resolve([])

vi.mock('../ipc.js', () => ({
  appMenu: {
    onOpenSettings: () => () => {}, onOpenAgentTutorial: () => () => {}, platform: () => fixture.platform,
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
