import type { PaperReading } from '../../../shared/contract.js'
import { editField, type Drafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormTextarea } from '../FormControls.js'
import { ReaderPanelHeader } from './ReaderPanelHeader.js'

/**
 * The remark in the reader's right rail: a free thought about the whole paper, tied to no page. The
 * whole text is saved as a replacement, and Save stays disabled while it is unchanged.
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
  return (
    <aside className="reading-remark" aria-label={m.reader.rail.tabs.remark}>
      <ReaderPanelHeader title={m.reader.remark.heading} />
      <div className="remark-compose">
        <FormTextarea
          aria-label={m.reader.rail.tabs.remark} placeholder={m.reader.remark.placeholder}
          {...edit.fieldProps}
        />
        <button
          className="btn pri sm" disabled={saving || text.trim() === held}
          onClick={() => { if (!edit.stale) void onSave(text.trim()).then((saved) => { if (saved) edit.drop() }) }}
        >{m.reader.remark.save}</button>
      </div>
    </aside>
  )
}
