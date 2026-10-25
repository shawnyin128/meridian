// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { FilterMenu } from './FilterMenu.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('FilterMenu', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.unstubAllGlobals()
  })

  /** The trigger of a reading-status filter with `current` picked: the text it reads and the labels it keeps room for. */
  const trigger = (current: string | null) => {
    act(() => root!.render(
      <MessagesProvider>
        <FilterMenu
          name="阅读状态" label="按阅读状态筛选" all="全部" current={current} onPick={() => {}}
          options={[{ value: 'unread', label: '未读' }, { value: 'read', label: '已读' }]}
        />
      </MessagesProvider>,
    ))
    const button = host.querySelector<HTMLButtonElement>('.filter-menu')!
    return {
      text: button.textContent,
      room: [...button.querySelectorAll<HTMLElement>('.filter-menu-ghost')].map((ghost) => `${ghost.dataset.label} ${ghost.getAttribute('aria-hidden')}`),
    }
  }

  it('keeps room in its trigger for its name and every option, unread and unpainted, so picking never changes its width', () => {
    const room = ['阅读状态 true', '未读 true', '已读 true']
    expect([trigger(null), trigger('read')]).toEqual([{ text: '阅读状态', room }, { text: '已读', room }])
  })
})
