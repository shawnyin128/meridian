import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Button } from './Button.js'
import { IconPlus } from './icons.js'
import { useToolbarItem } from './Toolbar.js'
import { Tooltip } from './Tooltip.js'
import './AddAction.css'

/**
 * `size` follows the slot: `regular` (30px) in the page header bar; `compact` (24px) in section, group,
 * panel and sidebar headings, in table headers and inside rows; `chip`, the height of a chip, for the ＋
 * alone after the chips of a field.
 */
type AddActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title' | 'aria-label'> & (
  | { size: 'regular' | 'compact'; label?: string; children: string }
  | { size: 'compact' | 'chip'; label: string; children?: never }
)

/**
 * The one create or add control: the ＋ on the soft fill of a secondary Button, at the size of its
 * slot. With `children` it is a Button showing the ＋ and that short word, and `label`, when given, is
 * the whole action's spoken name. Without them it is the ＋ alone, named `label`, which its tooltip
 * shows: a square, or at the `chip` size a circle like the chips it follows. Further classes in
 * `className` only place it. Inside a toolbar it is one of the toolbar's controls.
 */
export const AddAction = forwardRef<HTMLButtonElement, AddActionProps>(function AddAction(props, ref) {
  const asItem = useToolbarItem()
  if (props.children === undefined) {
    const { size, label, className, type = 'button', ...rest } = props
    const classes = ['add-action', 'add-action-icon', size === 'chip' ? 'add-action-chip' : '', className].filter(Boolean).join(' ')
    return (
      <Tooltip label={label}>
        {asItem(<button {...rest} ref={ref} type={type} className={classes} aria-label={label}><IconPlus /></button>)}
      </Tooltip>
    )
  }
  const { size, label, className, children, ...rest } = props
  return (
    <Button
      {...rest} ref={ref} size={size} className={['add-action', className].filter(Boolean).join(' ')}
      aria-label={label} icon={<IconPlus />}
    ><span>{children}</span></Button>
  )
})
