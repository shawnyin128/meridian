import { useRef, useState } from 'react'
import type { PaperColumn } from '../../../shared/contract.js'
import { useCandidateKeys } from '../../hooks/useCandidateKeys.js'
import { useMessages } from '../../messages/useMessages.js'
import { IconCheck, IconPlus } from '../icons.js'
import { PickerPopover } from '../PickerPopover.js'
import { FormInput } from '../FormControls.js'

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
 * Cell editor for select and multi-select columns: an input in the cell is the anchor, and below it
 * a popover lists the column's existing options, filtered by the typed text. When the typed text
 * equals no option, an extra "Create "X"" row appears. Clicking a row reports that row's option;
 * Enter reports the typed text, as the option itself when it differs from one only in case,
 * otherwise as a new one; Esc and a click elsewhere write nothing. Styled as the demo's
 * `.ctxmenu.drop` and `.rrow` / `.mk`, opened and closed by Radix.
 * `onCommit` receives the option chosen now and whether it must first be added to this column;
 * when this cell closes is decided by the caller. After a create, the input is cleared and the
 * popover stays open.
 */
export function CellPicker({ column, values, onCommit, onClose }: {
  column: PaperColumn
  /** The values this cell holds now; a select column holds at most one. */
  values: string[]
  onCommit: (value: string, created: boolean) => void
  onClose: () => void
}) {
  const m = useMessages()
  const [q, setQ] = useState('')
  const anchor = useRef<HTMLInputElement>(null)

  const typed = q.trim()
  const { hits, isNew } = optionRows(column.options, typed)
  const keys = useCandidateKeys(hits.length, (i) => onCommit(hits[i]!, false))

  const create = () => {
    setQ('')
    onCommit(typed, true)
  }

  return (
    <PickerPopover
      open anchorRef={anchor} stopClickPropagation
      onOpenChange={(next) => { if (!next) onClose() }}
      anchor={(
        <FormInput
          className="celledit" autoComplete="off" autoFocus value={q} ref={anchor}
          placeholder={m.papers.cellPicker.placeholder}
          onClick={(e) => e.stopPropagation()}
          // The row itself opens its own right-click menu on any descendant; left unguarded, that menu's
          // auto-focused first item fires this popover's focus-outside dismissal even though the click
          // landed on the picker's own input.
          onContextMenu={(e) => e.stopPropagation()}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            keys.onKeyDown(e)
            if (e.key === 'Enter' && typed && hits.length === 0 && isNew) create()
            if (e.key === 'Escape') { e.stopPropagation(); onClose() }
          }}
        />
      )}
      content={(
        <>
          {hits.length === 0 && !isNew
            ? <div className="rh optnone">{m.papers.columnMenu.noOptionsHint}</div>
            : null}
          {hits.map((o, i) => (
            <div className={i === keys.active ? 'rrow opt on' : 'rrow opt'} key={o} onClick={() => onCommit(o, false)}>
              <span className="ck">{values.includes(o) ? <IconCheck /> : null}</span>
              <span className="tagchip">{o}</span>
            </div>
          ))}
          {isNew
            ? (
              <div className="rrow mk" onClick={create}>
                <IconPlus />
                <span>{m.papers.cellPicker.createNew(typed)}</span>
              </div>
            )
            : null}
        </>
      )}
    />
  )
}
