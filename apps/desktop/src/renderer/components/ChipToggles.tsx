import * as ToggleGroup from '@radix-ui/react-toggle-group'
import type { ReactElement, ReactNode } from 'react'
import { tagClass } from './Tag.js'
import './ChipToggles.css'

/**
 * A multi-select of short values shown as chips: each chip turns its value on or off on its own,
 * and `onChange` receives the values that are on, in the order they were turned on. The group is
 * one Tab stop; arrow keys move focus between the chips, and Enter or Space toggles the focused one.
 */
export function ChipToggles<Value extends string>({
  label, value, options, onChange, disabled = false, className = '',
}: {
  label: string
  value: readonly Value[]
  options: readonly { value: Value; label: ReactNode }[]
  onChange: (value: Value[]) => void
  disabled?: boolean
  className?: string
}): ReactElement {
  return (
    <ToggleGroup.Root
      type="multiple" role="group" aria-label={label} value={[...value]} disabled={disabled}
      className={`chip-toggles${className ? ` ${className}` : ''}`}
      onValueChange={(next) => onChange(next as Value[])}
    >
      {options.map((option) => (
        <ToggleGroup.Item key={option.value} value={option.value} className={tagClass(undefined, 'chip', 'tagchip chip-toggle')}>
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
