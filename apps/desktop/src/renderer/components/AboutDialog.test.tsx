// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateStatus } from '../../shared/app-update.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const update = vi.hoisted(() => ({ status: null as AppUpdateStatus | null }))

vi.mock('../ipc.js', () => ({
  appUpdates: { status: () => Promise.resolve(update.status), onChange: () => () => {}, check: vi.fn(), install: vi.fn() },
  extensions: { checkLatest: vi.fn() },
}))

const { AboutDialog } = await import('./AboutDialog.js')

describe('AboutDialog', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // The dialog watches its scroll area's size, and jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  /** The update line of the About dialog opened on `status`. */
  const statusLine = async (status: AppUpdateStatus) => {
    update.status = status
    await act(async () => { root.render(<MessagesProvider><AboutDialog open onOpenChange={() => {}} /></MessagesProvider>) })
    return document.querySelector<HTMLElement>('.about-status')!
  }

  it('检查更新失败时更新那一行是共享的错误框', async () => {
    const line = await statusLine({ phase: 'error', reason: 'server', current: '0.0.19000' })
    expect([line.matches('.inline-message--box.inline-message--error[role="alert"]'), line.textContent])
      .toEqual([true, '检查更新失败：服务器出错'])
  })

  it('已是最新时是带对勾的完成提示框', async () => {
    const line = await statusLine({ phase: 'latest', current: '0.0.19000' })
    expect([line.matches('.inline-message--box.inline-message--done[role="status"]'), line.querySelector('.inline-message-lead svg') !== null,
      line.querySelector('.inline-message-text')?.textContent]).toEqual([true, true, '已是最新版本'])
  })

  it('检查中时提示框里是载入占位，不写一句正在检查', async () => {
    const line = await statusLine({ phase: 'checking', current: '0.0.19000' })
    expect([line.querySelector('.inline-message-text .loading-placeholder') !== null, line.textContent, line.querySelector('.ring')])
      .toEqual([true, '', null])
  })

  it('下载中时提示框自己的底从左填到下载的进度', async () => {
    const line = await statusLine({ phase: 'downloading', version: '0.0.20000', percent: 40, current: '0.0.19000' })
    expect([line.matches('.inline-message--info.progress-host'), line.firstElementChild?.className,
      line.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')]).toEqual([true, 'progress-fill', '40'])
  })
})
