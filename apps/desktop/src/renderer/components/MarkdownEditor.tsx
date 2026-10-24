import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { appMenu } from '../ipc.js'
import { commitsMultiline } from '../lib/keyboard.js'
import { livePreview } from './markdown-preview.js'
import { useWidgetSlots } from './widget-slots.js'
import './MarkdownEditor.css'

/**
 * A CodeMirror editor over the Markdown source `text` with live preview: each block the cursor is
 * not on shows as `preview` renders its source, and the block holding the cursor shows its source.
 * It is focused on mount, keeps its own undo history (⌘Z / Ctrl+Z), and calls `onChange` with the
 * whole source after each edit. `text` is read once, on mount. The commit key (see `commitsMultiline`) is left to the
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
  const { slots, shown } = useWidgetSlots(view)

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          history(),
          // Claiming the commit key keeps the default keymap from inserting a blank line; the key
          // still bubbles to the surrounding field, which commits.
          Prec.highest(EditorView.domEventHandlers({ keydown: (event) => commitsMultiline(appMenu.platform(), event) })),
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

  return (
    <div className="md-editor" ref={host}>
      {shown.map((slot) => createPortal(preview(slot.source), slot.dom, String(slot.key)))}
    </div>
  )
}
