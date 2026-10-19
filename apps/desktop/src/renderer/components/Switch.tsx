import * as RadixSwitch from '@radix-ui/react-switch'
import type { ReactElement } from 'react'
import './Switch.css'

/**
 * The switch for a binary setting that takes effect as soon as it flips. `label` names the setting
 * and never changes with the state; `onChange` receives the new state.
 */
export function Switch({ checked, onChange, label, disabled = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}): ReactElement {
  return (
    <RadixSwitch.Root
      className="switch" checked={checked} onCheckedChange={onChange} aria-label={label} disabled={disabled}
    >
      <RadixSwitch.Thumb className="switch-thumb" />
    </RadixSwitch.Root>
  )
}
