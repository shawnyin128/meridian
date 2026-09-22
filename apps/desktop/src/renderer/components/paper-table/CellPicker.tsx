import { useRef, useState } from 'react'
import type { PaperColumn } from '../../../shared/contract.js'
import { useCandidateKeys } from '../../hooks/useCandidateKeys.js'
import { useMessages } from '../../messages/useMessages.js'
import { IconCheck, IconPlus } from '../icons.js'
import { PickerPopover } from '../PickerPopover.js'
import { FormInput } from '../FormControls.js'

/**
 * The lines to be drawn in the pop-up layer at this moment: the ones containing `typed` (lowercase substrings) in `options` are `hits`; `isNew`
 * Ask if there is an extra line "New" at the end - it is required only if the typed word is not empty and is not equal to any of the options. If equal, the ratio will be in lower case.
 * So the only difference between upper and lower case counts as the same option. `typed` contains what the words in the input box look like after removing the leading and trailing spaces.
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
 * Grid editor for selection columns and multi-select columns: an input box in the grid serves as an anchor, and a layer of existing options and typed words in this column are hung below.
 * Screen these rows. If the rows cannot be screened, there will be an extra row of "New "X"". Click a line to report the option of this line; Enter to report the typed word - related to a certain
 * If the option only differs in uppercase and lowercase letters, the option itself will be reported. Otherwise, a new one will be reported; Esc and click will not be written anywhere else. Vision is
 * The demo's `.ctxmenu.drop` and `.rrow` / `.mk` are opened and closed by Radix.
 * `onCommit` collects the option that is activated now, and whether it should be added to this column first; why does this cell become
 * Count outside. After the new creation, the input box is cleared and the pop-up layer remains.
 */
export function CellPicker({ column, values, onCommit, onClose }: {
  column: PaperColumn
  /** The value filled in this box at the moment can only be one in the single-choice column. */
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
