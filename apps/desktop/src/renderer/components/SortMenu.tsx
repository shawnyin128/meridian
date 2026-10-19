import { ActionMenu, MenuItem } from './ActionMenu.js'

export type SortOption = { label: string; onSelect: () => void }

/**
 * Sort entry for a list. `variant` gives it the weight of where it sits: `section` in a section heading,
 * `page` in the page header when it orders the whole page. `options` lists the one-shot orderings the
 * menu applies.
 */
export function SortMenu({ label, options, variant = 'section' }: {
  label: string
  options: SortOption[]
  variant?: 'page' | 'section'
}) {
  return (
    <ActionMenu trigger={<button type="button" className={variant === 'page' ? 'btn sort-menu' : 'btn sm sort-menu'}>{label}</button>}>
      {options.map((option) => (
        <MenuItem key={option.label} onSelect={option.onSelect}>{option.label}</MenuItem>
      ))}
    </ActionMenu>
  )
}
