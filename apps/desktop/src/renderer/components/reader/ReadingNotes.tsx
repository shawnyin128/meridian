import { useEffect, useRef } from 'react'
import type { PaperHighlight, PaperNote, PaperReading, ReadingMutation } from '../../../shared/contract.js'
import { editField, type Drafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormTextarea } from '../FormControls.js'
import { EmptyState } from '../EmptyState.js'

function NoteCard({ note, edits, onSave, onDelete, onJump }: {
  note: PaperNote
  edits: Drafts<EditDraft>
  onSave: (text: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onJump: () => void
}) {
  const m = useMessages()
  const edit = editField(edits, `note:${note.id}`, note.text)
  const text = edit.text
  const changed = text.trim() !== note.text
  return (
    <article className="reading-card">
      <button className="reading-page" onClick={onJump}>{m.reader.page.at(note.page)}</button>
      <FormTextarea aria-label={m.reader.notes.pageAria(note.page)} {...edit.fieldProps} />
      <div className="reading-actions">
        <button className="reading-delete" onClick={() => { void onDelete() }}>{m.common.delete}</button>
        <button
          className="btn pri" disabled={!changed || text.trim() === ''}
          onClick={() => { if (!edit.stale) void onSave(text.trim()).then((saved) => { if (saved) edit.drop() }) }}
        >{m.common.save}</button>
      </div>
    </article>
  )
}

function HighlightCard({ highlight, edits, onSave, onDelete, onJump, focus }: {
  highlight: PaperHighlight
  edits: Drafts<EditDraft>
  onSave: (note: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onJump: () => void
  focus: boolean
}) {
  const m = useMessages()
  const edit = editField(edits, `highlight:${highlight.id}`, highlight.note)
  const note = edit.text
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (focus) input.current?.focus() }, [focus])
  return (
    <article className={`reading-card highlight-card ${highlight.color}`}>
      <button className="reading-page" onClick={onJump}>{m.reader.highlights.jumpToPage(highlight.page)}</button>
      <blockquote>{highlight.quote}</blockquote>
      <FormTextarea
        ref={input}
        aria-label={m.reader.highlights.noteAria(highlight.page)} placeholder={m.reader.highlights.annotate}
        {...edit.fieldProps}
      />
      <div className="reading-actions">
        <button className="reading-delete" onClick={() => { void onDelete() }}>{m.common.delete}</button>
        <button
          className="btn pri" disabled={note === highlight.note}
          onClick={() => { if (!edit.stale) void onSave(note).then((saved) => { if (saved) edit.drop() }) }}
        >{m.common.save}</button>
      </div>
    </article>
  )
}

/**
 * The reader's right-rail panel of the user's own reading state. It only submits semantic
 * mutations and knows nothing of how the PDF or Core stores them.
 */
export function ReadingNotes({
  reading, currentPage, saving, onMutate, onJump, mode = 'all', focusHighlightId = null, drafts, edits,
}: {
  reading: PaperReading
  currentPage: number
  saving: boolean
  onMutate: (mutation: ReadingMutation) => Promise<boolean>
  onJump: (page: number) => void
  mode?: 'all' | 'highlights' | 'notes'
  focusHighlightId?: string | null
  drafts: Drafts
  edits: Drafts<EditDraft>
}) {
  const m = useMessages()
  const compose = `new-note:${reading.paperId}`
  const draft = drafts.get(compose) ?? ''
  const addNote = async () => {
    const text = draft.trim()
    if (text === '') return
    if (await onMutate({ kind: 'note.add', page: currentPage, text })) drafts.drop(compose)
  }
  return (
    <aside className="reading-notes" aria-label={m.reader.notes.ariaLabel}>
      <header>
        <strong>
          {mode === 'highlights' ? m.reader.rail.tabs.highlights : m.reader.notes.heading(reading.notes.length)}
        </strong>
        <span>{m.reader.page.at(currentPage)}</span>
      </header>
      {mode === 'highlights' ? null : <div className="note-compose">
        <FormTextarea
          aria-label={m.reader.notes.newAria} placeholder={m.reader.notes.placeholder(currentPage)}
          value={draft} onChange={(event) => drafts.set(compose, event.target.value)}
        />
        <button
          className="btn pri" disabled={draft.trim() === '' || saving}
          onClick={() => { void addNote() }}
        >{m.reader.notes.add}</button>
      </div>}
      <div className="reading-list">
        {mode === 'notes' ? null : reading.highlights.map((highlight) => (
          <HighlightCard
            key={highlight.id} highlight={highlight} edits={edits} onJump={() => onJump(highlight.page)}
            focus={focusHighlightId === highlight.id}
            onSave={(note) => onMutate({ kind: 'highlight.update', id: highlight.id, note })}
            onDelete={() => onMutate({ kind: 'highlight.delete', id: highlight.id })}
          />
        ))}
        {mode === 'highlights' ? null : reading.notes.map((note) => (
          <NoteCard
            key={note.id} note={note} edits={edits} onJump={() => onJump(note.page)}
            onSave={(text) => onMutate({ kind: 'note.update', id: note.id, text })}
            onDelete={() => onMutate({ kind: 'note.delete', id: note.id })}
          />
        ))}
        {(mode === 'notes' ? reading.notes.length === 0 : mode === 'highlights'
          ? reading.highlights.length === 0 : reading.highlights.length === 0 && reading.notes.length === 0)
          ? <EmptyState variant="section">{m.reader.emptyReading}</EmptyState>
          : null}
      </div>
    </aside>
  )
}
