import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderText } from '@codemirror/view'
import { appMenu } from '../ipc.js'
import { commitsMultiline } from '../lib/keyboard.js'
import { livePreview, markdownBlocks } from './markdown-preview.js'
import { useWidgetSlots } from './widget-slots.js'
import './MarkdownEditor.css'

/** Where a click landed on rendered Markdown: the source line its block starts on, and the point on screen. */
export type EditorStart = { line: number; x: number; y: number }

/**
 * A CodeMirror editor over the Markdown source `text` with live preview: each block the cursor is
 * not on shows as `preview` renders its source, and the block holding the cursor shows its source.
 * It is focused on mount unless `autoFocus` is false, keeps its own undo history (⌘Z / Ctrl+Z), and
 * calls `onChange` with the whole source after each edit. `label` names its text for assistive
 * technology, and `placeholder` shows while the source is empty. `text`, `start`, `autoFocus`,
 * `label` and `placeholder` are read once, on mount. With `start`, the cursor
 * starts in the block on line `start.line`, at the point `start.x`, `start.y` once that block shows
 * its source, or at the block's start when the point is not on it; without it, at the start of the
 * source. The commit key (see `commitsMultiline`) is left to the
 * field around the editor, Escape reaches that field too, and Tab moves the focus on as in any
 * other field.
 */
export function MarkdownEditor({ text, onChange, preview, start, autoFocus = true, label, placeholder }: {
  text: string
  onChange: (text: string) => void
  preview: (source: string) => ReactNode
  start?: EditorStart | undefined
  autoFocus?: boolean
  label?: string
  placeholder?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changed = useRef(onChange)
  changed.current = onChange
  const { slots, shown } = useWidgetSlots(view)

  // Built before the first paint, so the box never shows empty and the page around it does not move.
  useLayoutEffect(() => {
    const initial = EditorState.create({
      doc: text,
      extensions: [
        history(),
        // Claiming the commit key keeps the default keymap from inserting a blank line; the key
        // still bubbles to the surrounding field, which commits.
        Prec.highest(EditorView.domEventHandlers({ keydown: (event) => commitsMultiline(appMenu.platform(), event) })),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        livePreview(slots),
        ...(label === undefined ? [] : [EditorView.contentAttributes.of({ 'aria-label': label })]),
        ...(placeholder === undefined ? [] : [placeholderText(placeholder)]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) changed.current(update.state.doc.toString())
        }),
      ],
    })
    const { doc } = initial
    const block = start === undefined || start.line > doc.lines ? undefined
      : markdownBlocks(doc).find((held) => held.from === doc.line(start.line).from)
    const editor = new EditorView({
      parent: host.current!,
      state: block === undefined ? initial : initial.update({ selection: EditorSelection.cursor(block.from) }).state,
    })
    view.current = editor
    if (autoFocus) editor.focus()
    if (start !== undefined && block !== undefined) {
      // The block shows its source from the start; the point is read against that once it is drawn.
      editor.requestMeasure({
        read: (drawn) => drawn.posAtCoords({ x: start.x, y: start.y }),
        write: (at, drawn) => {
          if (at !== null && block.from <= at && at <= block.to) drawn.dispatch({ selection: EditorSelection.cursor(at) })
        },
      })
    }
    return () => editor.destroy()
  }, [])

  return (
    <div className="md-editor" ref={host}>
      {shown.map((slot) => createPortal(preview(slot.source), slot.dom, String(slot.key)))}
    </div>
  )
}
