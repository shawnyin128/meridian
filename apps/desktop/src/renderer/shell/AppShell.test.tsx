// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownBox } from '../components/Markdown.js'
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

const { AppShell } = await import('./AppShell.js')

/** The feed screen of this probe: a Markdown editor being edited, a select, and a button. */
function Editors() {
  const box = useRef<HTMLDivElement>(null)
  return (
    <>
      <MarkdownBox text="a" editing box={box} onCancel={() => {}} empty={null} />
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

describe('AppShell "/" shortcut', () => {
  let root: Root
  let host: HTMLDivElement

  beforeAll(() => {
    // jsdom does not implement isContentEditable; this stands in for the browser's.
    Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
      configurable: true,
      get(this: HTMLElement) { return this.closest('[contenteditable="true"]') !== null },
    })
  })
  afterAll(() => { Reflect.deleteProperty(HTMLElement.prototype, 'isContentEditable') })

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const screens = {
      feed: <Editors />, inbox: null, later: null, papers: null, wiki: null, changelog: null,
      ideas: null, overview: null, project: null, trash: null, chat: null, reader: null,
    }
    await act(async () => {
      root.render(<MessagesProvider><AppShell screens={screens} settings={null} /></MessagesProvider>)
    })
  })
  afterEach(() => { act(() => root.unmount()) })

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
