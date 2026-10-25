import { useEffect, useRef } from 'react'
import type { PaperHighlight, PaperNote, PaperReading, ReadingMutation } from '../../../shared/contract.js'
import { editField, type Drafts, type EditDraft } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormTextarea } from '../FormControls.js'
import { EmptyState } from '../EmptyState.js'
import { IconButton } from '../IconButton.js'
import { IconTrash } from '../icons.js'
import { Item } from '../Item.js'
import { SourceAnchor } from '../SourceAnchor.js'
import { PageHeader, PageNote, PageTitle } from '../PageShell.js'
import { ScrollArea } from '../ScrollArea.js'
import { useClipped } from '../../hooks/useClipped.js'
import { CommitActions } from '../CommitActions.js'

/** A note or highlight card's delete, for the row-actions slot at the end of the card's top line. */
function ReadingDelete({ onDelete }: { onDelete: () => Promise<boolean> }) {
  const m = useMessages()
  return (
    <IconButton
      label={m.common.delete} size="nested" tone="danger" className="reading-delete" onClick={() => { void onDelete() }}
    ><IconTrash /></IconButton>
  )
}

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
    <Item
      density="card" className="reading-card" meta={<SourceAnchor page={note.page} onOpen={onJump} />}
      actions={<ReadingDelete onDelete={onDelete} />}
    >
      <FormTextarea aria-label={m.reader.notes.pageAria(note.page)} {...edit.fieldProps} />
      <div className="reading-actions">
        <CommitActions
          place="item" canSave={changed && text.trim() !== ''}
          onSave={() => { if (!edit.stale) void onSave(text.trim()).then((saved) => { if (saved) edit.drop() }) }}
        />
      </div>
    </Item>
  )
}

function HighlightCard({ highlight, edits, onSave, onDelete, onJump, focus, selected }: {
  highlight: PaperHighlight
  edits: Drafts<EditDraft>
  onSave: (note: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onJump: () => void
  focus: boolean
  /** Whether it is the highlight selected on the page: it shows as selected and scrolls into view. */
  selected: boolean
}) {
  const m = useMessages()
  const edit = editField(edits, `highlight:${highlight.id}`, highlight.note)
  const note = edit.text
  const input = useRef<HTMLTextAreaElement>(null)
  const quote = useRef<HTMLQuoteElement>(null)
  const quoteCut = useClipped(quote, highlight.quote, true)
  const card = useRef<HTMLElement>(null)
  useEffect(() => { if (focus) input.current?.focus() }, [focus])
  useEffect(() => { if (selected) card.current?.scrollIntoView({ block: 'nearest' }) }, [selected])
  return (
    <Item
      density="card" elementRef={card} className={`reading-card highlight-card ${highlight.color}`} selected={selected}
      mark={`var(--hl-${highlight.color})`} aria-current={selected || undefined}
      meta={<SourceAnchor page={highlight.page} quote={highlight.quote} onOpen={onJump} />}
      actions={<ReadingDelete onDelete={onDelete} />}
    >
      <blockquote ref={quote} className={`fade-lines${quoteCut ? ' clipped' : ''}`}>{highlight.quote}</blockquote>
      <FormTextarea
        ref={input}
        aria-label={m.reader.highlights.noteAria(highlight.page)} placeholder={m.reader.highlights.annotate}
        {...edit.fieldProps}
      />
      <div className="reading-actions">
        <CommitActions
          place="item" canSave={note !== highlight.note}
          onSave={() => { if (!edit.stale) void onSave(note).then((saved) => { if (saved) edit.drop() }) }}
        />
      </div>
    </Item>
  )
}

/**
 * The reader's right-rail panel of the user's own reading state. It only submits semantic
 * mutations and knows nothing of how the PDF or Core stores them.
 */
export function ReadingNotes({
  reading, currentPage, saving, onMutate, onJump, mode = 'all', focusHighlightId = null, selectedHighlightId = null, drafts, edits,
}: {
  reading: PaperReading
  currentPage: number
  saving: boolean
  onMutate: (mutation: ReadingMutation) => Promise<boolean>
  onJump: (page: number) => void
  mode?: 'all' | 'highlights' | 'notes'
  focusHighlightId?: string | null
  selectedHighlightId?: string | null
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
      <PageHeader size="pane" actions={<PageNote>{m.reader.page.at(currentPage)}</PageNote>}>
        <PageTitle count={mode === 'highlights' ? undefined : reading.notes.length}>
          {mode === 'highlights' ? m.reader.rail.tabs.highlights : m.reader.notes.heading}
        </PageTitle>
      </PageHeader>
      {mode === 'highlights' ? null : <div className="note-compose">
        <FormTextarea
          aria-label={m.reader.notes.newAria} placeholder={m.reader.notes.placeholder(currentPage)}
          value={draft} onChange={(event) => drafts.set(compose, event.target.value)}
        />
        <CommitActions place="item" saving={saving} canSave={draft.trim() !== ''} onSave={() => { void addNote() }} />
      </div>}
      <ScrollArea axis="y" fill>
        <div className="reading-list">
          {mode === 'notes' ? null : reading.highlights.map((highlight) => (
            <HighlightCard
              key={highlight.id} highlight={highlight} edits={edits} onJump={() => onJump(highlight.page)}
              focus={focusHighlightId === highlight.id} selected={selectedHighlightId === highlight.id}
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
          {mode === 'notes'
            ? (reading.notes.length === 0 ? <EmptyState variant="section">{m.reader.emptyNotes}</EmptyState> : null)
            : mode === 'highlights'
              ? (reading.highlights.length === 0 ? <EmptyState variant="section">{m.reader.emptyHighlights}</EmptyState> : null)
              : (reading.highlights.length === 0 && reading.notes.length === 0
                ? <EmptyState variant="section">{m.reader.emptyReading}</EmptyState> : null)}
        </div>
      </ScrollArea>
    </aside>
  )
}
