import type { PaperReading } from '../../../shared/contract.js'
import type { Drafts } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormTextarea } from '../FormControls.js'

/**
 * The remark in the reader's right rail: a free thought about the whole paper, tied to no page. The
 * whole text is saved as a replacement, and Save stays disabled while it is unchanged.
 */
export function ReadingRemark({ reading, saving, onSave, drafts }: {
  reading: PaperReading
  saving: boolean
  onSave: (text: string) => Promise<boolean>
  drafts: Drafts
}) {
  const m = useMessages()
  const target = `remark:${reading.paperId}`
  const held = reading.remark
  const text = drafts.get(target) ?? held
  return (
    <aside className="reading-remark" aria-label={m.reader.rail.tabs.remark}>
      <header><strong>{m.reader.remark.heading}</strong></header>
      <div className="remark-compose">
        <FormTextarea
          aria-label={m.reader.rail.tabs.remark} placeholder={m.reader.remark.placeholder}
          value={text} onChange={(event) => drafts.set(target, event.target.value)}
        />
        <button
          className="btn pri" disabled={saving || text.trim() === held}
          onClick={() => { void onSave(text.trim()).then((saved) => { if (saved) drafts.drop(target) }) }}
        >{m.reader.remark.save}</button>
      </div>
    </aside>
  )
}
