import { useRef, useState } from 'react'
import type { PaperColumn } from '../../../shared/contract.js'
import { useCandidateKeys } from '../../hooks/useCandidateKeys.js'
import { useDrafts } from '../../hooks/useDrafts.js'
import { useInlineDraft } from '../../hooks/useInlineDraft.js'
import { NO_TRIGGERS } from '../../hooks/useOnLeave.js'
import { composing } from '../../lib/keyboard.js'
import { useMessages } from '../../messages/useMessages.js'
import { CandidateField } from '../CandidateField.js'
import { FormInput } from '../FormControls.js'
import { Tag } from '../Tag.js'

/**
 * The rows the popover shows now: `hits` are the `options` that contain `typed` (as a lowercase
 * substring); `isNew` says whether a "Create" row follows them, needed only when the typed text is
 * not empty and equals no option. Equality is compared in lowercase, so a difference in case alone
 * counts as the same option. `typed` is the input's text with leading and trailing spaces removed.
 */
export function optionRows(
  options: readonly string[], typed: string,
): { hits: string[]; isNew: boolean } {
  const needle = typed.toLowerCase()
  return {
    hits: options.filter((o) => !needle || o.toLowerCase().includes(needle)),
    isNew: typed !== '' && !options.some((o) => o.toLowerCase() === needle),
  }
}

/**
 * Cell editor for select and multi-select columns, on CandidateField: an input in the cell, and below
 * it the column's existing options, filtered by the typed text, each checked when the cell holds it.
 * When the typed text equals no option, a row that creates it follows them. Clicking a row reports that row's
 * option; Enter reports the highlighted row's, which the arrow keys or the pointer move; Esc writes
 * nothing. Enter and Esc pressed while an input method is composing belong to it and do
 * neither. A press outside the input and its popover, or focus leaving them, reports what
 * Enter would, except that a highlighted option the cell already holds is left as it is, and closes
 * the picker once `onCommit` resolves true; with nothing typed it just closes. A refused report
 * keeps the picker and its text and marks the input invalid.
 * `onCommit` receives the option chosen now and whether it must first be added to this column, and
 * returns whether it was written; otherwise when this cell closes is decided by the caller. After a
 * create, the input is cleared and the popover stays open.
 */
export function CellPicker({ column, values, onCommit, onClose, keep }: {
  column: PaperColumn
  /** The values this cell holds now; a select column holds at most one. */
  values: string[]
  onCommit: (value: string, created: boolean) => boolean | Promise<boolean>
  onClose: () => void
  /** Keeps what is typed as a draft under `target` of `scope`, which the picker starts from; closing drops it. */
  keep: { scope: readonly string[]; target: string }
}) {
  const m = useMessages()
  const kept = useDrafts<string>(keep.scope)
  const [q, setOwnQ] = useState(kept.get(keep.target) ?? '')
  const setQ = (next: string) => {
    setOwnQ(next)
    kept.set(keep.target, next)
  }
  const anchor = useRef<HTMLInputElement>(null)

  const typed = q.trim()
  const { hits, isNew } = optionRows(column.options, typed)
  const create = () => {
    setOwnQ('')
    kept.drop(keep.target)
    void onCommit(typed, true)
  }

  // The create row, when there is one, is the last row the keys and the pointer move through.
  const keys = useCandidateKeys(hits.length + (isNew ? 1 : 0), (i) => {
    if (i < hits.length) void onCommit(hits[i]!, false)
    else create()
  })
  const draft = useInlineDraft({
    row: anchor, triggers: NO_TRIGGERS, onCancel: onClose, isEmpty: () => typed === '',
    kept: { drafts: kept, target: keep.target },
    onSubmit: () => {
      const hit = hits[keys.active]
      if (hit === undefined) return onCommit(typed, true)
      return values.includes(hit) || onCommit(hit, false)
    },
  })

  return (
    <CandidateField
      anchorRef={anchor} keys={keys}
      field={(
        <FormInput
          appearance="inline" className="celledit" autoComplete="off" autoFocus value={q} ref={anchor}
          placeholder={m.papers.cellPicker.placeholder}
          aria-invalid={draft.inputProps['aria-invalid']} onInput={draft.inputProps.onInput}
          onClick={(e) => e.stopPropagation()}
          // The row itself opens its own right-click menu on any descendant; a right-click on the
          // picker's own input must not open it.
          onContextMenu={(e) => e.stopPropagation()}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            keys.onKeyDown(e)
            if (e.key === 'Escape') e.stopPropagation()
            if (composing(e.nativeEvent)) return
            if (e.key === 'Escape') draft.cancel()
          }}
        />
      )}
      candidates={hits.map((o) => ({ id: o, label: <Tag shape="chip" className="tagchip">{o}</Tag>, checked: values.includes(o) }))}
      onPick={(candidate) => { void onCommit(candidate.id, false) }}
      create={isNew ? { text: typed, label: m.papers.cellPicker.createNew(typed), onCreate: create } : undefined}
      empty={m.papers.columnMenu.noOptionsHint}
    />
  )
}
