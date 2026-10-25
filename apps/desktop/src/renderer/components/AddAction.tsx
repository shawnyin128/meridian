import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { IconButton } from './IconButton.js'
import { IconPlus } from './icons.js'
import { useToolbarItem } from './Toolbar.js'
import { Tooltip } from './Tooltip.js'
import { Button } from './Button.js'

export type AddActionVariant = 'page' | 'section' | 'icon' | 'chip'

type AddActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title' | 'aria-label'> & (
  | { variant?: 'page' | 'section'; label?: string; children?: ReactNode }
  | { variant: 'icon' | 'chip'; label: string; children?: never }
)

/**
 * The one add entry for the whole product. A page's main action, a section action and a pure icon
 * entry differ only in weight instead of each drawing its own plus sign. `icon` is the shared icon
 * button at the nested size, for a table header or a toolbar; `chip` is a bare plus whose look the
 * chip classes in `className` give. `label` names the whole action: the tooltip of the two bare
 * variants, and the spoken name of a page or section action whose visible text is a short word.
 * Inside a toolbar it is one of the toolbar's controls.
 */
export const AddAction = forwardRef<HTMLButtonElement, AddActionProps>(function AddAction({
  variant = 'section', className, children, label, ...props
}, ref) {
  const asItem = useToolbarItem()
  if (variant === 'icon') {
    return (
      <IconButton {...props} ref={ref} size="nested" label={label!} className={className}>
        <IconPlus />
      </IconButton>
    )
  }
  const classes = ['add-action', `add-action-${variant}`, className].filter(Boolean).join(' ')
  if (variant === 'chip') {
    return (
      <Tooltip label={label!}>
        {asItem(<button {...props} ref={ref} className={classes} aria-label={label}><IconPlus /></button>)}
      </Tooltip>
    )
  }
  return (
    <Button
      {...props} ref={ref} size="regular" variant={variant === 'page' ? 'primary' : 'secondary'} className={classes}
      aria-label={label} icon={<IconPlus />}
    >{children === undefined ? null : <span>{children}</span>}</Button>
  )
})
