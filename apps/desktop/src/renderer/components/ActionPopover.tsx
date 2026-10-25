import * as Popover from '@radix-ui/react-popover'
import type { ReactElement, ReactNode, RefObject } from 'react'
import { ignoreComposingEscape } from '../lib/keyboard.js'
import { menuSurfaceClass, type MenuSurface } from './ActionMenu.js'
import { COLLISION_PADDING, type AnchorBox } from './floating-layer.js'
import { OutsideToolbar } from './Toolbar.js'

type ContentProps = Omit<Popover.PopoverContentProps,
  'children' | 'className' | 'side' | 'align' | 'sideOffset' | 'sticky'
>

export type ActionPopoverSide = Popover.PopoverContentProps['side']
export type ActionPopoverAlign = Popover.PopoverContentProps['align']

/**
 * The shared skeleton for interactive configuration popovers. Unlike `PickerPopover`, which serves
 * input suggestions, it keeps the native focus flow inside the popover, which suits calendars,
 * column settings and multi-control forms; callers only provide the trigger, the content and the
 * controlled open/close policy. It keeps the shared gap from the window edge. An Escape pressed while an input method is composing neither closes
 * the popover nor reaches `contentProps.onEscapeKeyDown`. It opens from `trigger`, or is placed
 * against `anchor`, which it renders, or against `anchorBox`, which the caller measures itself. It lies
 * on the menu surface of `surface`, and `contentClassName` adds classes that name or place it.
 */
type ActionPopoverBaseProps = {
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  surface?: MenuSurface
  contentClassName?: string
  side?: ActionPopoverSide
  align?: ActionPopoverAlign
  sideOffset?: number
  sticky?: Popover.PopoverContentProps['sticky']
  contentProps?: ContentProps
}

export type ActionPopoverProps = ActionPopoverBaseProps & (
  | { trigger: ReactElement; anchor?: never; anchorBox?: never }
  | { anchor: ReactElement; trigger?: never; anchorBox?: never }
  | { anchorBox: RefObject<AnchorBox | null>; trigger?: never; anchor?: never }
)

export function ActionPopover(props: ActionPopoverProps) {
  const {
    children, open, onOpenChange,
    surface = 'menu', contentClassName = '', side = 'bottom', align = 'end', sideOffset = 4,
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
        : props.anchorBox === undefined
          ? <Popover.Anchor asChild>{props.anchor}</Popover.Anchor>
          : <Popover.Anchor virtualRef={props.anchorBox} />}
      <Popover.Portal>
        <Popover.Content
          collisionPadding={COLLISION_PADDING} {...contentProps} onEscapeKeyDown={ignoreComposingEscape(contentProps?.onEscapeKeyDown)}
          className={menuSurfaceClass(surface, contentClassName)} side={side} align={align}
          sideOffset={sideOffset} {...(sticky === undefined ? {} : { sticky })}
        >
          <OutsideToolbar>{children}</OutsideToolbar>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export const PopoverClose = Popover.Close
