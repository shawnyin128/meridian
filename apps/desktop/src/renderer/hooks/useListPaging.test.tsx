// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PagedSection } from '../components/PagedSection.js'
import { MessagesProvider } from '../messages/useMessages.js'
import { LANGUAGE_STORAGE_KEY } from '../shell/language.js'
import { allocateRows, pageItems, useStackPaging } from './useListPaging.js'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('allocateRows', () => {
  const section = (need: number) => ({ need, row: 100, gap: 10 })

  it('每节都放得下时每节拿到它全部的行，不留翻页条', () => {
    expect(allocateRows([section(2), section(1), section(3)], 1000, 30)).toEqual([2, 1, 3])
  })

  it('放不下时轮流加行，行最少的节先加，同样少时上面的节先加', () => {
    // 1 + 1 + 1 rows with two pagers: 3 * 100 + 2 * 30 = 360; each further row costs 110.
    expect(allocateRows([section(5), section(1), section(9)], 360 + 3 * 110, 30)).toEqual([3, 1, 2])
  })

  it('一节加到装下全部条目时它的翻页条让出的高度给别的节', () => {
    // The third row of the first section costs 110 - 30, which leaves 110 + 30 for the second's third row.
    expect(allocateRows([section(3), section(9)], 260 + 2 * 110 + 80 + 110, 30)).toEqual([3, 3])
    expect(allocateRows([section(3), section(9)], 260 + 2 * 110 + 79, 30)).toEqual([2, 2])
  })

  it('高度不够时每节仍至少一行，没有条目的节不占行', () => {
    expect(allocateRows([section(4), section(0), section(6)], 50, 30)).toEqual([1, 0, 1])
  })
})

describe('pageItems', () => {
  it('取出所在页的条目，页码超过末页时取末页', () => {
    expect(pageItems([1, 2, 3, 4, 5], { page: 2, size: 2 })).toEqual([3, 4])
    expect(pageItems([1, 2, 3, 4, 5], { page: 9, size: 2 })).toEqual([5])
  })
})

/**
 * Lays out `area` as a browser would for these tests: one column, each heading 40 px, each item 100 px
 * with no gap, a list as tall as its items or its min-height, each pager 30 px, stacked from the area's
 * top. `height` is the area's own height.
 */
function layOut(area: HTMLElement, height: { value: number }) {
  const tall = (element: Element): number => {
    if (element.classList.contains('section-heading')) return 40
    if (element.classList.contains('pagebar')) return 30
    if (element.classList.contains('list')) {
      return Math.max(element.children.length * 100, parseFloat((element as HTMLElement).style.minHeight) || 0)
    }
    return 0
  }
  const box = (top: number, h: number) => ({ x: 0, y: top, top, left: 0, right: 0, bottom: top + h, width: 0, height: h, toJSON: () => ({}) }) as DOMRect
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this === area ? height.value : 0
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this === area) return box(0, height.value)
    let top = 0
    for (const child of area.children) {
      if (child === this) return box(top, tall(child))
      if (child.contains(this)) {
        return child.classList.contains('list') ? box(top + [...child.children].indexOf(this) * 100, 100) : box(top, 0)
      }
      top += tall(child)
    }
    return box(0, 0)
  })
}

describe('useStackPaging', () => {
  let root: Root
  let host: HTMLDivElement
  let observers: (() => void)[]
  const height = { value: 1000 }

  function Stack({ totals }: { totals: { key: string; total: number }[] }) {
    const area = useRef<HTMLDivElement>(null)
    const section = useStackPaging(area, totals, 12)
    return (
      <div ref={(node) => {
        area.current = node
        if (node !== null && !(node as { laidOut?: boolean }).laidOut) {
          (node as { laidOut?: boolean }).laidOut = true
          layOut(node, height)
        }
      }}
      >
        {totals.map(({ key, total }) => {
          const paging = section(key)
          return (
            <PagedSection key={key} heading={key} total={total} paging={paging}>
              {pageItems(Array.from({ length: total }, (_, at) => at + 1), paging)
                .map((n) => <div className="item" key={n}>{`${key}${n}`}</div>)}
            </PagedSection>
          )
        })}
      </div>
    )
  }

  const shown = (key: string) => [...host.querySelectorAll(`.list[data-stack-section="${key}"] > .item`)].map((item) => item.textContent)
  const pagerOf = (key: string) => {
    const next = host.querySelector(`.list[data-stack-section="${key}"]`)!.nextElementSibling
    return next?.classList.contains('pagebar') ? next : null
  }
  const resize = async (to: number) => {
    height.value = to
    await act(async () => { for (const observer of [...observers]) observer() })
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh')
    observers = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly callback: () => void) {}
      observe() { observers.push(this.callback) }
      disconnect() { observers.splice(observers.indexOf(this.callback), 1) }
    })
    height.value = 1000
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const mount = () => act(() => root.render(
    <MessagesProvider><Stack totals={[{ key: 'a', total: 3 }, { key: 'b', total: 21 }]} /></MessagesProvider>,
  ))

  it('几节一起填满可见高度：小的节全部显示、不出翻页条，大的节拿剩下的行并有自己的翻页条', () => {
    mount()
    // 80 px of headings; a: 3 rows; b: 5 rows and its 30 px pager, 910 px of 1000.
    expect(shown('a')).toEqual(['a1', 'a2', 'a3'])
    expect(pagerOf('a')).toBeNull()
    expect(shown('b')).toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
    expect(pagerOf('b')!.querySelector('.pginfo')!.textContent).toBe('共 21 条')
  })

  it('改变高度时重算各节的行数，所选那页的第一个条目一直留在显示的页上', async () => {
    mount()
    await act(async () => { pagerOf('b')!.querySelector<HTMLButtonElement>('[aria-label="下一页"]')!.click() })
    expect(shown('b')).toEqual(['b6', 'b7', 'b8', 'b9', 'b10'])

    await resize(700)
    expect(shown('a')).toEqual(['a1', 'a2', 'a3'])
    expect(shown('b')).toEqual(['b5', 'b6'])
    await resize(1000)
    expect(shown('b')).toEqual(['b6', 'b7', 'b8', 'b9', 'b10'])
  })

  it('各节各自翻页，最后一页较短时列表仍占满一页的高度，下面的节不移动', async () => {
    act(() => root.render(
      <MessagesProvider><Stack totals={[{ key: 'b', total: 21 }, { key: 'a', total: 3 }]} /></MessagesProvider>,
    ))
    const pager = pagerOf('b')!
    await act(async () => { pager.querySelector<HTMLButtonElement>('[aria-label="第 5 页"]')!.click() })
    expect(shown('b')).toEqual(['b21'])
    expect(host.querySelector<HTMLElement>('.list[data-stack-section="b"]')!.style.minHeight).toBe('500px')
    expect(shown('a')).toEqual(['a1', 'a2', 'a3'])
  })
})
