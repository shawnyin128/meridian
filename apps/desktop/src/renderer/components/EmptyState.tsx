import type { ReactElement, ReactNode } from 'react'
import './EmptyState.css'

/**
 * The app-wide "nothing here" surface. `page` fills an otherwise empty screen with a centred icon
 * and one sentence; `section` states the same thing as a single grey line inside a populated page
 * and ignores `icon`; `option` is that line in a list of options, its text where an option's text
 * starts. `action` is the one control that ends the emptiness, placed after the sentence.
 */
export function EmptyState({ variant, icon, action, children }: {
  variant: 'page' | 'section' | 'option'
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <div className={`empty-state empty-state--${variant}`}>
      {variant === 'page' && icon !== undefined ? icon : null}
      <span>{children}</span>
      {action}
    </div>
  )
}
