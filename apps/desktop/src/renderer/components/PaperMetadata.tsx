import { useRef, useState, type ReactNode } from 'react'
import type { PaperFields, PaperRow, ReadState } from '../../shared/contract.js'
import { READ_STATES, READING_PAPER } from '../../shared/vocabulary.js'
import { papers } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import type { Catalog } from '../messages/catalog.js'
import { useMessages } from '../messages/useMessages.js'
import { useNotice } from '../shell/AppShell.js'
import { ChoicePicker } from './FieldPickers.js'
import { InlineMetadataField } from './InlineField.js'
import { PaperAbstract } from './paper/PaperAbstract.js'
import { PaperText } from './paper/PaperText.js'
import { PaperTopics } from './PaperTopics.js'
import { ProjectChips } from './ProjectChips.js'
import { tagClass } from './Tag.js'
import { ToggleGroup, ToggleItem } from './Toolbar.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import './PaperMetadata.css'

/**
 * A paper's rating, the same in the paper table and the detail panel: a star sets it, the current
 * star clears it. The stars are one toggle group, which joins the paper row's toolbar in the table.
 */
export function RatingStars({ value, onChange, disabled = false }: {
  value: number | undefined
  onChange: (value: number | null) => void
  disabled?: boolean
}) {
  const m = useMessages()
  return (
    <ToggleGroup
      label={value === undefined ? m.papers.rating.none : m.papers.rating.stars(value)} className="rating-stars"
      value={value === undefined ? '' : String(value)} disabled={disabled}
      onValueChange={(star) => onChange(star === '' ? null : Number(star))}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <ToggleItem
          key={star} value={String(star)} aria-label={m.papers.rating.stars(star)}
          className={star <= (value ?? 0) ? 'rated' : ''} onClick={(event) => event.stopPropagation()}
        >★</ToggleItem>
      ))}
    </ToggleGroup>
  )
}

/** A paper's reading status, the same in the paper table and the detail panel; Reading is highlighted. */
export function ReadStatePicker({ value, onPick }: {
  value: ReadState
  onPick: (readState: ReadState) => void
}) {
  return (
    <ChoicePicker
      value={value} options={READ_STATES} onPick={onPick} stopRowActivation
      className={tagClass('neutral', 'chip', value === READING_PAPER ? 'stchip on' : 'stchip')}
    />
  )
}

type EditableField = 'title' | 'shortTitle' | 'authors' | 'venue' | 'year' | 'identifier' | 'submitted'

const splitList = (value: string): string[] => value
  .split(/[,，;；\n]/).map((item) => item.trim()).filter(Boolean)

function draftOf(paper: PaperRow, field: EditableField): string {
  if (field === 'authors') return (paper.authors ?? []).join(', ')
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
  return { submitted: trimmed || null }
}

function currentValue(paper: PaperRow, field: EditableField | 'rating' | 'readState' | 'topics'): unknown {
  if (field === 'authors') return paper.authors ?? []
  if (field === 'shortTitle') return paper.shortTitle ?? null
  if (field === 'year') return paper.year ?? null
  if (field === 'rating') return paper.rating ?? null
  if (field === 'identifier') return paper.identifier ?? null
  if (field === 'submitted') return paper.submitted ?? null
  return paper[field]
}

/** The catalog name of a Wiki page state, the state as written when the catalog has none, or a dash when there is none. */
function pageStateName(state: string, names: Catalog['papers']['metadata']['pageState']): string {
  if (state === '') return '—'
  return Object.hasOwn(names, state) ? names[state as keyof typeof names] : state
}

function patchValue(patch: Partial<PaperFields>): unknown {
  return Object.values(patch)[0]
}

type SavedField = EditableField | 'rating' | 'readState' | 'topics'

/**
 * Saves a patch of one field of `paper` with an undoable notice, then hands the paper as Core now holds
 * it to `onSaved`. The returned function resolves whether the write landed; an unchanged value writes
 * nothing and resolves true.
 */
function usePaperSave(paper: PaperRow, onSaved: (paper: PaperRow) => void) {
  const m = useMessages()
  const write = useVaultWrite()
  const undo = useUndo()
  return async (field: SavedField, patch: Partial<PaperFields>): Promise<boolean> => {
    if (JSON.stringify(currentValue(paper, field)) === JSON.stringify(patchValue(patch))) return true
    let fresh: PaperRow | null = null
    const ok = await write(papers.update(paper.id, patch).then(async (recorded) => {
      fresh = await papers.get(paper.id)
      return recorded
    }), { note: m.papers.metadata.updated(m.papers.metadata.fields[field]), action: undo.change })
    if (ok && fresh !== null) onSaved(fresh)
    return ok
  }
}

/** The in-place editor of one text field of `paper`: an invalid value is refused with a notice, a valid one goes to `save`. */
function PaperFieldEditor({ paper, field, display, save }: {
  paper: PaperRow
  field: EditableField
  display: ReactNode
  save: (field: EditableField, patch: Partial<PaperFields>) => Promise<boolean>
}) {
  const m = useMessages()
  const notice = useNotice()
  return (
    <InlineMetadataField
      label={m.papers.metadata.fields[field]} value={draftOf(paper, field)} display={display || '—'}
      type={field === 'submitted' ? 'date' : 'text'}
      inputMode={field === 'year' ? 'numeric' : 'text'}
      onSave={(value) => {
        const parsed = parsedPatch(field, value, m.papers.metadata.validation)
        if (parsed instanceof Error) { notice.refusal(parsed.message); return false }
        return save(field, parsed)
      }}
    />
  )
}

/** The paper's title as the head of a panel that details the paper: shown whole, and edited in place on click. */
export function PaperTitleField({ paper, onSaved }: { paper: PaperRow; onSaved: (paper: PaperRow) => void }) {
  const save = usePaperSave(paper, onSaved)
  return <PaperFieldEditor key={paper.id} paper={paper} field="title" display={<PaperText text={paper.title} />} save={save} />
}

/**
 * The property list always remains in reading form; only the value clicked by the user is replaced with
 * an edit control. `titled` false leaves the title out, for a panel whose head is the title.
 */
export function PaperMetadata({ paper, onSaved, titled = true }: {
  paper: PaperRow
  onSaved: (paper: PaperRow) => void
  titled?: boolean
}) {
  const m = useMessages()
  const labels = m.papers.metadata.fields
  const notice = useNotice()
  const savePatch = usePaperSave(paper, onSaved)
  const [ratingSaving, setRatingSaving] = useState(false)
  const ratingBusy = useRef(false)

  const editableRow = (field: EditableField, display: ReactNode) => (
    <>
      <dt>{labels[field]}</dt>
      <dd className="paper-meta-editable">
        <PaperFieldEditor key={`${paper.id}:${field}`} paper={paper} field={field} display={display} save={savePatch} />
      </dd>
    </>
  )

  return (
    <div className="paper-meta" aria-busy={ratingSaving}>
      <dl className="paper-meta-list">
        {titled ? editableRow('title', <PaperText text={paper.title} />) : null}
        {editableRow('shortTitle', paper.shortTitle ? <PaperText text={paper.shortTitle} /> : '')}
        {editableRow('authors', paper.authors?.join(', ') ?? '')}
        <dt>{m.papers.metadata.abstractLabel}</dt>
        <dd>{paper.abstract ? <PaperAbstract text={paper.abstract} folded /> : '—'}</dd>
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
              void savePatch('rating', { rating })
                .finally(() => { ratingBusy.current = false; setRatingSaving(false) })
            }}
          />
        </dd>
        {editableRow('identifier', paper.identifier ?? '')}
        {editableRow('submitted', paper.submitted ?? '')}
        <dt>{labels.readState}</dt>
        <dd>
          <ReadStatePicker value={paper.readState} onPick={(readState) => { void savePatch('readState', { readState }) }} />
        </dd>
        <dt>{labels.topics}</dt>
        <dd className="paper-meta-topics">
          <PaperTopics
            topics={paper.topics} onError={(error) => notice.refusal(errorLabel(m, error))}
            onAdd={(topic) => savePatch('topics', { topics: [...paper.topics, topic] })}
            onRemove={(topic) => savePatch('topics', { topics: paper.topics.filter((held) => held !== topic) })}
          />
        </dd>
        <dt>{m.papers.metadata.projectsLabel}</dt>
        <dd className="paper-meta-projects">
          <ProjectChips paper={paper} onError={(error) => notice.refusal(errorLabel(m, error))} />
        </dd>
        <dt>{m.papers.metadata.wikiLabel}</dt><dd>{pageStateName(paper.pageState, m.papers.metadata.pageState)}</dd>
        <dt>{m.papers.metadata.fileLabel}</dt>
        <dd>{m.papers.metadata.fileSummary(String(paper.pageCount || '—'))}</dd>
      </dl>
    </div>
  )
}
