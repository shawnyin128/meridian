import type { PaperReading } from '../../../shared/contract.js'
import { editField, type Drafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { commitsMultiline } from '../../lib/keyboard.js'
import { FormTextarea } from '../FormControls.js'

/**
 * The remark in the reader's right rail: a free thought about the whole paper, tied to no page. The
 * whole text is saved as a replacement by Save or ⌘Enter, which do nothing while it is unchanged or
 * a save is in flight; Esc drops the draft.
 */
export function ReadingRemark({ reading, saving, onSave, edits }: {
  reading: PaperReading
  saving: boolean
  onSave: (text: string) => Promise<boolean>
  edits: Drafts<EditDraft>
}) {
  const m = useMessages()
  const held = reading.remark
  const edit = editField(edits, `remark:${reading.paperId}`, held)
  const text = edit.text
  const unchanged = text.trim() === held
  const save = () => {
    if (saving || unchanged || edit.stale) return
    void onSave(text.trim()).then((saved) => { if (saved) edit.drop() })
  }
  return (
    <aside className="reading-remark" aria-label={m.reader.rail.tabs.remark}>
      <header><strong>{m.reader.remark.heading}</strong></header>
      <div className="remark-compose">
        <FormTextarea
          aria-label={m.reader.rail.tabs.remark} placeholder={m.reader.remark.placeholder}
          {...edit.fieldProps}
          onKeyDown={(event) => {
            if (commitsMultiline(event.nativeEvent)) { event.preventDefault(); save(); return }
            edit.fieldProps.onKeyDown(event)
          }}
        />
        <button className="btn pri" disabled={saving || unchanged} onClick={save}>{m.common.save}</button>
      </div>
    </aside>
  )
}
