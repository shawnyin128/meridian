import type { PaperColumns } from '../../../shared/contract.js'
import { GROUPABLE_PAPER_FIELDS } from '../../../shared/vocabulary.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionMenu, MenuCheckboxItem } from '../ActionMenu.js'
import { IconCheck, IconGear } from '../icons.js'

/** The grouping listed in the gear: the built-in groupable fields come first, and the selection columns and multi-selection columns follow in the order of configuration. */
export function groupRows(
  columns: PaperColumns, groupNames: Record<string, string>,
): { key: string; label: string }[] {
  return [
    ...GROUPABLE_PAPER_FIELDS.map((key) => ({ key: key as string, label: groupNames[key]! })),
    ...columns.custom.filter((c) => c.type !== 'text').map((c) => ({ key: c.key, label: c.label })),
  ]
}

/**
 * The gear at the end of the grouping bar: click on a row to open a column that can be grouped. Those with ticks are the chips placed on the grouping bar. Click a line
 * Switch whether it is in `columns.groups` or not, and the pop-up layer will not be closed. Switching is calculated based on the last confirmed column configuration and handed over to `onChange`.
 * `.mi` / `.ck` for visual column menu.
 */
export function GroupMenu({ columns, onChange }: {
  columns: PaperColumns
  onChange: (update: (base: PaperColumns) => PaperColumns) => void
}) {
  const m = useMessages()
  const toggle = (key: string) => onChange((base) => ({
    ...base,
    groups: base.groups.includes(key) ? base.groups.filter((g) => g !== key) : [...base.groups, key],
  }))

  return (
    <ActionMenu
      trigger={<button type="button" className="colbtn grpgear" title={m.papers.groupMenu.chooseFields}><IconGear /></button>}
      align="start"
    >
      {groupRows(columns, m.papers.groupNames).map((r) => (
        <MenuCheckboxItem
          key={r.key} checked={columns.groups.includes(r.key)}
          onCheckedChange={() => toggle(r.key)}
          // Clicking on a row only switches this row, leaving the menu and selecting
          onSelect={(e) => e.preventDefault()}
        >
          <span className="ck">{columns.groups.includes(r.key) ? <IconCheck /> : null}</span>
          <span className="cl">{r.label}</span>
        </MenuCheckboxItem>
      ))}
    </ActionMenu>
  )
}
