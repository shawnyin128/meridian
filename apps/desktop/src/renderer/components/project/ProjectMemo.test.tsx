// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editText, useDrafts, type EditDraft } from '../../hooks/useDrafts.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectMemo } from './ProjectSections.js'

describe('ProjectMemo', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('编辑的位置换成取消和保存:编辑器里是随笔原文,取消还原不写,再编辑从原文开始;⌘回车和保存写回编辑器里的原文', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('meridian', { platform: 'darwin' })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const onSave = vi.fn()
    function Memo() {
      return <ProjectMemo edit={editText(useDrafts<EditDraft>(['project', 'p1']), 'memo', '# 本周计划')} onSave={onSave} onOpen={vi.fn()} />
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
      editor().contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    })
    expect(onSave).toHaveBeenCalledWith('改过的计划\n## 小结')
    press('编辑')
    type('再改一次')
    press('保存')
    expect(onSave).toHaveBeenLastCalledWith('再改一次')
    act(() => root.unmount())
    host.remove()
  })

  it('有留着的草稿时随笔再出现就开在编辑里,是草稿的字;库里的随笔在这之后被改过时,保存按不动,⌘回车也不写', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('meridian', { platform: 'darwin' })
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const onSave = vi.fn()
    /** The project page: it holds the drafts, and shows the memo of stored text `stored` while `shown`. */
    function Page({ stored, shown }: { stored: string; shown: boolean }) {
      const drafts = useDrafts<EditDraft>(['project', 'p1'])
      return shown ? <ProjectMemo edit={editText(drafts, 'memo', stored)} onSave={onSave} onOpen={vi.fn()} /> : null
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const show = (stored: string, shown = true) => act(() => root.render(<MessagesProvider><Page stored={stored} shown={shown} /></MessagesProvider>))
    const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('.section-heading-actions > .btn')]
    const editor = () => EditorView.findFromDOM(host.querySelector<HTMLElement>('.memo .cm-editor')!)!
    show('# 原来的随笔')
    act(() => buttons().find((button) => button.textContent === '编辑')!.click())
    act(() => editor().dispatch({ changes: { from: 0, to: editor().state.doc.length, insert: '没存的随笔' }, userEvent: 'input.type' }))
    show('# 原来的随笔', false)
    show('# 原来的随笔')
    expect(editor().state.doc.toString()).toBe('没存的随笔')
    expect(buttons().map((button) => [button.textContent, button.disabled])).toEqual([['取消', false], ['保存', false]])

    show('# 插件改过的随笔')
    expect(buttons().map((button) => [button.textContent, button.disabled])).toEqual([['取消', false], ['保存', true]])
    act(() => {
      editor().contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    })
    expect(onSave).not.toHaveBeenCalled()
    act(() => root.unmount())
    host.remove()
  })
})
