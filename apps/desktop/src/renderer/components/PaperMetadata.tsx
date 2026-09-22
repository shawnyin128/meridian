import { useRef, useState } from 'react'
import type { PaperFields, PaperRow, ReadState } from '../../shared/contract.js'
import { READ_STATES } from '../../shared/vocabulary.js'
import { papers } from '../ipc.js'
import type { Catalog } from '../messages/catalog.js'
import { useMessages } from '../messages/useMessages.js'
import { useToast } from '../shell/AppShell.js'
import { InlineMetadataField } from './InlineField.js'
import { ProjectChips } from './ProjectChips.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import './PaperMetadata.css'

export function RatingStars({ value, onChange, disabled = false }: {
  value: number | undefined
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const m = useMessages()
  return (
    <span className="rating-stars" aria-label={value === undefined ? m.papers.rating.none : m.papers.rating.stars(value)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star} type="button" disabled={disabled} aria-label={m.papers.rating.stars(star)}
          className={star <= (value ?? 0) ? 'rated' : ''}
          onClick={(event) => { event.stopPropagation(); onChange(star) }}
        >★</button>
      ))}
    </span>
  )
}

type EditableField = 'title' | 'shortTitle' | 'authors' | 'venue' | 'year'
  | 'identifier' | 'submitted' | 'readState' | 'topics'

const splitList = (value: string): string[] => value
  .split(/[,，;；\n]/).map((item) => item.trim()).filter(Boolean)

function draftOf(paper: PaperRow, field: EditableField): string {
  if (field === 'authors') return (paper.authors ?? []).join(', ')
  if (field === 'topics') return paper.topics.join(', ')
  if (field === 'year') return paper.year?.toString() ?? ''
  if (field === 'shortTitle') return paper.shortTitle ?? ''
  if (field === 'identifier') return paper.identifier ?? ''
  if (field === 'submitted') return paper.submitted ?? ''
  return paper[field]
}

function parsedPatch(
  field: EditableField, value: string, validation: Catalog['papers']['metadata']['validation'],
): Partial<PaperFields> | Error {
  const trimmed = value.trim()
  if (field === 'title') return trimmed === '' ? new Error(validation.titleRequired) : { title: trimmed }
  if (field === 'shortTitle') return { shortTitle: trimmed || null }
  if (field === 'authors') return { authors: splitList(value) }
  if (field === 'venue') return { venue: trimmed }
  if (field === 'year') {
    if (trimmed === '') return { year: null }
    const year = Number(trimmed)
    return Number.isInteger(year) && year >= 1000 && year <= 3000
      ? { year } : new Error(validation.yearRange)
  }
  if (field === 'identifier') return { identifier: trimmed || null }
  if (field === 'submitted') return { submitted: trimmed || null }
  if (field === 'topics') return { topics: splitList(value) }
  return READ_STATES.includes(value as ReadState)
    ? { readState: value as ReadState } : new Error(validation.readStateInvalid)
}

function currentValue(paper: PaperRow, field: EditableField | 'rating'): unknown {
  if (field === 'authors') return paper.authors ?? []
  if (field === 'shortTitle') return paper.shortTitle ?? null
  if (field === 'year') return paper.year ?? null
  if (field === 'rating') return paper.rating ?? null
  if (field === 'identifier') return paper.identifier ?? null
  if (field === 'submitted') return paper.submitted ?? null
  return paper[field]
}

function patchValue(patch: Partial<PaperFields>): unknown {
  return Object.values(patch)[0]
}

/** The property list always remains in reading form; only the value clicked by the user is replaced with an edit control. */
export function PaperMetadata({ paper, onSaved }: {
  paper: PaperRow
  onSaved: (paper: PaperRow) => void
}) {
  const m = useMessages()
  const labels = m.papers.metadata.fields
  const write = useVaultWrite()
  const toast = useToast()
  const [ratingSaving, setRatingSaving] = useState(false)
  const ratingBusy = useRef(false)

  const savePatch = async (
    field: EditableField | 'rating', patch: Partial<PaperFields>,
  ): Promise<boolean> => {
    if (JSON.stringify(currentValue(paper, field)) === JSON.stringify(patchValue(patch))) return true
    let fresh: PaperRow | null = null
    const ok = await write(papers.update(paper.id, patch).then(async () => {
      fresh = await papers.get(paper.id)
    }), { note: m.papers.metadata.updated(labels[field]) })
    if (ok && fresh !== null) onSaved(fresh)
    return ok
  }

  const editableRow = (field: EditableField, display: string) => (
    <>
      <dt>{labels[field]}</dt>
      <dd className="paper-meta-editable">
        <InlineMetadataField
          key={`${paper.id}:${field}`} label={labels[field]} value={draftOf(paper, field)} display={display || '—'}
          type={field === 'submitted' ? 'date' : 'text'}
          inputMode={field === 'year' ? 'numeric' : 'text'}
          {...(field === 'readState' ? { options: READ_STATES } : {})}
          onSave={(value) => {
            const parsed = parsedPatch(field, value, m.papers.metadata.validation)
            if (parsed instanceof Error) { toast(parsed.message); return false }
            return savePatch(field, parsed)
          }}
        />
      </dd>
    </>
  )

  return (
    <div className="paper-meta" aria-busy={ratingSaving}>
      <div className="paper-meta-toolbar"><strong>{m.papers.metadata.heading}</strong></div>
      <dl className="paper-meta-list">
        {editableRow('title', paper.title)}
        {editableRow('shortTitle', paper.shortTitle ?? '')}
        {editableRow('authors', paper.authors?.join(', ') ?? '')}
        {editableRow('venue', paper.venue)}
        {editableRow('year', paper.year?.toString() ?? '')}
        <dt>{labels.rating}</dt>
        <dd>
          <RatingStars
            value={paper.rating} disabled={ratingSaving}
            onChange={(rating) => {
              if (ratingBusy.current) return
              ratingBusy.current = true
              setRatingSaving(true)
              void savePatch('rating', { rating: rating === paper.rating ? null : rating })
                .finally(() => { ratingBusy.current = false; setRatingSaving(false) })
            }}
          />
        </dd>
        {editableRow('identifier', paper.identifier ?? '')}
        {editableRow('submitted', paper.submitted ?? '')}
        {editableRow('readState', paper.readState)}
        {editableRow('topics', paper.topics.join('、'))}
        <dt>{m.papers.metadata.projectsLabel}</dt>
        <dd className="paper-meta-projects">
          <ProjectChips paper={paper} onError={(error) => toast(error.message)} />
        </dd>
        <dt>{m.papers.metadata.wikiLabel}</dt><dd>{paper.pageState || '—'}</dd>
        <dt>{m.papers.metadata.fileLabel}</dt>
        <dd>{m.papers.metadata.fileSummary(String(paper.pageCount || '—'))}</dd>
      </dl>
    </div>
  )
}
