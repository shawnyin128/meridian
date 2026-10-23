import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { commitsMultiline } from '../lib/keyboard.js'
import './MarkdownEditor.css'

/**
 * A CodeMirror editor over the Markdown source `text`, focused on mount, with its own undo history
 * (⌘Z / Ctrl+Z). It calls `onChange` with the whole source after each edit. `text` is read once, on
 * mount. ⌘Enter / Ctrl+Enter is left to the field around the editor, Escape reaches that field
 * too, and Tab moves the focus on as in any other field.
 */
export function MarkdownEditor({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const changed = useRef(onChange)
  changed.current = onChange

  useEffect(() => {
    const view = new EditorView({
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
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.focus()
    return () => view.destroy()
  }, [])

  return <div className="md-editor" ref={host} />
}
