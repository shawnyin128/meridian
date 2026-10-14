import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { IconPlus } from './icons.js'

export type AddActionVariant = 'page' | 'section' | 'icon'

type AddActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: AddActionVariant
  children?: ReactNode
}

/**
 * The one add entry for the whole product. A page's main action, a section action and a pure icon
 * entry differ only in weight instead of each drawing its own plus sign.
 * Pure icon entries must be given title or aria-label so that both mouse and keyboard users know what will be added.
 */
export const AddAction = forwardRef<HTMLButtonElement, AddActionProps>(function AddAction({
  variant = 'section', className, children, title, 'aria-label': ariaLabel, ...props
}, ref) {
  const visual = variant === 'page' ? 'btn pri' : variant === 'section' ? 'btn plain' : ''
  const classes = [visual, 'add-action', `add-action-${variant}`, className].filter(Boolean).join(' ')
  return (
    <button
      {...props} ref={ref} className={classes} title={title}
      aria-label={ariaLabel ?? (children === undefined && title ? title : undefined)}
    >
      <IconPlus />
      {children === undefined ? null : <span>{children}</span>}
    </button>
  )
})
