// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../../shell/language.js'
import { IdeaEditorDialog } from './IdeaEditorDialog.js'

describe('IdeaEditorDialog', () => {
  beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  it('只有来源、标题和想法两栏，不写一句说明这里存什么', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MessagesProvider>
        <IdeaEditorDialog open sourceLabel="Draft trees · 对话" onOpenChange={vi.fn()} onSubmit={vi.fn()} />
      </MessagesProvider>,
    ))
    const dialog = document.querySelector('.idea-dialog')!
    expect([...dialog.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['来源：Draft trees · 对话'])
    expect(dialog.querySelector('textarea')!.placeholder).toBe('机制、假设或方向…')
    act(() => root.unmount())
    host.remove()
  })
})
