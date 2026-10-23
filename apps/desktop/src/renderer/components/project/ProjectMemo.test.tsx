// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectMemo } from './ProjectSections.js'

describe('ProjectMemo', () => {
  it('编辑的位置换成取消和保存:编辑器里是随笔原文,取消还原不写,再编辑从原文开始;⌘回车和保存写回编辑器里的原文', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const onSave = vi.fn()
    function Memo() {
      const [editing, setEditing] = useState(false)
      return <ProjectMemo text="# 本周计划" editing={editing} onEditing={setEditing} onSave={onSave} onOpen={vi.fn()} />
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><Memo /></MessagesProvider>))
    const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('.section-heading-actions > .btn')]
    const press = (text: string) => act(() => buttons().find((button) => button.textContent === text)!.click())
    const editor = () => EditorView.findFromDOM(host.querySelector<HTMLElement>('.memo .cm-editor')!)!
    const type = (text: string) => act(() => {
      const view = editor()
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.type' })
    })

    press('编辑')
    expect(buttons().map((button) => button.textContent)).toEqual(['取消', '保存'])
    expect(editor().state.doc.toString()).toBe('# 本周计划')
    expect(document.activeElement).toBe(editor().contentDOM)
    type('改过的计划')
    press('取消')
    expect(onSave).not.toHaveBeenCalled()
    expect(host.querySelector('.memo .cm-editor')).toBeNull()
    expect(host.querySelector('.memo h1')!.textContent).toBe('本周计划')

    press('编辑')
    expect(editor().state.doc.toString()).toBe('# 本周计划')
    press('保存')
    expect(onSave).toHaveBeenLastCalledWith('# 本周计划')
    press('编辑')
    type('改过的计划\n## 小结')
    act(() => {
      editor().contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    })
    expect(onSave).toHaveBeenCalledWith('改过的计划\n## 小结')
    press('编辑')
    type('再改一次')
    press('保存')
    expect(onSave).toHaveBeenLastCalledWith('再改一次')
    act(() => root.unmount())
    host.remove()
  })
})
