import type { PaperColumns } from '../../../shared/contract.js'
import { GROUPABLE_PAPER_FIELDS } from '../../../shared/vocabulary.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionMenu, MenuCheckboxItem } from '../ActionMenu.js'
import { IconButton } from '../IconButton.js'
import { IconCheck, IconGear } from '../icons.js'

/** The group fields under the gear: built-in groupable fields, then select and multi-select columns in order. */
export function groupRows(
  columns: PaperColumns, groupNames: Record<string, string>,
): { key: string; label: string }[] {
  return [
    ...GROUPABLE_PAPER_FIELDS.map((key) => ({ key: key as string, label: groupNames[key]! })),
    ...columns.custom.filter((c) => c.type !== 'text').map((c) => ({ key: c.key, label: c.label })),
  ]
}

/**
 * The gear at the end of the group bar: it opens one row per groupable field, and checked rows are
 * the chips shown on the group bar. Clicking a row toggles whether it is in `columns.groups` and
 * keeps the popover open; the toggle is computed from the last confirmed column configuration and
 * handed to `onChange`. Styled with the column menu's `.mi` / `.ck`.
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
      trigger={(
        <IconButton label={m.papers.groupMenu.chooseFields} size="nested" className="colbtn grpgear"><IconGear /></IconButton>
      )}
      align="start"
    >
      {groupRows(columns, m.papers.groupNames).map((r) => (
        <MenuCheckboxItem
          key={r.key} checked={columns.groups.includes(r.key)}
          onCheckedChange={() => toggle(r.key)}
          // Clicking a row only toggles that row; the menu stays open
          onSelect={(e) => e.preventDefault()}
        >
          <span className="ck">{columns.groups.includes(r.key) ? <IconCheck /> : null}</span>
          <span className="cl">{r.label}</span>
        </MenuCheckboxItem>
      ))}
    </ActionMenu>
  )
}
