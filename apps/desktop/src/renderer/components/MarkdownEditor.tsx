import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { commitsMultiline } from '../lib/keyboard.js'
import { livePreview, type PreviewSlots } from './markdown-preview.js'
import './MarkdownEditor.css'

/** A rendered block's element and the source to render into it; `key` tells the blocks apart for React. */
type Slot = { key: number; dom: HTMLElement; source: string }

/** The rendered blocks an editor shows, as a store React subscribes to. */
function previewSlots(): PreviewSlots & { subscribe: (listener: () => void) => () => void; current: () => readonly Slot[] } {
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
 * A CodeMirror editor over the Markdown source `text` with live preview: each block the cursor is
 * not on shows as `preview` renders its source, and the block holding the cursor shows its source.
 * It is focused on mount, keeps its own undo history (⌘Z / Ctrl+Z), and calls `onChange` with the
 * whole source after each edit. `text` is read once, on mount. ⌘Enter / Ctrl+Enter is left to the
 * field around the editor, Escape reaches that field too, and Tab moves the focus on as in any
 * other field.
 */
export function MarkdownEditor({ text, onChange, preview }: {
  text: string
  onChange: (text: string) => void
  preview: (source: string) => ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changed = useRef(onChange)
  changed.current = onChange
  const slots = useMemo(previewSlots, [])
  // A store update renders synchronously, so a block never shows empty for a frame.
  const shown = useSyncExternalStore(slots.subscribe, slots.current)

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          history(),
          // Claiming the commit key keeps the default keymap from inserting a blank line; the key
          // still bubbles to the surrounding field, which commits.
          Prec.highest(EditorView.domEventHandlers({ keydown: (event) => commitsMultiline(event) })),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          livePreview(slots),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    editor.focus()
    return () => editor.destroy()
  }, [])
  // The editor measured the rendered blocks before React filled them.
  useLayoutEffect(() => { view.current?.requestMeasure() }, [shown])

  return (
    <div className="md-editor" ref={host}>
      {shown.map((slot) => createPortal(preview(slot.source), slot.dom, String(slot.key)))}
    </div>
  )
}
