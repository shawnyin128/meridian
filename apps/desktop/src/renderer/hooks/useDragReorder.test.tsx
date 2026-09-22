// @vitest-environment jsdom
import { act, useMemo } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDragReorder } from './useDragReorder.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

type Reorder = ReturnType<typeof useDragReorder>

/** Exposes the hook's return value to the test through `onReady`, called on every render. */
function Probe({ ids, scopeOf, onReorder, onReady }: {
  ids: readonly string[]
  scopeOf: (id: string) => string
  onReorder: (order: string[]) => void
  onReady: (reorder: Reorder) => void
}) {
  const stableScopeOf = useMemo(() => scopeOf, [scopeOf])
  const reorder = useDragReorder(ids, stableScopeOf, onReorder)
  onReady(reorder)
  return null
}

/** A drag event stub carrying only what the hook reads: a settable dataTransfer, position and target rect. */
function dragEvent<T extends Element = Element>(y = 0, rectTop = 0, rectHeight = 20) {
  return {
    dataTransfer: { effectAllowed: '', setData: vi.fn() },
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ top: rectTop, height: rectHeight }) },
    preventDefault: vi.fn(),
  } as unknown as ReactDragEvent<T>
}

describe('useDragReorder', () => {
  let host: HTMLDivElement
  let reorder: Reorder

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
  })

  const mount = (ids: string[], scopeOf: (id: string) => string, onReorder: (order: string[]) => void) => {
    act(() => createRoot(host).render(
      <Probe ids={ids} scopeOf={scopeOf} onReorder={onReorder} onReady={(next) => { reorder = next }} />,
    ))
  }
  const start = (id: string) => act(() => reorder.cardProps(id).onDragStart(dragEvent()))
  const over = (id: string, y: number) => act(() => reorder.cardProps(id).onDragOver(dragEvent<HTMLElement>(y, 0, 20)))
  const drop = (id: string) => act(() => reorder.cardProps(id).onDrop(dragEvent()))
  const end = (id: string) => act(() => reorder.cardProps(id).onDragEnd())

  it('拖到同一个作用域里另一张卡片的上半部分,插到它前面', () => {
    const onReorder = vi.fn()
    mount(['a', 'b', 'c'], () => 'x', onReorder)
    start('a')
    over('c', 2) // y=2 is in the top half of a 20px-tall card
    drop('c')
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('拖到下半部分,插到它后面', () => {
    const onReorder = vi.fn()
    mount(['a', 'b', 'c'], () => 'x', onReorder)
    start('a')
    over('c', 15) // y=15 is in the bottom half
    drop('c')
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a'])
  })

  it('不同作用域之间不接受拖放,什么也不做', () => {
    const onReorder = vi.fn()
    const scopeOf = (id: string) => (id === 'a' ? 'left' : 'right')
    mount(['a', 'b', 'c'], scopeOf, onReorder)
    start('a')
    over('c', 2)
    drop('c')
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('放下前松手(dragend)取消这次拖拽,再次放下什么也不做', () => {
    const onReorder = vi.fn()
    mount(['a', 'b'], () => 'x', onReorder)
    start('a')
    end('a')
    drop('b')
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('dropClass 标出正被拖动的卡片,和悬停目标该在它前面还是后面', () => {
    mount(['a', 'b', 'c'], () => 'x', vi.fn())
    start('a')
    over('c', 2)
    expect(reorder.dropClass('a')).toBe('dragging')
    expect(reorder.dropClass('c')).toBe('drag-over-before')
    expect(reorder.dropClass('b')).toBe('')
  })
})
