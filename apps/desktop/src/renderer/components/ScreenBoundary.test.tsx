// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { ScreenBoundary } from './ScreenBoundary.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** A child whose failure can be switched off, so retry has something different to render. */
let failing = true
function Unstable() {
  if (failing) throw new Error('日期格式不对')
  return <p>项目详情</p>
}

describe('ScreenBoundary', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    failing = true
    // React reports every caught error through console.error; the test owns that channel instead.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
    vi.restoreAllMocks()
  })

  it('替下崩掉的子树，把真实错误文本放进一条 alert 里', () => {
    act(() => root!.render(
      <MessagesProvider><ScreenBoundary><Unstable /></ScreenBoundary></MessagesProvider>,
    ))

    expect(host.textContent).not.toContain('项目详情')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('日期格式不对')
    expect(console.error).toHaveBeenCalled()
  })

  it('重试后重新挂载子树，不再失败时就回到正常内容', () => {
    act(() => root!.render(
      <MessagesProvider><ScreenBoundary><Unstable /></ScreenBoundary></MessagesProvider>,
    ))
    failing = false
    const retry = Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent === '重试')
    expect(retry).toBeDefined()

    act(() => retry!.click())

    expect(host.textContent).toContain('项目详情')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('一个屏崩了不影响并排的另一个屏', () => {
    act(() => root!.render(
      <MessagesProvider>
        <ScreenBoundary><Unstable /></ScreenBoundary>
        <ScreenBoundary><p>论文库</p></ScreenBoundary>
      </MessagesProvider>,
    ))

    expect(host.textContent).toContain('论文库')
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1)
  })
})
