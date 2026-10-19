// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
}))

const none = () => Promise.resolve([])

vi.mock('../ipc.js', () => ({
  appMenu: {
    onOpenSettings: () => () => {}, onOpenAgentTutorial: () => () => {}, platform: () => 'darwin',
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

const { AppShell, useCrumbTail, usePaperChatCollapsed } = await import('./AppShell.js')

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

async function mount(): Promise<void> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<MessagesProvider><AppShell screens={SCREENS} settings={null} /></MessagesProvider>)
    await Promise.resolve()
  })
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

describe('AppShell keyboard navigation', () => {
  beforeEach(mount)

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
