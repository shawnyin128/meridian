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

/** A drag event stub on `currentTarget` carrying only what the hook reads: a settable dataTransfer and the pointer's position. */
function dragEvent<T extends Element = Element>(currentTarget: Element, y = 0) {
  return {
    dataTransfer: { effectAllowed: '', setData: vi.fn(), setDragImage: vi.fn() },
    clientX: 0,
    clientY: y,
    currentTarget,
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

  /** How many times the hook's caller rendered. */
  let renders = 0
  const mount = (ids: string[], scopeOf: (id: string) => string, onReorder: (order: string[]) => void) => {
    renders = 0
    act(() => createRoot(host).render(
      <Probe ids={ids} scopeOf={scopeOf} onReorder={onReorder} onReady={(next) => { reorder = next; renders += 1 }} />,
    ))
  }
  /** The item element of `id`, a 20px-tall box at the top holding its drag handle. */
  const item = (id: string): HTMLElement => {
    const found = host.querySelector<HTMLElement>(`[data-reorder-item="${id}"]`)
    if (found !== null) return found
    const made = document.createElement('div')
    made.dataset['reorderItem'] = id
    made.getBoundingClientRect = () => ({ top: 0, left: 0, height: 20, width: 100 }) as DOMRect
    made.append(document.createElement('span'))
    host.append(made)
    return made
  }
  const start = (id: string) => act(() => reorder.handleProps(id).onDragStart(dragEvent<HTMLElement>(item(id).firstElementChild!)))
  const over = (id: string, y: number) => act(() => reorder.itemProps(id).onDragOver(dragEvent<HTMLElement>(item(id), y)))
  const drop = (id: string) => act(() => reorder.itemProps(id).onDrop(dragEvent(item(id))))
  const end = (id: string) => act(() => reorder.handleProps(id).onDragEnd())
  /** The drop feedback classes on each of `ids`' items. */
  const feedback = (...ids: string[]) => ids.map((id) => [...item(id).classList].join(' '))

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

  it('被拖的条目变淡,指针下的条目在被拖条目会落下的一侧画线,线跟着指针走,松手后都清掉', () => {
    mount(['a', 'b', 'c'], () => 'x', vi.fn())
    start('a')
    over('c', 2)
    expect(feedback('a', 'b', 'c')).toEqual(['dragging', '', 'drag-over-before'])
    over('c', 15)
    expect(feedback('a', 'b', 'c')).toEqual(['dragging', '', 'drag-over-after'])
    over('b', 2)
    expect(feedback('a', 'b', 'c')).toEqual(['dragging', 'drag-over-before', ''])
    end('a')
    expect(feedback('a', 'b', 'c')).toEqual(['', '', ''])
  })

  it('拖动中 React 改写了条目的 class,下一次 dragover 把变淡和落点线都补回来', () => {
    mount(['a', 'b', 'c'], () => 'x', vi.fn())
    start('a')
    over('c', 2)
    // A render that changes an item's className sets the whole attribute, without the drag marks.
    item('a').className = ''
    item('c').className = ''
    over('c', 3)
    expect(feedback('a', 'b', 'c')).toEqual(['dragging', '', 'drag-over-before'])
  })

  it('放下后被拖条目和落点的标记都清掉', () => {
    mount(['a', 'b', 'c'], () => 'x', vi.fn())
    start('a')
    over('c', 15)
    drop('c')
    expect(feedback('a', 'b', 'c')).toEqual(['', '', ''])
  })

  it('开始拖动和拖过条目都不让调用方重新渲染,整张列表不跟着每次 dragover 重画', () => {
    mount(['a', 'b', 'c'], () => 'x', vi.fn())
    const before = renders
    start('a')
    over('c', 2)
    over('c', 3)
    over('c', 15)
    over('b', 2)
    expect(renders - before).toBe(0)
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
