import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** The paging state of a list whose page holds as many items as fit; see `useListPaging`. */
export type ListPaging = {
  /** The page shown, from 1. */
  page: number
  /** Items per page. */
  size: number
  setPage: (page: number) => void
  /**
   * Sets how many items a page holds, moving to the page that holds the first item of the page last
   * picked, so that a run of resizes keeps that item on the page shown.
   */
  fit: (size: number) => void
}

/** A page shown, its size, and the index of the first item of the page last picked. */
type Held = { page: number; size: number; anchor: number }

const pick = (held: Held, page: number): Held => (held.page === page && held.anchor === (page - 1) * held.size
  ? held : { ...held, page, anchor: (page - 1) * held.size })

const refit = (held: Held, size: number): Held => (held.size === size
  ? held : { ...held, page: Math.floor(held.anchor / size) + 1, size })

/** The paging state of one list. Its pages hold `initial` items until the list reports through `fit` how many fit. */
export function useListPaging(initial: number): ListPaging {
  const [held, setHeld] = useState<Held>({ page: 1, size: initial, anchor: 0 })
  const setPage = useCallback((page: number) => setHeld((state) => pick(state, page)), [])
  const fit = useCallback((size: number) => setHeld((state) => refit(state, size)), [])
  return { page: held.page, size: held.size, setPage, fit }
}

/** What `allocateRows` knows of one stacked section. */
export type StackSection = {
  /** Rows its items take in all. */
  need: number
  /** Height of one row of items. */
  row: number
  /** Space between two rows. */
  gap: number
}

/**
 * The rows each of `sections` shows so that the stack fills `room`: every section with items starts at
 * one row, then the sections still holding items past their rows take one more row in turn, the
 * section with the fewest rows first and the upper one on a tie, while the stack still fits. A section
 * whose rows hold fewer than all of its items also takes `pager`, the height of its pager.
 */
export function allocateRows(sections: readonly StackSection[], room: number, pager: number): number[] {
  const rows = sections.map((section) => Math.min(1, section.need))
  const height = (at: number, count: number) => {
    const { need, row, gap } = sections[at]!
    return count === 0 ? 0 : count * row + (count - 1) * gap + (count < need ? pager : 0)
  }
  let left = room - rows.reduce((sum, count, at) => sum + height(at, count), 0)
  const growing = new Set(sections.flatMap((section, at) => (rows[at]! < section.need ? [at] : [])))
  while (growing.size > 0) {
    const at = [...growing].reduce((best, next) => (rows[next]! < rows[best]! ? next : best))
    const cost = height(at, rows[at]! + 1) - height(at, rows[at]!)
    if (cost > left) {
      growing.delete(at)
      continue
    }
    left -= cost
    rows[at] = rows[at]! + 1
    if (rows[at] === sections[at]!.need) growing.delete(at)
  }
  return rows
}

/** The paging state of one section of a stack; see `useStackPaging`. */
export type SectionPaging = {
  /** The section's key, which its list carries as `data-stack-section`. */
  key: string
  page: number
  size: number
  setPage: (page: number) => void
  /** While the section pages, the height of the rows it was given, which its list keeps on a shorter last page. */
  minHeight: number | undefined
}

/** The height `element` adds to the flow: its own and its top margin, which no neighbour's margin overlaps. */
const flowHeight = (element: Element): number => element.getBoundingClientRect().height + parseFloat(getComputedStyle(element).marginTop || '0')

/** The section pager that follows `list`, or null while the section does not page. */
const pagerAfter = (list: Element): Element | null => (list.nextElementSibling?.classList.contains('pagebar') ? list.nextElementSibling : null)

/**
 * The paging state of sections stacked one under another in `area`, the element that scrolls them,
 * each paging on its own. `totals` gives each section's key and item count, in stack order; each
 * section's list carries its key as `data-stack-section`, and its pager, while it pages, follows the
 * list. After every render and whenever `area` changes size, each section's page is sized to the
 * rows `allocateRows` gives it, so that the stack fills the height `area` shows; each keeps the first
 * item of its page last picked on the page shown, and its list keeps the height of its rows on a
 * shorter last page, so that paging one section moves none below it. Until it has been measured, a
 * section's pages hold `initial` items.
 */
export function useStackPaging(
  area: RefObject<HTMLElement | null>, totals: readonly { key: string; total: number }[], initial: number,
): (key: string) => SectionPaging {
  const [held, setHeld] = useState<ReadonlyMap<string, Held>>(new Map())
  const [reserved, setReserved] = useState<ReadonlyMap<string, number>>(new Map())
  // The last pager height seen, which a section that does not page yet takes once it does.
  const pagerHeight = useRef(0)
  const latest = useRef(totals)
  latest.current = totals

  const measure = useCallback(() => {
    const node = area.current
    // A hidden screen lays the area out zero high.
    if (node === null || node.clientHeight === 0) return
    const shown = latest.current.flatMap(({ key, total }) => {
      const list = node.querySelector<HTMLElement>(`.list[data-stack-section="${CSS.escape(key)}"]`)
      const item = list?.querySelector<HTMLElement>(':scope > .item')
      return list === null || item === null || item === undefined ? [] : [{ key, total, list, item, pager: pagerAfter(list) }]
    })
    if (shown.length === 0) return
    for (const { pager } of shown) if (pager !== null) pagerHeight.current = flowHeight(pager)
    const areaStyle = getComputedStyle(node)
    const padTop = parseFloat(areaStyle.paddingTop) || 0
    const top = node.getBoundingClientRect().top - node.scrollTop + padTop
    const visible = node.clientHeight - padTop - (parseFloat(areaStyle.paddingBottom) || 0)
    const end = shown.at(-1)!.pager ?? shown.at(-1)!.list
    const bottom = end.getBoundingClientRect().bottom + parseFloat(getComputedStyle(end).marginBottom || '0') - top
    const sections = shown.map(({ total, list, item }) => {
      const style = getComputedStyle(list)
      const columns = style.display === 'grid' ? style.gridTemplateColumns.split(' ').length : 1
      return { columns, need: Math.ceil(total / columns), row: item.getBoundingClientRect().height, gap: parseFloat(style.rowGap) || 0 }
    })
    // Everything in the stack but the rows of items and the pagers keeps its height whatever the rows.
    const fixed = bottom - shown.reduce((sum, { list, pager }) => sum + list.getBoundingClientRect().height + (pager === null ? 0 : flowHeight(pager)), 0)
    const rows = allocateRows(sections, visible - fixed, pagerHeight.current)
    setHeld((state) => {
      let next: Map<string, Held> | null = null
      shown.forEach(({ key }, at) => {
        const after = refit(state.get(key) ?? { page: 1, size: initial, anchor: 0 }, Math.max(1, rows[at]!) * sections[at]!.columns)
        if (after !== state.get(key)) (next ??= new Map(state)).set(key, after)
      })
      return next ?? state
    })
    const heights = new Map(shown.flatMap(({ key }, at) => {
      const { need, row, gap } = sections[at]!
      const count = Math.max(1, rows[at]!)
      return count < need ? [[key, count * row + (count - 1) * gap] as const] : []
    }))
    setReserved((state) => (state.size === heights.size && [...heights].every(([key, height]) => state.get(key) === height) ? state : heights))
  }, [area, initial])

  // Runs after every render: the sections' items, and what lies above them, come and go with the data.
  useLayoutEffect(() => {
    measure()
  })
  useLayoutEffect(() => {
    const node = area.current
    if (node === null) return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [area, measure])

  return (key) => {
    const state = held.get(key) ?? { page: 1, size: initial, anchor: 0 }
    return {
      key,
      page: state.page,
      size: state.size,
      setPage: (page) => setHeld((map) => {
        const after = pick(map.get(key) ?? { page: 1, size: initial, anchor: 0 }, page)
        return after === map.get(key) ? map : new Map(map).set(key, after)
      }),
      minHeight: reserved.get(key),
    }
  }
}

/** The items of `items` on the page `paging` shows; a page past the last shows the last page. */
export function pageItems<T>(items: readonly T[], paging: { page: number; size: number }): T[] {
  const shown = Math.min(paging.page, Math.max(1, Math.ceil(items.length / paging.size)))
  return items.slice((shown - 1) * paging.size, shown * paging.size)
}
