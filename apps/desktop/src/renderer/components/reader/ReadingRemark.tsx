import { useEffect, useState } from 'react'
import type { PaperReading } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormTextarea } from '../FormControls.js'

/** The essay in the right column of the reader: a random thought about the entire article, without anchoring the page number; the entire paragraph is saved and replaced, and the save does not change if it is not modified. */
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
