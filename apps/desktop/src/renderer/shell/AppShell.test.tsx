// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from './language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const none = () => Promise.resolve([])

vi.mock('../ipc.js', () => ({
  appMenu: {
    onOpenSettings: () => () => {}, onOpenAgentTutorial: () => () => {}, platform: () => 'darwin',
    setTitleBarTheme: vi.fn(), toggleMaximize: vi.fn(),
  },
  appUpdates: { check: vi.fn(), status: () => new Promise(() => {}), onChange: () => () => {}, install: vi.fn() },
  changelog: { list: none },
  chat: { list: none, create: vi.fn(), setArchived: vi.fn() },
  extensions: { checkLatest: vi.fn() },
  idea: { list: none },
  inbox: { list: none },
  jobs: { status: () => new Promise(() => {}) },
  later: { list: none },
  papers: { list: () => Promise.resolve({ rows: [], total: 0 }) },
  project: { list: none },
  search: { query: none },
  trash: { list: none },
  vault: { today: () => Promise.resolve('2026-10-18') },
  watch: { list: none },
  wiki: { home: () => Promise.resolve({ aggregationCount: 0 }) },
}))

const { AppShell, usePaperChatCollapsed } = await import('./AppShell.js')

/** Shows whether the shell reports the Reader's paper chat as collapsed. */
function PaperChatState() {
  return <p id="paperChatCollapsed">{String(usePaperChatCollapsed())}</p>
}

const SCREENS = {
  feed: <PaperChatState />, inbox: null, later: null, papers: null, wiki: null, changelog: null, ideas: null,
  overview: null, project: null, trash: null, chat: null, reader: null,
}

describe('AppShell sidebar collapse', () => {
  let root: Root | null = null
  let sidebar: HTMLElement
  let search: HTMLInputElement

  beforeEach(async () => {
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
    sidebar = document.querySelector<HTMLElement>('#sidebar')!
    search = document.querySelector<HTMLInputElement>('#sSearch')!
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  const press = (key: string, init: KeyboardEventInit = {}) => act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
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
