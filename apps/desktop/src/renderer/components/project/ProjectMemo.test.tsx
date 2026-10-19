// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { ProjectMemo } from './ProjectSections.js'

describe('ProjectMemo', () => {
  it('编辑的位置换成取消和保存:取消还原不写,⌘回车和保存写回', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const onSave = vi.fn()
    function Memo() {
      const [editing, setEditing] = useState(false)
      return <ProjectMemo text="本周计划" editing={editing} onEditing={setEditing} onSave={onSave} onOpen={vi.fn()} />
    }
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<MessagesProvider><Memo /></MessagesProvider>))
    const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('.section-heading-actions > .btn')]
    const press = (text: string) => act(() => buttons().find((button) => button.textContent === text)!.click())
    const type = (text: string) => {
      Object.defineProperty(host.querySelector('.md.src')!, 'innerText', { value: text, configurable: true })
    }

    press('编辑')
    expect(buttons().map((button) => button.textContent)).toEqual(['取消', '保存'])
    type('改过的计划')
    press('取消')
    expect(onSave).not.toHaveBeenCalled()
    expect(host.querySelector('.memo')!.textContent).toBe('本周计划')
    press('编辑')
    type('改过的计划')
    act(() => {
      host.querySelector('.md.src')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    })
    expect(onSave).toHaveBeenCalledWith('改过的计划')
    press('编辑')
    type('再改一次')
    press('保存')
    expect(onSave).toHaveBeenLastCalledWith('再改一次')
    act(() => root.unmount())
    host.remove()
  })
})
