import * as Popover from '@radix-ui/react-popover'
import type { ReactElement, ReactNode } from 'react'

type ContentProps = Omit<Popover.PopoverContentProps,
  'children' | 'className' | 'side' | 'align' | 'sideOffset' | 'sticky'
>

export type ActionPopoverSide = Popover.PopoverContentProps['side']
export type ActionPopoverAlign = Popover.PopoverContentProps['align']

/**
 * A shared skeleton for interactively configurable layers. Unlike `PickerPopover` used for input association, it retains the native focus inside the floating layer.
 * Flow, suitable for calendars, column settings and multi-control forms; business only provides entrance, content and controlled opening and closing strategies.
 */
type ActionPopoverBaseProps = {
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  contentClassName?: string
  side?: ActionPopoverSide
  align?: ActionPopoverAlign
  sideOffset?: number
  sticky?: Popover.PopoverContentProps['sticky']
  contentProps?: ContentProps
}

export type ActionPopoverProps = ActionPopoverBaseProps & (
  | { trigger: ReactElement; anchor?: never }
  | { anchor: ReactElement; trigger?: never }
)

export function ActionPopover(props: ActionPopoverProps) {
  const {
    children, open, onOpenChange,
    contentClassName = 'ctxmenu', side = 'bottom', align = 'end', sideOffset = 4,
    sticky, contentProps,
  } = props
  const rootProps = {
    ...(open === undefined ? {} : { open }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
  }
  return (
    <Popover.Root {...rootProps}>
      {'trigger' in props
        ? <Popover.Trigger asChild>{props.trigger}</Popover.Trigger>
        : <Popover.Anchor asChild>{props.anchor}</Popover.Anchor>}
      <Popover.Portal>
        <Popover.Content
          {...contentProps} className={contentClassName} side={side} align={align}
          sideOffset={sideOffset} {...(sticky === undefined ? {} : { sticky })}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export const PopoverClose = Popover.Close
