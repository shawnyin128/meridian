import * as Popover from '@radix-ui/react-popover'
import type { ReactElement, ReactNode, RefObject } from 'react'

/** Focus guard dedicated to the input associative layer; maintained together with PickerPopover, the page does not touch the Radix event contract. */
function pressGuard(
  anchor?: RefObject<HTMLElement | null>,
): Pick<Popover.PopoverContentProps, 'onOpenAutoFocus' | 'onMouseDown' | 'onInteractOutside'> {
  return {
    onOpenAutoFocus: (event) => event.preventDefault(),
    onMouseDown: (event) => event.preventDefault(),
    onInteractOutside: (event) => {
      if (anchor?.current?.contains(event.target as Node)) event.preventDefault()
    },
  }
}

export type PickerPopoverProps = {
  open: boolean
  anchor: ReactElement
  content: ReactNode
  anchorRef?: RefObject<HTMLElement | null>
  onOpenChange?: (open: boolean) => void
  contentId?: string
  contentClassName?: string
  side?: Popover.PopoverContentProps['side']
  align?: Popover.PopoverContentProps['align']
  sideOffset?: number
  sticky?: Popover.PopoverContentProps['sticky']
  stopClickPropagation?: boolean
}

/**
 * Enter the floating shell shared by the association/selector. Radix is only responsible for positioning; here unified portal, spacing, anchor point external determination,
 * Do not grab the input focus when opening and do not let the input go out of focus when the candidate is pressed. When `content` is empty, only the anchor point will be retained, and the empty floating layer will not be attached.
 */
export function PickerPopover({
  open, anchor, content, anchorRef, onOpenChange,
  contentId,
  contentClassName = 'pickhits', side = 'bottom', align = 'start', sideOffset = 4,
  sticky, stopClickPropagation = false,
}: PickerPopoverProps) {
  return (
    <Popover.Root open={open} {...(onOpenChange === undefined ? {} : { onOpenChange })}>
      <Popover.Anchor asChild>{anchor}</Popover.Anchor>
      {content === null || content === undefined || content === false
        ? null
        : (
          <Popover.Portal>
            <Popover.Content
              {...(contentId === undefined ? {} : { id: contentId })}
              className={contentClassName} side={side} align={align}
              sideOffset={sideOffset} {...(sticky === undefined ? {} : { sticky })}
              {...pressGuard(anchorRef)}
              onClick={stopClickPropagation ? (event) => event.stopPropagation() : undefined}
            >
              {content}
            </Popover.Content>
          </Popover.Portal>
        )}
    </Popover.Root>
  )
}
