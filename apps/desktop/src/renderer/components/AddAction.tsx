import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { IconButton } from './IconButton.js'
import { IconPlus } from './icons.js'

export type AddActionVariant = 'page' | 'section' | 'icon' | 'chip'

type AddActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & (
  | { variant?: 'page' | 'section'; children?: ReactNode }
  | { variant: 'icon' | 'chip'; title: string; children?: never }
)

/**
 * The one add entry for the whole product. A page's main action, a section action and a pure icon
 * entry differ only in weight instead of each drawing its own plus sign. `icon` is the shared icon
 * button at the nested size, for a table header or a toolbar; `chip` is a bare plus whose look the
 * chip classes in `className` give. Both are named by `title`.
 */
export const AddAction = forwardRef<HTMLButtonElement, AddActionProps>(function AddAction({
  variant = 'section', className, children, title, 'aria-label': ariaLabel, ...props
}, ref) {
  if (variant === 'icon') {
    return (
      <IconButton {...props} ref={ref} size="nested" label={ariaLabel ?? title!} title={title} className={className}>
        <IconPlus />
      </IconButton>
    )
  }
  const visual = variant === 'page' ? 'btn pri' : variant === 'section' ? 'btn sm' : ''
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
