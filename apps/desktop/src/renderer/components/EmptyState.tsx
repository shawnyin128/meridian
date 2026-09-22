import type { ReactElement, ReactNode } from 'react'
import './EmptyState.css'

/**
 * The app-wide "nothing here" surface. `page` fills an otherwise empty screen with a centred icon
 * and one sentence; `section` states the same thing as a single grey line inside a populated page
 * and ignores `icon`.
 */
export function EmptyState({ variant, icon, children }: {
  variant: 'page' | 'section'
  icon?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <div className={`empty-state empty-state--${variant}`}>
      {variant === 'page' && icon !== undefined ? icon : null}
      <span>{children}</span>
    </div>
  )
}
