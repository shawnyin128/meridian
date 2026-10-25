// @vitest-environment jsdom
import { act, useRef } from 'react'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { CellPicker } from './paper-table/CellPicker.js'
import { PickRow, type PickHit } from './PickRow.js'
import { TagChips } from './TagChips.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Lets the candidates and the popover's position effects settle. */
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

/** Types `value` into `input` through the setter React tracks. */
const type = (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

/** A PickRow whose draft row is its own wrapper, offering `hits` for any text. */
function Relation({ hits, onPick }: { hits: PickHit[]; onPick: (hit: PickHit) => boolean }) {
  const row = useRef<HTMLDivElement>(null)
  return (
    <div ref={row}>
      <PickRow
        row={row} triggers={[]} placeholder="挑一个" suggest={() => Promise.resolve(hits)} allowNew={false}
        onPick={onPick} onNew={() => false} onCancel={vi.fn()} onError={vi.fn()}
      />
    </div>
  )
}

describe('CandidateField', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    // FadeText measures whether its text fits, and jsdom has no ResizeObserver.
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

  const render = async (node: ReactNode) => {
    await act(async () => root.render(<MessagesProvider>{node}</MessagesProvider>))
    await flush()
  }
  /** The row that creates the typed value: its glyph and the chip it holds. */
  const createRow = () => {
    const row = document.querySelector('.pickhits .rrow.mk')!
    return [row.querySelector('svg') !== null, [...row.children].map((child) => `${child.tagName} ${child.className}`).slice(1), row.textContent]
  }

  it('主题和单选格新建一个值的那一行一样:一个 ＋,后面是它将成为的 chip', async () => {
    await render(
      <TagChips
        values={[]} vocabulary={async () => []} keep={['paper', 'p1']} onAdd={vi.fn()} onRemove={vi.fn()} onError={vi.fn()}
        labels={{ add: '添加主题', remove: (value) => value, existing: '已有主题' }}
      />,
    )
    await act(async () => { host.querySelector<HTMLElement>('.tagadd')!.click() })
    await type(host.querySelector<HTMLInputElement>('.tagin')!, '检索')
    const topic = createRow()
    await render(
      <CellPicker
        column={{ key: 'level', label: '读法', type: 'select', options: [] }} values={[]}
        onCommit={() => true} onClose={vi.fn()} keep={{ scope: ['paper', 'p1'], target: 'cell:level' }}
      />,
    )
    await type(host.querySelector<HTMLInputElement>('.celledit')!, '精读')
    expect([topic, createRow()]).toEqual([
      [true, ['SPAN tag tag--chip tag--neutral tagchip'], '检索'],
      [true, ['SPAN tag tag--chip tag--neutral tagchip'], '精读'],
    ])
  })

  it('关联的候选不截在 8 条:每一条都在列表里,列表自己滚动', async () => {
    const hits = Array.from({ length: 12 }, (_, at) => ({ id: `h${at}`, title: `候选 ${at}` }))
    await render(<Relation hits={hits} onPick={() => true} />)
    expect(document.querySelectorAll('.pickhits .rrow')).toHaveLength(12)
  })

  it('关联的候选和别的候选一样点一下就选中', async () => {
    const onPick = vi.fn(() => true)
    await render(<Relation hits={[{ id: 'h1', title: '候选一' }]} onPick={onPick} />)
    await act(async () => { document.querySelector<HTMLElement>('.pickhits .rrow')!.click() })
    expect(onPick).toHaveBeenCalledWith({ id: 'h1', title: '候选一' })
  })
})
