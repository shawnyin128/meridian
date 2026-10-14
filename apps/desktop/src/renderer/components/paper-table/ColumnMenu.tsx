import { useState } from 'react'
import type { PaperColumn, PaperColumns } from '../../../shared/contract.js'
import { LOCKED_PAPER_COLUMNS } from '../../../shared/vocabulary.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionPopover } from '../ActionPopover.js'
import { IconCheck, IconChevron, IconCross, IconGear, IconPencil } from '../icons.js'
import { ColumnTypeIcon, ColumnTypePicker } from './ColumnAdd.js'
import { takenLabel } from './column-key.js'
import { COLUMNS } from './PaperTable.js'
import { FormInput } from '../FormControls.js'

/**
 * The column menu, opened from the gear at the end of the table header. Built-in columns take one
 * row each, and clicking a row shows or hides the column; locked columns are grayed out and inert.
 * Custom columns take one row each, with rename and delete at the end of the row. Adding a column
 * is not here but the + at the end of the header. Styled as the demo's colMenu, opened and closed
 * by Radix; while a rename input is open, Esc cancels only the rename and keeps the menu.
 * Each change goes to `onChange` as a function that takes the last confirmed column configuration
 * and returns the whole changed one; a name another column on the table already has is refused,
 * and renaming to the column's own name just closes the input.
 * Select and multi-select columns have an extra toggle at the end of the row that expands their
 * options, one per row, with rename and delete at the end of the row. Renaming goes to
 * `onRenameOption` (the papers holding it change too); deleting goes to `onChange` as usual, and
 * while any paper in the vault still holds that option, Core rejects it and the banner shows
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
  const [open, setOpen] = useState(false)
  // The key of the column being renamed
  const [renaming, setRenaming] = useState<string | null>(null)
  // The key of the column whose options are being expanded
  const [opened, setOpened] = useState<string | null>(null)
  // The option being renamed
  const [renamingOption, setRenamingOption] = useState<{ key: string; from: string } | null>(null)
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
        setOpen(next)
        setRenaming(null)
        setRenamingOption(null)
        setOpened(null)
        setRetyping(null)
      }}
      sticky="always" trigger={<button className="colbtn" title={m.papers.columnMenu.settings}><IconGear /></button>}
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
            return (
              <div
                key={c.k} className={locked ? 'mi colrow locked' : 'mi colrow'}
                {...(locked ? { title: m.papers.columnMenu.locked } : { onClick: () => toggle(c.k) })}
              >
                <span className="ck">{columns.hidden.includes(c.k) ? null : <IconCheck />}</span>
                <span className="cl">{m.papers.columns[c.k]}</span>
              </div>
            )
          })}
          {columns.custom.map((c) => (
            <div key={c.key}>
              <div className="mi colrow">
                <span className="ck"><IconCheck /></span>
                {renaming === c.key
                  ? (
                    <FormInput
                      className="celledit" autoComplete="off" autoFocus defaultValue={c.label}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        const label = e.currentTarget.value.trim()
                        if (label === c.label) { setRenaming(null); return }
                        const builtinLabels = [m.papers.columns.title, ...COLUMNS.map((k) => m.papers.columns[k.k])]
                        if (label === '' || takenLabel(label, columns, builtinLabels)) return
                        setRenaming(null)
                        onChange((base) => ({
                          ...base,
                          custom: base.custom.map((x) => (x.key === c.key ? { ...x, label } : x)),
                        }))
                      }}
                    />
                  )
                  : <span className="cl">{c.label}</span>}
                {c.type === 'text'
                  ? null
                  : (
                    <button
                      className={opened === c.key ? 'cmx optx on' : 'cmx optx'} title={m.papers.columnMenu.options}
                      onClick={() => setOpened((k) => (k === c.key ? null : c.key))}
                    ><IconChevron /></button>
                  )}
                <button
                  className={retyping === c.key ? 'cmx typex on' : 'cmx typex'} title={m.papers.columnMenu.changeType}
                  onClick={() => setRetyping((k) => (k === c.key ? null : c.key))}
                ><ColumnTypeIcon type={c.type} /></button>
                <button className="cmx" title={m.papers.columnMenu.rename} onClick={() => setRenaming(c.key)}>
                  <IconPencil />
                </button>
                {/* Core rejects group keys with no column, so a deleted column leaves the groups too. */}
                <button
                  className="cmx del" title={m.papers.columnMenu.deleteColumn}
                  onClick={() => onChange((base) => ({
                    ...base,
                    custom: base.custom.filter((x) => x.key !== c.key),
                    groups: base.groups.filter((g) => g !== c.key),
                    order: base.order?.filter((key) => key !== c.key),
                  }))}
                ><IconCross sw={2.2} /></button>
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
                : c.options.length === 0
                  ? <div className="mi optrow optnone">{m.papers.columnMenu.noOptionsHint}</div>
                  : c.options.map((o) => (
                    <div key={o} className="mi optrow">
                      {renamingOption?.key === c.key && renamingOption.from === o
                        ? (
                          <FormInput
                            className="celledit" autoComplete="off" autoFocus defaultValue={o}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return
                              const to = e.currentTarget.value.trim()
                              if (to === o) { setRenamingOption(null); return }
                              if (to === '' || c.options.includes(to)) return
                              setRenamingOption(null)
                              onRenameOption(c.key, o, to)
                            }}
                          />
                        )
                        : <span className="cl">{o}</span>}
                      <button
                        className="cmx" title={m.papers.columnMenu.renameOption}
                        onClick={() => setRenamingOption({ key: c.key, from: o })}
                      ><IconPencil /></button>
                      <button
                        className="cmx del" title={m.papers.columnMenu.deleteOption}
                        onClick={() => onChange((base) => ({
                          ...base,
                          custom: base.custom.map((x) => (x.key === c.key
                            ? { ...x, options: x.options.filter((v) => v !== o) }
                            : x)),
                        }))}
                      ><IconCross sw={2.2} /></button>
                    </div>
                  ))}
            </div>
          ))}
    </ActionPopover>
  )
}
