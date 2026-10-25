// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { CommitActions } from './CommitActions.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('CommitActions', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const show = (actions: ReactNode) => act(() => root.render(<MessagesProvider>{actions}</MessagesProvider>))
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')]
  /** Each button as its text and classes. */
  const looks = () => buttons().map((button) => `${button.textContent} ${button.className}`)

  it('先取消后保存；对话框、浮层和表单的脚上是常规尺寸，保存是主操作', () => {
    show(<CommitActions place="foot" onCancel={vi.fn()} onSave={vi.fn()} />)
    expect(looks()).toEqual(['取消 btn', '保存 btn pri'])
  })

  it('标题的动作槽里和行、卡片里都是紧凑尺寸；这两处保存都不是主操作', () => {
    show(<CommitActions place="heading" onCancel={vi.fn()} onSave={vi.fn()} />)
    const heading = looks()
    show(<CommitActions place="item" onCancel={vi.fn()} onSave={vi.fn()} />)
    expect([heading, looks()]).toEqual([['取消 btn sm', '保存 btn sm'], ['取消 btn sm', '保存 btn sm']])
  })

  it('没有取消时只有保存；保存可以换一个说法', () => {
    show(<CommitActions place="item" onSave={vi.fn()} saveLabel="添加" />)
    expect(looks()).toEqual(['添加 btn sm'])
  })

  it('按下各自的那一个，存不了时保存按不了', () => {
    const onCancel = vi.fn()
    const onSave = vi.fn()
    show(<CommitActions place="heading" onCancel={onCancel} onSave={onSave} canSave={false} />)
    act(() => buttons().forEach((button) => button.click()))
    expect([onCancel.mock.calls.length, onSave.mock.calls.length, buttons().map((button) => button.disabled)])
      .toEqual([1, 0, [false, true]])
  })

  it('正在保存时两个都按不了，保存原处转圈，名字是正在保存的说法', () => {
    show(<CommitActions place="foot" onCancel={vi.fn()} onSave={vi.fn()} saving />)
    const [cancel, save] = buttons()
    expect([cancel!.disabled, save!.disabled, save!.getAttribute('aria-busy'), save!.getAttribute('aria-label'), save!.querySelector('.ring') !== null])
      .toEqual([true, true, 'true', '正在保存…', true])
    show(<CommitActions place="foot" onSave={vi.fn()} saving busyLabel="正在连接…" />)
    expect(buttons()[0]!.getAttribute('aria-label')).toBe('正在连接…')
  })

  it('没有 onSave 时保存提交它所在的表单，或 form 指定的那一个', () => {
    show(<CommitActions place="foot" onCancel={vi.fn()} form="workspaceSsh" saveLabel="连接" />)
    const [cancel, save] = buttons()
    expect([cancel!.type, save!.type, save!.getAttribute('form')]).toEqual(['button', 'submit', 'workspaceSsh'])
  })

  it('保存成功时保存原处短暂显示对勾，名字是已保存', () => {
    show(<CommitActions place="foot" onSave={vi.fn()} done />)
    expect([buttons()[0]!.getAttribute('aria-label'), buttons()[0]!.querySelector('.cki') !== null]).toEqual(['已保存', true])
  })
})
