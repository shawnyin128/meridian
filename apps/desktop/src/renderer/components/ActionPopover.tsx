import * as Popover from '@radix-ui/react-popover'
import type { ReactElement, ReactNode } from 'react'
import { ignoreComposingEscape } from '../lib/keyboard.js'

type ContentProps = Omit<Popover.PopoverContentProps,
  'children' | 'className' | 'side' | 'align' | 'sideOffset' | 'sticky'
>

export type ActionPopoverSide = Popover.PopoverContentProps['side']
export type ActionPopoverAlign = Popover.PopoverContentProps['align']

/**
 * The shared skeleton for interactive configuration popovers. Unlike `PickerPopover`, which serves
 * input suggestions, it keeps the native focus flow inside the popover, which suits calendars,
 * column settings and multi-control forms; callers only provide the trigger, the content and the
 * controlled open/close policy. An Escape pressed while an input method is composing neither closes
 * the popover nor reaches `contentProps.onEscapeKeyDown`.
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
          {...contentProps} onEscapeKeyDown={ignoreComposingEscape(contentProps?.onEscapeKeyDown)}
          className={contentClassName} side={side} align={align}
          sideOffset={sideOffset} {...(sticky === undefined ? {} : { sticky })}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export const PopoverClose = Popover.Close
