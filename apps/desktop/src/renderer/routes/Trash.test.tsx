// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrashEntry } from '../../shared/contract.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const api = vi.hoisted(() => ({
  entries: [{
    id: 'trash-1', kind: 'paper', title: 'Draft trees', deletedAt: Date.parse('2026-08-25T00:00:00Z'),
    restorable: true,
  }] as TrashEntry[],
  purge: vi.fn(async () => {}),
}))

vi.mock('../ipc.js', () => ({
  trash: {
    list: async () => structuredClone(api.entries),
    restore: vi.fn(async () => {}),
    purge: api.purge,
    clear: vi.fn(async () => {}),
  },
}))
vi.mock('../shell/AppShell.js', () => ({
  useToast: () => vi.fn(),
  useToday: () => '2026-08-25',
  useVaultRevision: () => ({ revision: 0, bump: vi.fn() }),
}))
vi.mock('../hooks/useVaultWrite.js', () => ({
  useVaultWrite: () => async (work: Promise<unknown>) => { await work; return true },
}))

const { Trash } = await import('./Trash.js')

function button(scope: ParentNode, label: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')]
    .find((item) => item.textContent === label)
  if (found === undefined) throw new Error(`找不到按钮 ${label}`)
  return found
}

describe('Trash', () => {
  let root: Root | null = null
  let host: HTMLDivElement

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    document.body.innerHTML = ''
    host = document.createElement('div')
    document.body.append(host)
    api.purge.mockClear()
    root = createRoot(host)
    await act(async () => { root!.render(<MessagesProvider><Trash /></MessagesProvider>) })
  })

  afterEach(() => {
    if (root !== null) act(() => root!.unmount())
    root = null
  })

  it('彻底删除一条要先确认,确认后才清除', async () => {
    await act(async () => { button(host.querySelector('.trow')!, '彻底删除').click() })
    expect(api.purge).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('彻底删除「Draft trees」？删除后不可恢复。')

    await act(async () => { button(dialog, '彻底删除').click() })
    expect(api.purge).toHaveBeenCalledExactlyOnceWith('trash-1')
  })

  it('取消确认后条目不会被彻底删除', async () => {
    await act(async () => { button(host.querySelector('.trow')!, '彻底删除').click() })
    const dialog = document.querySelector('[role="alertdialog"]')
    expect(dialog).not.toBeNull()

    await act(async () => { button(dialog!, '取消').click() })
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(api.purge).not.toHaveBeenCalled()
  })
})
