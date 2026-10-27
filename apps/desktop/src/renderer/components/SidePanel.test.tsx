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

  it('面板头带 rename 时点标题就地改名:静止时整段换行不淡出,编辑框也换行;回车存下,Esc 不改,清空了不改且标红', async () => {
    const onSave = vi.fn<(title: string) => boolean>(() => true)
    const title = '汇总今天的宽度扫描结果并把每个树宽下的接受率整理成一张对比表'
    render(
      <SidePanel surface="card">
        <PanelHead
          title={title} onClose={vi.fn()}
          rename={{ label: '标题', value: title, keep: { scope: ['idea', 'idea-1'], target: 'title-rename' }, onSave }}
        />
      </SidePanel>,
    )
    const head = () => host.querySelector<HTMLElement>('.panel-head-title')!
    const field = () => head().querySelector<HTMLTextAreaElement>('textarea.metadata-input')
    const press = (key: string) => act(() => {
      field()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    })
    const type = (value: string) => act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(field()!, value)
      field()!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const edit = () => act(() => head().querySelector<HTMLButtonElement>('.metadata-editable')!.click())

    expect([head().textContent, head().querySelector('.fade-text'), head().querySelector('.metadata-field--title')]).toEqual([title, null, null])
    edit()
    expect([field()!.value, field()!.classList.contains('multiline'), field()!.classList.contains('form-control-inline')])
      .toEqual([title, true, true])
    type('宽度扫描对比表')
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect(onSave).toHaveBeenCalledExactlyOnceWith('宽度扫描对比表')

    edit()
    type('不要的名字')
    press('Escape')
    expect(field()).toBeNull()
    edit()
    type('   ')
    press('Enter')
    await act(async () => { await Promise.resolve() })
    expect([field()!.getAttribute('aria-invalid'), onSave.mock.calls.length]).toEqual(['true', 1])
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
