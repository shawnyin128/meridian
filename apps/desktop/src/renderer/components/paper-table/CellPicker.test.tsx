// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { PaperColumn } from '../../../shared/contract.js'
import { MessagesProvider } from '../../messages/useMessages.js'
import { CellPicker, optionRows } from './CellPicker.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const COLUMN: PaperColumn = { key: 'topics', label: '主题', type: 'multi', options: ['综述', '必读'] }

/** Lets the Popper's own async position effects settle before assertions run. */
async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

/**
 * Mounts a real CellPicker inside a wrapper carrying its own `contextmenu` handler, mirroring
 * `PaperTable.tsx`'s row: `<tr onContextMenu={...}>` wraps every cell, including an open CellPicker's.
 */
async function mount(
  onRowContextMenu: () => void,
  { onCommit = () => true, onClose = () => {}, values = [] }: {
    onCommit?: (value: string, created: boolean) => boolean | Promise<boolean>
    onClose?: () => void
    values?: string[]
  } = {},
): Promise<HTMLDivElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <MessagesProvider>
        <div onContextMenu={onRowContextMenu}>
          <CellPicker column={COLUMN} values={values} onCommit={onCommit} onClose={onClose} />
        </div>
      </MessagesProvider>,
    )
  })
  await flush()
  return host
}

/** Types `value` into the picker's input. */
async function type(host: HTMLElement, value: string): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input.celledit')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Presses `key` in the picker's input. */
async function keydown(host: HTMLElement, key: string, init: KeyboardEventInit = {}): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input.celledit')!
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init })) })
}

/** Presses the mouse outside the picker and its popover. */
async function pressOutside(): Promise<void> {
  await act(async () => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
}

describe('CellPicker', () => {
  it('候选行按输入词过滤,未命中时补一条新建', () => {
    expect(optionRows(['综述', '必读'], '')).toEqual({ hits: ['综述', '必读'], isNew: false })
    expect(optionRows(['综述', '必读'], '综')).toEqual({ hits: ['综述'], isNew: true })
    expect(optionRows(['综述', '必读'], '深度')).toEqual({ hits: [], isNew: true })
    // Case only differs: counts as the existing option, no new row.
    expect(optionRows(['综述'], '综述')).toEqual({ hits: ['综述'], isNew: false })
  })

  it('打了新选项名点到别处,像回车一样新建它并收起;空着离开只收起', async () => {
    const onCommit = vi.fn(() => true)
    const onClose = vi.fn()
    const host = await mount(() => {}, { onCommit, onClose })
    await pressOutside()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCommit).not.toHaveBeenCalled()

    await type(host, '深度')
    await pressOutside()
    expect(onCommit).toHaveBeenCalledWith('深度', true)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('离开时高亮的是这一格已有的选项:不动它,只收起', async () => {
    const onCommit = vi.fn(() => true)
    const onClose = vi.fn()
    const host = await mount(() => {}, { onCommit, onClose, values: ['综述'] })
    await type(host, '综')
    await pressOutside()
    expect(onCommit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('离开时新建被拒:选择器带着打的字留着并标红', async () => {
    const onClose = vi.fn()
    const host = await mount(() => {}, { onCommit: () => Promise.resolve(false), onClose })
    await type(host, '深度')
    await pressOutside()
    const input = host.querySelector<HTMLInputElement>('input.celledit')!
    expect(onClose).not.toHaveBeenCalled()
    expect(input.value).toBe('深度')
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('输入法组字时的回车与 Esc 归输入法:不新建也不收起;组完字后回车照常新建', async () => {
    const onCommit = vi.fn(() => true)
    const onClose = vi.fn()
    const host = await mount(() => {}, { onCommit, onClose })
    await type(host, '深度')
    await keydown(host, 'Enter', { isComposing: true })
    await keydown(host, 'Escape', { isComposing: true })
    expect(onCommit).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    await keydown(host, 'Enter')
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('深度', true)
  })

  it('右键点在输入框本身上,不冒泡给行本身的右键菜单', async () => {
    const onRowContextMenu = vi.fn()
    const host = await mount(onRowContextMenu)
    const input = host.querySelector('input.celledit')!
    await act(async () => {
      input.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    expect(onRowContextMenu).not.toHaveBeenCalled()
  })
})
