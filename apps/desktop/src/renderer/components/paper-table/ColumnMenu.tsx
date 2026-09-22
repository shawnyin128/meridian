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
 * Click the gear at the end of the table header to open the column menu: built-in columns are one per row, click on the row to show and hide, fixed columns are grayed out and unresponsive; custom columns
 * One per line, rename or delete at the end of the line. The new column is not here, it is the + at the end of the header. The visual is demo's colMenu,
 * Open and close Radix: When the name change input box is open, Esc only cancels the name change and leaves the menu.
 * Each change is handed over to `onChange` with a function: receive the last confirmed column configuration and return the entire changed column configuration; the existing column names on the table will not be changed.
 * Change it to your original name and just close the input box.
 * There is an additional fold button at the end of the row of the selection column and the multi-selection column, and its options are expanded: one per row, and rename and delete at the end of the row. Change your name and leave
 * `onRenameOption` (it needs to be changed together with the paper), delete it as usual `onChange` - when there are still papers in the whole database with that option filled in
 * core will reject it, and the banner will report its original words.
 * There is also a "Change Type" button at the end of the row of the custom column. Expand the row of type gears when creating the column, click or use the direction keys to switch to another gear.
 * `onRetype`, the promise it returns will be fulfilled when this write is finalized (written or rejected). When writing about changing the type is still on the way, the stalls are OK
 * Select the last requested gear, and the direction keys start from it, and switching to it does not count; after everything is settled, return to the type in `columns`.
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
  // The key of the column in which the type range is being spread
  const [retyping, setRetyping] = useState<string | null>(null)
  // Write the columns that are still on the way to change the type: the type of the last request, together with the mark identifying this request.
  const [requested, setRequested] = useState<Record<string, { type: PaperColumn['type']; token: object }>>({})

  const toggle = (k: string) => onChange((base) => ({
    ...base,
    hidden: base.hidden.includes(k) ? base.hidden.filter((h) => h !== k) : [...base.hidden, k],
  }))

  /** Which gear is selected in the gear row at the moment: when this column has a changed type and is written on the road, it is the last requested gear, otherwise it is the type in the column configuration. */
  const pickedType = (c: PaperColumn) => requested[c.key]?.type ?? c.type

  /** Request to change column `key` to `type`; when this write is finalized, if it is still the last request for this column, the filename returns to the type in the column configuration. */
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
          // Radix collects Esc during the capture phase of the document and cannot block it in the input box; when changing the name, block the closing layer here and only cancel the name change.
          onEscapeKeyDown: (e) => {
            if (renamingOption !== null) { e.preventDefault(); setRenamingOption(null); return }
            if (renaming !== null) { e.preventDefault(); setRenaming(null) }
          },
      }}
    >
          {/* Creating a column will expand the table, and the entry at the end of the table header will slide out of the visible area; the menu should remain in the window, the same as the clamping when opening the demo layer */}
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
                {/* Core rejects keys without columns in the group, so when deleting a column, you must remove the item in the group together with it. */}
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
