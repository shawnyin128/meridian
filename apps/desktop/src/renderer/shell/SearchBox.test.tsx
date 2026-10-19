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
  { kind: 'project', title: '项目：推测解码', meta: '进行中', target: 'p1' },
  { kind: 'aggregation', title: '主题：推测解码', meta: '3 篇', target: 'topics/sd' },
  { kind: 'chat', title: '对话：草稿', meta: '1 条', target: 'c1' },
]

vi.mock('../ipc.js', () => ({ search: { query: () => Promise.resolve(HITS) } }))

const { SearchBox } = await import('./SearchBox.js')

/** Types `value` into the search field and lets the results arrive. */
async function type(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('#sSearch')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
}

describe('SearchBox', () => {
  let root: Root | null = null

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.id === 'searchBox') return DOMRect.fromRect({ x: 12, y: 40, width: 220, height: 30 })
      if (this.id === 'sSearch') return DOMRect.fromRect({ x: 42, y: 45, width: 170, height: 20 })
      return DOMRect.fromRect()
    })
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<MessagesProvider><SearchBox onJump={() => {}} /></MessagesProvider>))
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.restoreAllMocks()
  })

  it('结果面板按整个搜索框对齐,不按框里那段输入', async () => {
    await type('推测')
    const wrapper = document.querySelector<HTMLElement>('[data-radix-popper-content-wrapper]')!
    expect(wrapper.style.getPropertyValue('--radix-popper-anchor-width')).toBe('220px')
    expect(wrapper.style.transform).toMatch(/^translate\(12px, /)
  })

  it('指针移到的结果就是唯一高亮的当前行,方向键从它往下走', async () => {
    await type('推测')
    const rows = () => [...document.querySelectorAll<HTMLElement>('#sRes .rrow')]
    const lit = () => rows().map((row) => row.classList.contains('on'))
    await act(async () => { rows()[1]!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })) })
    expect(lit()).toEqual([false, true, false])

    const input = document.querySelector<HTMLInputElement>('#sSearch')!
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
    expect(lit()).toEqual([false, false, true])
  })
})
