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
async function mount(onRowContextMenu: () => void): Promise<HTMLDivElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <MessagesProvider>
        <div onContextMenu={onRowContextMenu}>
          <CellPicker column={COLUMN} values={[]} onCommit={() => {}} onClose={() => {}} />
        </div>
      </MessagesProvider>,
    )
  })
  await flush()
  return host
}

describe('CellPicker', () => {
  it('候选行按输入词过滤,未命中时补一条新建', () => {
    expect(optionRows(['综述', '必读'], '')).toEqual({ hits: ['综述', '必读'], isNew: false })
    expect(optionRows(['综述', '必读'], '综')).toEqual({ hits: ['综述'], isNew: true })
    expect(optionRows(['综述', '必读'], '深度')).toEqual({ hits: [], isNew: true })
    // Case only differs: counts as the existing option, no new row.
    expect(optionRows(['综述'], '综述')).toEqual({ hits: ['综述'], isNew: false })
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
