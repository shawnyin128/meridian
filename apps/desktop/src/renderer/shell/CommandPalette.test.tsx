// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchHit } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from './language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const HITS: SearchHit[] = [
  { kind: 'project', title: '项目：论文复现', meta: '进行中', target: 'p1' },
  { kind: 'paper', title: '论文：EAGLE', meta: '2024 arXiv', target: 'eagle', pdf: true, snippet: '这篇论文的草稿头' },
]

vi.mock('../ipc.js', () => ({ search: { query: (q: string) => Promise.resolve(q === '无此词' ? [] : HITS) } }))

const { CommandPalette } = await import('./CommandPalette.js')

/** Types `value` into the palette's field and lets the hits arrive. */
async function type(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('#cmdkq')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
}

/** Presses `key` in the palette's field; returns whether the keydown's default action was prevented. */
async function press(key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  const input = document.querySelector<HTMLInputElement>('#cmdkq')!
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  await act(async () => { input.dispatchEvent(event) })
  return event.defaultPrevented
}

const rows = () => [...document.querySelectorAll<HTMLElement>('.cmdk .rrow')]
const lit = () => rows().map((row) => row.classList.contains('on'))

describe('CommandPalette', () => {
  let root: Root | null = null
  let ran: string[]
  let opened: SearchHit[]
  let open: boolean[]

  /** Renders a button and the palette, open or closed, with three commands that note when they run. */
  const render = (shown: boolean) => act(() => root!.render(
    <MessagesProvider>
      <button type="button" id="opener" />
      <CommandPalette
        open={shown} onOpenChange={(next) => { open.push(next) }} onHit={(hit) => { opened.push(hit) }}
        commands={['新建项目', '设置…', '论文'].map((label) => ({ label, run: () => { ran.push(label) } }))}
      />
    </MessagesProvider>,
  ))

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    // jsdom lays nothing out and has no scrollIntoView.
    HTMLElement.prototype.scrollIntoView = () => {}
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    ran = []
    opened = []
    open = []
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    render(true)
  })

  afterEach(() => {
    act(() => root!.unmount())
    root = null
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    vi.unstubAllGlobals()
  })

  it('开着时焦点在输入框里,空着列出全部命令,打字只留标签里有这几个字的命令,后面跟着搜索结果', async () => {
    expect(document.activeElement?.id).toBe('cmdkq')
    expect(rows().map((row) => row.textContent)).toEqual(['新建项目', '设置…', '论文'])
    await type('论文')
    expect(rows().map((row) => row.querySelector('.rt')?.textContent ?? row.textContent))
      .toEqual(['论文', '项目：论文复现', '论文：EAGLE'])
    expect(rows()[2]!.querySelector('.rm')!.textContent).toBe('这篇论文的草稿头')
  })

  it('方向键和指针移的是同一行,Enter 收起面板再跑那一行的命令', async () => {
    await act(async () => { rows()[2]!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })) })
    expect(lit()).toEqual([false, false, true])
    await press('ArrowUp')
    expect(lit()).toEqual([false, true, false])
    // The Enter is spent on the row, so it cannot also press what the command opens, such as a dialog's close button.
    expect(await press('Enter')).toBe(true)
    expect(open).toEqual([false])
    expect(ran).toEqual(['设置…'])
  })

  it('输入法组字时的 Enter 只确认组字,不跑命令', async () => {
    expect(await press('Enter', { isComposing: true })).toBe(false)
    expect(ran).toEqual([])
  })

  it('选中一条搜索结果,收起面板并把它交出去', async () => {
    await type('论文')
    await act(async () => { rows()[1]!.click() })
    expect(open).toEqual([false])
    expect(opened).toEqual([HITS[0]])
    expect(ran).toEqual([])
  })

  it('命令与搜索都没有时写没有找到;Esc 收起面板', async () => {
    await type('无此词')
    expect(rows()).toHaveLength(0)
    expect(document.querySelector('.cmdk .empty-state')?.textContent).toBe('没有找到匹配的内容')
    await press('Escape')
    expect(open).toEqual([false])
  })

  it('重新打开时输入框是空的', async () => {
    await type('论文')
    render(false)
    render(true)
    expect(document.querySelector<HTMLInputElement>('#cmdkq')!.value).toBe('')
    expect(rows()).toHaveLength(3)
  })

  it('Esc 把焦点还给打开面板前的地方;选中一行则不还,焦点交给那一行去的地方', async () => {
    render(false)
    const opener = document.querySelector<HTMLButtonElement>('#opener')!
    opener.focus()
    render(true)
    await press('Escape')
    render(false)
    expect(document.activeElement).toBe(opener)

    render(true)
    await press('Enter')
    render(false)
    await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
    expect(ran).toEqual(['新建项目'])
    expect(document.activeElement).not.toBe(opener)
  })
})

