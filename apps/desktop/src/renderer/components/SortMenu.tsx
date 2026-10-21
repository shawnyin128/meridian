import { ActionMenu, MenuItem, MenuRadioGroup, MenuRadioItem } from './ActionMenu.js'

export type SortOption = { label: string; onSelect: () => void }

/**
 * The one sort entry for the list a page shows; it orders the whole page, so it sits in the page
 * header. `options` lists the orderings. Without `current` each one reorders the list once; with
 * `current`, the label of the order in force, the menu sets a lasting order and checks that one.
 */
export function SortMenu({ label, options, current }: {
  label: string
  options: SortOption[]
  current?: string
}) {
  return (
    <ActionMenu trigger={<button type="button" className="btn sort-menu">{label}</button>}>
      {current === undefined
        ? options.map((option) => <MenuItem key={option.label} onSelect={option.onSelect}>{option.label}</MenuItem>)
        : (
          <MenuRadioGroup value={current}>
            {options.map((option) => (
              <MenuRadioItem key={option.label} value={option.label} onSelect={option.onSelect}>{option.label}</MenuRadioItem>
            ))}
          </MenuRadioGroup>
        )}
    </ActionMenu>
  )
}
