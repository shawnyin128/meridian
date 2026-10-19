import * as Popover from '@radix-ui/react-popover'
import type { ReactElement, ReactNode, RefObject } from 'react'
import { ignoreComposingEscape } from '../lib/keyboard.js'

/** PickerPopover's focus guard, kept beside it so pages never touch the Radix event contract. */
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
 * The popover shell shared by input suggestions and pickers. Radix only positions it; this owns the
 * portal, the spacing, treating a press on the anchor as inside, not taking the input's focus on
 * open, and not blurring the input when a candidate is pressed. An Escape pressed while an input
 * method is composing does not close it. When `content` is empty, only the anchor renders and no
 * empty popover is mounted.
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
              {...pressGuard(anchorRef)} onEscapeKeyDown={ignoreComposingEscape()}
              onClick={stopClickPropagation ? (event) => event.stopPropagation() : undefined}
            >
              {content}
            </Popover.Content>
          </Popover.Portal>
        )}
    </Popover.Root>
  )
}
