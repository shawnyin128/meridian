// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from './language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

vi.mock('../ipc.js', () => {
  const none = () => Promise.resolve([])
  return {
    appMenu: {
      onOpenSettings: () => () => {}, onOpenAgentTutorial: () => () => {},
      platform: () => 'darwin', setTitleBarTheme: () => {}, toggleMaximize: () => {},
    },
    appUpdates: { check: vi.fn() },
    extensions: { checkLatest: vi.fn() },
    vault: { today: () => Promise.resolve('2026-10-18') },
    papers: { list: () => Promise.resolve({ rows: [], total: 0 }) },
    project: { list: none },
    trash: { list: none },
    changelog: { list: none },
    wiki: { home: () => Promise.resolve({ aggregationCount: 0 }) },
    watch: { list: none },
    chat: { list: none },
    later: { list: none },
    inbox: { list: none },
    idea: { list: none },
    jobs: { status: () => new Promise(() => {}) },
  }
})
vi.mock('./Sidebar.js', () => ({ Sidebar: () => <input id="sSearch" /> }))
vi.mock('../components/AboutDialog.js', () => ({ AboutDialog: () => null }))

const { AppShell, useEscapeLayer } = await import('./AppShell.js')

let root: Root
let host: HTMLDivElement

/** Mounts the shell with `feed` as the content of its first screen. */
async function mount(feed: ReactNode): Promise<void> {
  const screens = {
    feed, inbox: null, later: null, papers: null, wiki: null, changelog: null,
    ideas: null, overview: null, project: null, trash: null, chat: null, reader: null,
  }
  await act(async () => {
    root.render(<MessagesProvider><AppShell screens={screens} settings={null} /></MessagesProvider>)
  })
}

/** A panel that Escape closes, as a detail panel is, with a field inside it. */
function Panel({ onClose }: { onClose: () => void }) {
  useEscapeLayer(true, onClose)
  return <input aria-label="名称" />
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()) })

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
