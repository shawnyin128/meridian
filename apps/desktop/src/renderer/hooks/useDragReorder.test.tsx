// @vitest-environment jsdom
import { act, useMemo } from 'react'
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
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
    dataTransfer: { effectAllowed: '', setData: vi.fn(), setDragImage: vi.fn() },
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ top: rectTop, height: rectHeight }), closest: () => null },
    preventDefault: vi.fn(),
  } as unknown as ReactDragEvent<T>
}

/** A keydown stub of `key` with Alt held, from `target`. */
function altKey(key: string, target: EventTarget = document.body, held: Partial<KeyboardEvent> = { altKey: true }) {
  return {
    key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...held, target,
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
  } as unknown as ReactKeyboardEvent<HTMLElement>
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
  const start = (id: string) => act(() => reorder.handleProps(id).onDragStart(dragEvent<HTMLElement>()))
  const over = (id: string, y: number) => act(() => reorder.itemProps(id).onDragOver(dragEvent<HTMLElement>(y, 0, 20)))
  const drop = (id: string) => act(() => reorder.itemProps(id).onDrop(dragEvent()))
  const end = (id: string) => act(() => reorder.handleProps(id).onDragEnd())

  it('只有把手能拖，条目本身只接住放下', () => {
    mount(['a', 'b'], () => 'x', vi.fn())
    expect(reorder.handleProps('a').draggable).toBe(true)
    expect('draggable' in reorder.itemProps('a')).toBe(false)
  })

  it('拖到同一个作用域里另一个条目的上半部分,插到它前面', () => {
    const onReorder = vi.fn()
    mount(['a', 'b', 'c'], () => 'x', onReorder)
    start('a')
    over('c', 2) // y=2 is in the top half of a 20px-tall item
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

  it('dropClass 标出正被拖动的条目,和悬停目标该在它前面还是后面', () => {
    mount(['a', 'b', 'c'], () => 'x', vi.fn())
    start('a')
    over('c', 2)
    expect(reorder.dropClass('a')).toBe('dragging')
    expect(reorder.dropClass('c')).toBe('drag-over-before')
    expect(reorder.dropClass('b')).toBe('')
  })

  it('上移下移只在本作用域里挪一格，到了头就不能再挪', () => {
    const onReorder = vi.fn()
    const scopeOf = (id: string) => (id === 'z' ? 'done' : 'active')
    mount(['a', 'b', 'z', 'c'], scopeOf, onReorder)
    expect([reorder.canMove('a', -1), reorder.canMove('a', 1), reorder.canMove('c', 1), reorder.canMove('z', 1)])
      .toEqual([false, true, false, false])
    act(() => reorder.move('c', -1))
    expect(onReorder).toHaveBeenLastCalledWith(['a', 'c', 'z', 'b'])
    act(() => reorder.move('a', 1))
    expect(onReorder).toHaveBeenLastCalledWith(['b', 'a', 'z', 'c'])
    onReorder.mockClear()
    act(() => reorder.move('a', -1))
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('Alt+↑ / Alt+↓ 在条目里挪动它，别的组合键和输入框里的不算', () => {
    const onReorder = vi.fn()
    mount(['a', 'b', 'c'], () => 'x', onReorder)
    act(() => reorder.itemProps('b').onKeyDown(altKey('ArrowDown')))
    expect(onReorder).toHaveBeenLastCalledWith(['a', 'c', 'b'])
    act(() => reorder.itemProps('b').onKeyDown(altKey('ArrowUp')))
    expect(onReorder).toHaveBeenLastCalledWith(['b', 'a', 'c'])
    onReorder.mockClear()
    act(() => reorder.itemProps('b').onKeyDown(altKey('ArrowDown', document.body, { altKey: false })))
    act(() => reorder.itemProps('b').onKeyDown(altKey('ArrowDown', document.body, { altKey: true, shiftKey: true })))
    act(() => reorder.itemProps('b').onKeyDown(altKey('ArrowDown', document.createElement('input'))))
    expect(onReorder).not.toHaveBeenCalled()
  })
})
