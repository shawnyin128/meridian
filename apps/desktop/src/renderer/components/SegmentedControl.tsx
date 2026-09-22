import type { ReactElement, ReactNode } from 'react'
import './SegmentedControl.css'

export type SegmentedControlOption<Value extends string> = {
  value: Value
  label: ReactNode
  title?: string
  disabled?: boolean
}

/**
 * The app-wide single-choice switch between peer views. Every option is a pill; the selected one is
 * filled with the accent colour. `size` only changes the pill geometry, never the selected-state
 * contract.
 */
export function SegmentedControl<Value extends string>({
  value, options, onChange, label, size = 'md', className = '',
}: {
  value: Value
  options: readonly SegmentedControlOption<Value>[]
  onChange: (value: Value) => void
  label: string
  size?: 'md' | 'sm'
  className?: string
}): ReactElement {
  return (
    <div
      className={`segmented-control segmented-control--${size}${className ? ` ${className}` : ''}`}
      role="group" aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          className={value === option.value ? 'on' : ''}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
