// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { Button } from './Button.js'
import { PanelBody, PanelHead, SidePanel } from './SidePanel.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('SidePanel', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  const render = (node: ReactNode) => act(() => root.render(<MessagesProvider>{node}</MessagesProvider>))

  it('面板头里标题在前,动作和收起钮在后;收起钮和头里的其他按钮一样是紧凑尺寸,点它收起面板', () => {
    const onClose = vi.fn()
    render(
      <SidePanel surface="card">
        <PanelHead title="宽树实验" actions={<Button size="compact">写入 Wiki</Button>} onClose={onClose} />
        <PanelBody>正文</PanelBody>
      </SidePanel>,
    )
    const head = host.querySelector('.panel-head')!
    expect([...head.children].map((child) => child.className)).toEqual(['panel-head-title', 'panel-head-actions'])
    expect([...head.querySelectorAll('button')].map((button) => [button.textContent || button.getAttribute('aria-label'), button.className]))
      .toEqual([['写入 Wiki', 'btn sm'], ['收起详情', 'icbtn sm panel-close']])
    act(() => head.querySelector<HTMLButtonElement>('.panel-close')!.click())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('面板是一个以标题命名的侧栏区域;没有面板头时用给的名字', () => {
    render(
      <>
        <SidePanel surface="card" className="probe-a"><PanelHead title="宽树实验" onClose={vi.fn()} /></SidePanel>
        <SidePanel surface="edge" label="阅读笔记" className="probe-b"><p>笔记</p></SidePanel>
      </>,
    )
    const titled = host.querySelector('aside.probe-a')!
    expect(titled.className).toBe('side-panel side-panel--card probe-a')
    expect(document.getElementById(titled.getAttribute('aria-labelledby')!)!.textContent).toBe('宽树实验')
    const labelled = host.querySelector('aside.probe-b')!
    expect([labelled.className, labelled.getAttribute('aria-label'), labelled.hasAttribute('aria-labelledby')])
      .toEqual(['side-panel side-panel--edge probe-b', '阅读笔记', false])
  })

  it('正文在面板头下面自己滚动,头留在顶上', () => {
    render(
      <SidePanel surface="edge">
        <PanelHead title="论文" onClose={vi.fn()} />
        <PanelBody className="probe">正文</PanelBody>
      </SidePanel>,
    )
    const content = host.querySelector('.side-panel > .side-panel-content')!
    expect([...content.children].map((child) => child.className)).toEqual(['panel-head', 'scroll-area scroll-area--y panel-body probe'])
  })
})
