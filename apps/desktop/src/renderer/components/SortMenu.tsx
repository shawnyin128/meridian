import { ActionMenu, MenuItem } from './ActionMenu.js'

export type SortOption = { label: string; onSelect: () => void }

/**
 * Sort entry for a list heading. It carries page-action weight so it matches the page's add action beside it.
 * `options` lists the one-shot orderings the menu applies.
 */
export function SortMenu({ label, options }: { label: string; options: SortOption[] }) {
  return (
    <ActionMenu trigger={<button type="button" className="btn sort-menu">{label}</button>}>
      {options.map((option) => (
        <MenuItem key={option.label} onSelect={option.onSelect}>{option.label}</MenuItem>
      ))}
    </ActionMenu>
  )
}
