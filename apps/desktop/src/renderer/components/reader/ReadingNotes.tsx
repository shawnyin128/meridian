import { useEffect, useRef, useState } from 'react'
import type { PaperHighlight, PaperNote, PaperReading, ReadingMutation } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormTextarea } from '../FormControls.js'
import { EmptyState } from '../EmptyState.js'

function NoteCard({ note, onSave, onDelete, onJump }: {
  note: PaperNote
  onSave: (text: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onJump: () => void
}) {
  const m = useMessages()
  const [text, setText] = useState(note.text)
  useEffect(() => setText(note.text), [note.text])
  const changed = text.trim() !== note.text
  return (
    <article className="reading-card">
      <button className="reading-page" onClick={onJump}>{m.reader.page.at(note.page)}</button>
      <FormTextarea aria-label={m.reader.notes.pageAria(note.page)} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="reading-actions">
        <button className="reading-delete" onClick={() => { void onDelete() }}>{m.common.delete}</button>
        <button
          className="btn pri" disabled={!changed || text.trim() === ''}
          onClick={() => { void onSave(text.trim()) }}
        >{m.common.save}</button>
      </div>
    </article>
  )
}

function HighlightCard({ highlight, onSave, onDelete, onJump, focus }: {
  highlight: PaperHighlight
  onSave: (note: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onJump: () => void
  focus: boolean
}) {
  const m = useMessages()
  const [note, setNote] = useState(highlight.note)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setNote(highlight.note), [highlight.note])
  useEffect(() => { if (focus) input.current?.focus() }, [focus])
  return (
    <article className={`reading-card highlight-card ${highlight.color}`}>
      <button className="reading-page" onClick={onJump}>{m.reader.highlights.jumpToPage(highlight.page)}</button>
      <blockquote>{highlight.quote}</blockquote>
      <FormTextarea
        ref={input}
        aria-label={m.reader.highlights.noteAria(highlight.page)} placeholder={m.reader.highlights.annotate}
        value={note} onChange={(event) => setNote(event.target.value)}
      />
      <div className="reading-actions">
        <button className="reading-delete" onClick={() => { void onDelete() }}>{m.common.delete}</button>
        <button
          className="btn pri" disabled={note === highlight.note}
          onClick={() => { void onSave(note) }}
        >{m.common.save}</button>
      </div>
    </article>
  )
}

/** The personal status panel on the right side of the reader; only submits semantic commands and does not know how PDF or Core saves files. */
export function ReadingNotes({
  reading, currentPage, saving, onMutate, onJump, mode = 'all', focusHighlightId = null,
}: {
  reading: PaperReading | null
  currentPage: number
  saving: boolean
  onMutate: (mutation: ReadingMutation) => Promise<boolean>
  onJump: (page: number) => void
  mode?: 'all' | 'highlights' | 'notes'
  focusHighlightId?: string | null
}) {
  const m = useMessages()
  const [draft, setDraft] = useState('')
  const addNote = async () => {
    const text = draft.trim()
    if (text === '') return
    if (await onMutate({ kind: 'note.add', page: currentPage, text })) setDraft('')
  }
  return (
    <aside className="reading-notes" aria-label={m.reader.notes.ariaLabel}>
      <header>
        <strong>
          {mode === 'highlights' ? m.reader.rail.tabs.highlights : m.reader.notes.heading(reading?.notes.length ?? 0)}
        </strong>
        <span>{m.reader.page.at(currentPage)}</span>
      </header>
      {mode === 'highlights' ? null : <div className="note-compose">
        <FormTextarea
          aria-label={m.reader.notes.newAria} placeholder={m.reader.notes.placeholder(currentPage)}
          value={draft} onChange={(event) => setDraft(event.target.value)}
        />
        <button
          className="btn pri" disabled={draft.trim() === '' || saving}
          onClick={() => { void addNote() }}
        >{m.reader.notes.add}</button>
      </div>}
      <div className="reading-list">
        {mode === 'notes' ? null : reading?.highlights.map((highlight) => (
          <HighlightCard
            key={highlight.id} highlight={highlight} onJump={() => onJump(highlight.page)}
            focus={focusHighlightId === highlight.id}
            onSave={(note) => onMutate({ kind: 'highlight.update', id: highlight.id, note })}
            onDelete={() => onMutate({ kind: 'highlight.delete', id: highlight.id })}
          />
        ))}
        {mode === 'highlights' ? null : reading?.notes.map((note) => (
          <NoteCard
            key={note.id} note={note} onJump={() => onJump(note.page)}
            onSave={(text) => onMutate({ kind: 'note.update', id: note.id, text })}
            onDelete={() => onMutate({ kind: 'note.delete', id: note.id })}
          />
        ))}
        {reading !== null
          && (mode === 'notes' ? reading.notes.length === 0 : mode === 'highlights'
            ? reading.highlights.length === 0 : reading.highlights.length === 0 && reading.notes.length === 0)
          ? <EmptyState variant="section">{m.reader.emptyReading}</EmptyState>
          : null}
      </div>
    </aside>
  )
}
