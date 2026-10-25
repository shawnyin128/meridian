import type { PaperReading } from '../../../shared/contract.js'
import { editField, type Drafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormTextarea } from '../FormControls.js'
import { PageHeader, PageTitle } from '../PageShell.js'
import { CommitActions } from '../CommitActions.js'

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
      <PageHeader size="pane"><PageTitle>{m.reader.remark.heading}</PageTitle></PageHeader>
      <div className="remark-compose">
        <FormTextarea
          aria-label={m.reader.rail.tabs.remark} placeholder={m.reader.remark.placeholder}
          {...edit.fieldProps(save)}
        />
        <CommitActions place="item" saving={saving} canSave={!unchanged} onSave={save} />
      </div>
    </aside>
  )
}
