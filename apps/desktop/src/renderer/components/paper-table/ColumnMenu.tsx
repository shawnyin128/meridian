import { useId, useRef, useState } from 'react'
import type { PaperColumn, PaperColumns } from '../../../shared/contract.js'
import { LOCKED_PAPER_COLUMNS } from '../../../shared/vocabulary.js'
import { useDrafts } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionPopover } from '../ActionPopover.js'
import { FoldToggle } from '../FoldToggle.js'
import { IconButton } from '../IconButton.js'
import { IconCheck, IconGear, IconPencil, IconTrash } from '../icons.js'
import { ColumnTypeIcon, ColumnTypePicker } from './ColumnAdd.js'
import { builtinNames, takenLabel } from './column-key.js'
import { COLUMNS } from './PaperTable.js'
import { afterLeaving, InlineDraftInput } from '../InlineDraftInput.js'
import { FadeText } from '../FadeText.js'
import { RowActions } from '../StructuredList.js'

/**
 * The column menu, opened from the gear at the end of the table header. Built-in columns take one
 * row each, and clicking a row shows or hides the column; locked columns are grayed out and inert.
 * Custom columns take one row each, with rename and delete at the end of the row. Adding a column
 * is not here but the + at the end of the header. Styled as the demo's colMenu, opened and closed
 * by Radix; while a rename input is open, Esc cancels only the rename and keeps the menu, and a
 * press anywhere else, inside the menu or outside it, or focus leaving the input renames as Enter
 * does. The menu closes, and another rename opens, only once the rename is accepted.
 * Each change goes to `onChange` as a function that takes the last confirmed column configuration
 * and returns the whole changed one; a name another column on the table already has is refused,
 * and renaming to the column's own name just closes the input.
 * Select and multi-select columns have a fold toggle before their name that expands their options,
 * one per row, with rename and delete at the end of the row. Renaming goes to
 * `onRenameOption` (the papers holding it change too); deleting goes to `onChange` as usual, and
 * while any paper in the vault still holds that option, Core rejects it and a refusal notice shows
 * Core's message.
 * Custom column rows also have a "Change type" button that expands the row of type options used
 * when adding a column; clicking or arrowing to another option calls `onRetype`, whose promise
 * settles once that write is final (written or rejected). While a type change is still being
 * written, the options show the last requested type, the arrow keys start from it, and picking it
 * again does nothing; once everything settles, they return to the type in `columns`.
 */
export function ColumnMenu({ columns, onChange, onRenameOption, onRetype }: {
  columns: PaperColumns
  onChange: (update: (base: PaperColumns) => PaperColumns) => void
  onRenameOption: (key: string, from: string, to: string) => void
  onRetype: (key: string, type: PaperColumn['type']) => Promise<unknown>
}) {
  const m = useMessages()
  const names = builtinNames(m, columns).columns
  const optionsId = useId()
  // A rename being typed is kept as a draft, and reopens the menu at its column or option.
  const kept = useDrafts<string>(['papers', 'columns'], [
    ...columns.custom.map((c) => `name:${c.key}`),
    ...columns.custom.flatMap((c) => c.options.map((o) => `option:${c.key}:${o}`)),
  ])
  const keptName = columns.custom.find((c) => kept.get(`name:${c.key}`) !== undefined)?.key ?? null
  const keptOption = columns.custom.flatMap((c) => c.options.map((from) => ({ key: c.key, from })))
    .find((option) => kept.get(`option:${option.key}:${option.from}`) !== undefined) ?? null
  const [ownOpen, setOpen] = useState(false)
  const open = ownOpen || keptName !== null || keptOption !== null
  // The key of the column being renamed
  const [ownRenaming, setOwnRenaming] = useState<string | null>(null)
  const renaming = ownRenaming ?? keptName
  const setRenaming = (next: string | null) => {
    if (next === null && renaming !== null) kept.drop(`name:${renaming}`)
    setOwnRenaming(next)
  }
  // The key of the column whose options are being expanded
  const [ownOpened, setOpened] = useState<string | null>(null)
  const opened = ownOpened ?? keptOption?.key ?? null
  // The option being renamed
  const [ownRenamingOption, setOwnRenamingOption] = useState<{ key: string; from: string } | null>(null)
  const renamingOption = ownRenamingOption ?? keptOption
  const setRenamingOption = (next: { key: string; from: string } | null) => {
    if (next === null && renamingOption !== null) kept.drop(`option:${renamingOption.key}:${renamingOption.from}`)
    setOwnRenamingOption(next)
  }
  const leaveRename = useRef<(() => Promise<boolean>) | null>(null)
  const leaveOptionRename = useRef<(() => Promise<boolean>) | null>(null)
  // The key of the column whose type options are expanded
  const [retyping, setRetyping] = useState<string | null>(null)
  // Columns whose type change is still being written: the last requested type, with a token that
  // identifies that request.
  const [requested, setRequested] = useState<Record<string, { type: PaperColumn['type']; token: object }>>({})

  const toggle = (k: string) => onChange((base) => ({
    ...base,
    hidden: base.hidden.includes(k) ? base.hidden.filter((h) => h !== k) : [...base.hidden, k],
  }))

  /**
   * The selected type option: the last requested type while a type change is being written,
   * otherwise the configured one.
   */
  const pickedType = (c: PaperColumn) => requested[c.key]?.type ?? c.type

  /**
   * Requests `type` for column `key`; once that write is final and is still the column's last
   * request, the options return to the configured type.
   */
  const retype = (key: string, type: PaperColumn['type']) => {
    const token = {}
    setRequested((r) => ({ ...r, [key]: { type, token } }))
    void onRetype(key, type).then(() => setRequested((r) => {
      if (r[key]?.token !== token) return r
      const rest = { ...r }
      delete rest[key]
      return rest
    }))
  }

  return (
    <ActionPopover
      open={open}
      onOpenChange={(next) => {
        if (!next && (renaming !== null || renamingOption !== null)) return
        setOpen(next)
        setRenaming(null)
        setRenamingOption(null)
        setOpened(null)
        setRetyping(null)
      }}
      sticky="always" trigger={(
        <IconButton label={m.papers.columnMenu.settings} size="nested"><IconGear /></IconButton>
      )}
      contentProps={{
          // Radix takes Esc in the document's capture phase, so the input cannot stop it; during a
          // rename, keep the popover open here and only cancel the rename.
          onEscapeKeyDown: (e) => {
            if (renamingOption !== null) { e.preventDefault(); setRenamingOption(null); return }
            if (renaming !== null) { e.preventDefault(); setRenaming(null) }
          },
      }}
    >
          {/* sticky="always" above: adding a column widens the table and slides the header's gear out of
              view; the menu still stays in the window, like the demo's clamping when it opens a popover */}
          {COLUMNS.map((c) => {
            const locked = (LOCKED_PAPER_COLUMNS as readonly string[]).includes(c.k)
            const shown = !columns.hidden.includes(c.k)
            const body = (
              <>
                <span className="ck">{shown ? <IconCheck /> : null}</span>
                <FadeText className="cl" label={names[c.k]}>{names[c.k]}</FadeText>
              </>
            )
            return locked
              ? <div key={c.k} className="mi colrow locked">{body}</div>
              : (
                <button
                  type="button" key={c.k} className="mi colrow" aria-pressed={shown} onClick={() => toggle(c.k)}
                >{body}</button>
              )
          })}
          {columns.custom.map((c) => (
            <div key={c.key}>
              <div className="mi colrow" data-row-actions="">
                <span className="ck">
                  {c.type === 'text' ? null : (
                    <FoldToggle
                      variant="caret" label={m.papers.columnMenu.options} open={opened === c.key}
                      controls={`${optionsId}${c.key}`} onToggle={() => setOpened(opened === c.key ? null : c.key)}
                    />
                  )}
                </span>
                {renaming === c.key
                  ? (
                    <InlineDraftInput
                      className="celledit" defaultValue={c.label} leaveRef={leaveRename}
                      kept={{ drafts: kept, target: `name:${c.key}` }}
                      onCancel={() => setRenaming(null)}
                      onSubmit={(label) => {
                        if (label === c.label) return true
                        const builtinLabels = [names.title, ...COLUMNS.map((k) => names[k.k])]
                        if (takenLabel(label, columns, builtinLabels)) return false
                        onChange((base) => ({
                          ...base,
                          custom: base.custom.map((x) => (x.key === c.key ? { ...x, label } : x)),
                        }))
                        return true
                      }}
                    />
                  )
                  : <FadeText className="cl" label={c.label}>{c.label}</FadeText>}
                <RowActions>
                  <IconButton
                    label={m.papers.columnMenu.changeType} size="nested" className="cmx typex" aria-expanded={retyping === c.key}
                    onClick={() => setRetyping((k) => (k === c.key ? null : c.key))}
                  ><ColumnTypeIcon type={c.type} /></IconButton>
                  <IconButton
                    label={m.papers.columnMenu.rename} size="nested" className="cmx"
                    onClick={() => afterLeaving(leaveRename, () => setRenaming(c.key))}
                  ><IconPencil /></IconButton>
                  {/* Core rejects group keys with no column, so a deleted column leaves the groups too. */}
                  <IconButton
                    label={m.papers.columnMenu.deleteColumn} size="nested" tone="danger" className="cmx"
                    onClick={() => onChange((base) => ({
                      ...base,
                      custom: base.custom.filter((x) => x.key !== c.key),
                      groups: base.groups.filter((g) => g !== c.key),
                      order: base.order?.filter((key) => key !== c.key),
                    }))}
                  ><IconTrash /></IconButton>
                </RowActions>
              </div>
              {retyping === c.key
                ? (
                  <div className="typerow">
                    <ColumnTypePicker
                      type={pickedType(c)} onPick={(t) => { if (t !== pickedType(c)) retype(c.key, t) }}
                    />
                  </div>
                )
                : null}
              {opened !== c.key || c.type === 'text'
                ? null
                : (
                  <div id={`${optionsId}${c.key}`}>
                    {c.options.length === 0
                      ? <div className="mi optrow optnone">{m.papers.columnMenu.noOptionsHint}</div>
                      : c.options.map((o) => (
                        <div key={o} className="mi optrow" data-row-actions="">
                          {renamingOption?.key === c.key && renamingOption.from === o
                            ? (
                              <InlineDraftInput
                                className="celledit" defaultValue={o} leaveRef={leaveOptionRename}
                                kept={{ drafts: kept, target: `option:${c.key}:${o}` }}
                                onCancel={() => setRenamingOption(null)}
                                onSubmit={(to) => {
                                  if (to === o) return true
                                  if (c.options.includes(to)) return false
                                  onRenameOption(c.key, o, to)
                                  return true
                                }}
                              />
                            )
                            : <FadeText className="cl" label={o}>{o}</FadeText>}
                          <RowActions>
                            <IconButton
                              label={m.papers.columnMenu.renameOption} size="nested" className="cmx"
                              onClick={() => afterLeaving(
                                leaveOptionRename, () => setRenamingOption({ key: c.key, from: o }),
                              )}
                            ><IconPencil /></IconButton>
                            <IconButton
                              label={m.papers.columnMenu.deleteOption} size="nested" tone="danger" className="cmx"
                              onClick={() => onChange((base) => ({
                                ...base,
                                custom: base.custom.map((x) => (x.key === c.key
                                  ? { ...x, options: x.options.filter((v) => v !== o) }
                                  : x)),
                              }))}
                            ><IconTrash /></IconButton>
                          </RowActions>
                        </div>
                      ))}
                  </div>
                )}
            </div>
          ))}
    </ActionPopover>
  )
}
