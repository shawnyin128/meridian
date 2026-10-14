import { useEffect, useState } from 'react'
import type { PaperReading } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormTextarea } from '../FormControls.js'

/**
 * The remark in the reader's right rail: a free thought about the whole paper, tied to no page. The
 * whole text is saved as a replacement, and Save stays disabled while it is unchanged.
 */
export function ReadingRemark({ reading, saving, onSave }: {
  reading: PaperReading | null
  saving: boolean
  onSave: (text: string) => Promise<boolean>
}) {
  const m = useMessages()
  const held = reading?.remark ?? ''
  const [text, setText] = useState(held)
  useEffect(() => setText(held), [held])
  return (
    <aside className="reading-remark" aria-label={m.reader.rail.tabs.remark}>
      <header><strong>{m.reader.remark.heading}</strong></header>
      <div className="remark-compose">
        <FormTextarea
          aria-label={m.reader.rail.tabs.remark} placeholder={m.reader.remark.placeholder}
          value={text} onChange={(event) => setText(event.target.value)}
        />
        <button
          className="btn pri" disabled={saving || reading === null || text.trim() === held}
          onClick={() => { void onSave(text.trim()) }}
        >{m.reader.remark.save}</button>
      </div>
    </aside>
  )
}
