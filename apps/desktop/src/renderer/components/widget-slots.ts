import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import type { EditorView } from '@codemirror/view'

/** Where a CodeMirror widget puts its element, for React to render `source` into. */
export type WidgetSlots = { add: (dom: HTMLElement, source: string) => void; remove: (dom: HTMLElement) => void }

/** A widget's element and the source to render into it; `key` tells the widgets apart for React. */
export type Slot = { key: number; dom: HTMLElement; source: string }

/** The widget elements an editor shows, as a store React subscribes to. */
function slotStore(): WidgetSlots & { subscribe: (listener: () => void) => () => void; current: () => readonly Slot[] } {
  let slots: readonly Slot[] = []
  let next = 0
  const listeners = new Set<() => void>()
  const changed = (to: readonly Slot[]) => {
    slots = to
    for (const listener of listeners) listener()
  }
  return {
    add: (dom, source) => changed([...slots, { key: next++, dom, source }]),
    remove: (dom) => changed(slots.filter((slot) => slot.dom !== dom)),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    current: () => slots,
  }
}

/**
 * The slots the widgets of the editor in `view` put their elements in, and the elements shown now,
 * for the caller to portal its rendering of each slot's source into. The editor measures again once
 * React has filled them.
 */
export function useWidgetSlots(view: RefObject<EditorView | null>): { slots: WidgetSlots; shown: readonly Slot[] } {
  const slots = useMemo(slotStore, [])
  // A store update renders synchronously, so a widget never shows empty for a frame.
  const shown = useSyncExternalStore(slots.subscribe, slots.current)
  // The editor measured the widgets before React filled them.
  useLayoutEffect(() => { view.current?.requestMeasure() }, [view, shown])
  return { slots, shown }
}
