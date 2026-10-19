import * as ToggleGroup from '@radix-ui/react-toggle-group'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import './SegmentedControl.css'

export type SegmentedControlOption<Value extends string> = {
  value: Value
  label: ReactNode
  title?: string
  disabled?: boolean
}

type TrackStyle = CSSProperties & {
  '--segmented-count': number
  '--segmented-index': number
}

/**
 * The app-wide single-choice switch between peer views: a track of equal segments with one raised
 * thumb that slides under the picked segment. It is one Tab stop; arrow keys move focus between the
 * segments, and Enter or Space picks the focused one. Picking the current segment again changes
 * nothing, and a `value` that matches no option leaves the track without a thumb. `size` only changes
 * the segment height.
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
  const picked = options.findIndex((option) => option.value === value)
  const style: TrackStyle = { '--segmented-count': options.length, '--segmented-index': picked }
  return (
    <ToggleGroup.Root
      type="single" value={value} aria-label={label} style={style}
      className={`segmented-control segmented-control--${size}${className ? ` ${className}` : ''}`}
      // Radix reports '' when the picked segment is pressed again; a segmented control always keeps one.
      onValueChange={(next) => { if (next !== '') onChange(next as Value) }}
    >
      {picked < 0 ? null : <span className="segmented-thumb" aria-hidden="true" />}
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value} value={option.value} title={option.title} disabled={option.disabled}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
