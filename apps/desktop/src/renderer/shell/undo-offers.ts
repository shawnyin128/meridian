import { land } from '../hooks/useArrival.js'

/** Where Undos on offer go: the shell's ⌘Z, while it is mounted. */
type Taker = (run: () => void) => void
let taker: Taker | null = null

/** The landings (`landOnRestored`) still waiting for their item; each entry stops one. */
const landings = new Set<() => void>()

/**
 * Takes every Undo offered from now on, until the returned function is called; that call also stops
 * every landing still waiting.
 */
export function takeUndoOffers(next: Taker): () => void {
  taker = next
  return () => {
    if (taker !== next) return
    taker = null
    for (const stop of landings) stop()
  }
}

/** Offers `run`, which undoes a write, to ⌘Z (see `useNotice`); with no shell mounted nothing takes it. */
export function offerUndo(run: () => void): void {
  taker?.(run)
}

/** What ⌘Z lands on once it has undone a write: a list's row or card (Item) or a navigation row (NavRow). */
const ITEMS = '.item, .nav-row'
/** How long ⌘Z waits for the restored item to show before it lands nowhere. */
const LANDING_MS = 4000
/** The data attributes that change with a moment's state, not with which item an element is. */
const PASSING = new Set(['data-arrived', 'data-state', 'data-highlighted'])

/** What tells an item from the others across renders: its lasting data attributes and its text. */
const keyOf = (item: Element): string => `${[...item.attributes]
  .filter(({ name }) => name.startsWith('data-') && !PASSING.has(name)).map(({ name, value }) => `${name}=${value}`)
  .sort().join(' ')}|${item.textContent ?? ''}`

/** The items on the page before an undo: the elements, and the keys they had. */
export type ItemsBefore = { nodes: ReadonlySet<Element>; keys: ReadonlySet<string> }

/** The items on the page now, so that `landOnRestored` can tell which one an undo brings back. */
export function itemsNow(): ItemsBefore {
  const items = [...document.querySelectorAll(ITEMS)]
  return { nodes: new Set(items), keys: new Set(items.map(keyOf)) }
}

/**
 * Lands on and flashes (`land`) the item an undo brings back, once it shows on the screen shown or in
 * the sidebar: the first item that is neither an element of `before` nor one whose key `before` held,
 * so a row that only changed its text in place, or one drawn again as it was, is passed over. When no
 * such item shows within LANDING_MS, or the shell lets go of the offers first (`takeUndoOffers`), it
 * lands nowhere.
 */
export function landOnRestored(before: ItemsBefore): void {
  const shown = `.screenslot:not([hidden]) :is(${ITEMS}), #sidebar :is(${ITEMS})`
  const restored = () => [...document.querySelectorAll(shown)].find((item) => !before.nodes.has(item) && !before.keys.has(keyOf(item)))
  const stop = () => {
    observer.disconnect()
    window.clearTimeout(timer)
    landings.delete(stop)
  }
  const observer = new MutationObserver(() => {
    const item = restored()
    if (item === undefined) return
    stop()
    land(item)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  const timer = window.setTimeout(stop, LANDING_MS)
  landings.add(stop)
}
