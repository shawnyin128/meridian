import { useMessages } from '../messages/useMessages.js'
import { ActionMenu, MenuRadioGroup, MenuRadioItem, MenuSeparator } from './ActionMenu.js'
import { FadeText } from './FadeText.js'
import './FilterMenu.css'

/** The radio value of the option that picks none; every other option's value is its position. */
const ALL = 'all'

/**
 * The one filter of a page toolbar: the word filter, then a button that shows `name` while nothing
 * is picked and the picked option's label otherwise, marked on while it filters. Its menu picks one
 * of `options`, or `all` for none, and `onPick` receives the picked option's value, or null for none;
 * a `current` no option holds shows as none. The button keeps the width of the widest of `name` and
 * the option labels, so picking never changes it. `label` names the button for assistive technology
 * and `className` places it.
 */
export function FilterMenu<T>({ name, label, all, options, current, onPick, className }: {
  name: string
  label: string
  all: string
  options: readonly { value: T; label: string }[]
  current: T | null
  onPick: (value: T | null) => void
  className?: string
}) {
  const m = useMessages()
  const at = options.findIndex((option) => option.value === current)
  return (
    <span className="filter-menu-group">
      <span className="filter-menu-label">{m.common.filter}</span>
      <ActionMenu
        trigger={(
          <button
            type="button"
            className={`${at < 0 ? 'btn sm filter-menu' : 'btn sm filter-menu on'}${className === undefined ? '' : ` ${className}`}`}
            aria-label={label}
          >
            <span className="filter-menu-value">
              <FadeText>{at < 0 ? name : options[at]!.label}</FadeText>
              {[name, ...options.map((option) => option.label)].map((text, i) => (
                <span key={String(i)} className="filter-menu-ghost" data-label={text} aria-hidden="true" />
              ))}
            </span>
          </button>
        )}
      >
        <MenuRadioGroup value={at < 0 ? ALL : String(at)}>
          <MenuRadioItem value={ALL} onSelect={() => onPick(null)}>{all}</MenuRadioItem>
          <MenuSeparator />
          {options.map((option, i) => (
            <MenuRadioItem key={String(i)} value={String(i)} onSelect={() => onPick(option.value)}>{option.label}</MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </ActionMenu>
    </span>
  )
}
