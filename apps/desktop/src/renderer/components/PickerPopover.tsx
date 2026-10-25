import * as Popover from '@radix-ui/react-popover'
import type { HTMLAttributes, ReactElement, ReactNode, RefObject } from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import type { CandidateKeys } from '../hooks/useCandidateKeys.js'
import { ignoreComposingEscape } from '../lib/keyboard.js'
import { COLLISION_PADDING, type AnchorBox } from './floating-layer.js'
import { OutsideToolbar } from './Toolbar.js'
import './ActionMenu.css'
import './PickerPopover.css'

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

type PickerPopoverBaseProps = {
  open: boolean
  content: ReactNode
  anchorRef?: RefObject<HTMLElement | null>
  onOpenChange?: (open: boolean) => void
  contentId?: string
  size?: 'field' | 'tall' | 'wide'
  contentClassName?: string
  side?: Popover.PopoverContentProps['side']
  align?: Popover.PopoverContentProps['align']
  sideOffset?: number
  sticky?: Popover.PopoverContentProps['sticky']
  stopClickPropagation?: boolean
}

export type PickerPopoverProps = PickerPopoverBaseProps & (
  | { anchor: ReactElement; anchorBox?: never }
  | { anchorBox: RefObject<AnchorBox | null>; anchor?: never }
)

/**
 * The popover shell shared by input suggestions and pickers. Radix only positions it; this owns the
 * portal, the spacing, the gap it keeps from the window edge, treating a press on the anchor as
 * inside, not taking the input's focus on open, and not blurring the input when a candidate is
 * pressed. An Escape pressed while an input method is composing does not close it. When `content`
 * is empty, only the anchor renders and no empty popover is mounted. It is placed against `anchor`,
 * which it renders, or against `anchorBox`, which the caller renders or measures itself. Its `size` is
 * a `field`'s candidates, as wide as the field; a `tall` list, as the chat's mentions; or a `wide`
 * results panel, as the global search's. `contentClassName` adds classes that name or place it.
 */
export function PickerPopover(props: PickerPopoverProps) {
  const listFade = useScrollFade('y')
  const {
    open, content, anchorRef, onOpenChange,
    contentId,
    size = 'field', contentClassName = '', side = 'bottom', align = 'start', sideOffset = 4,
    sticky, stopClickPropagation = false,
  } = props
  return (
    <Popover.Root open={open} {...(onOpenChange === undefined ? {} : { onOpenChange })}>
      {props.anchorBox === undefined
        ? <Popover.Anchor asChild>{props.anchor}</Popover.Anchor>
        : <Popover.Anchor virtualRef={props.anchorBox} />}
      {content === null || content === undefined || content === false
        ? null
        : (
          <Popover.Portal>
            <Popover.Content
              ref={listFade} data-fade-paint=""
              {...(contentId === undefined ? {} : { id: contentId })}
              className={['pickhits', size === 'field' ? '' : `pickhits--${size}`, contentClassName].filter(Boolean).join(' ')}
              side={side} align={align} collisionPadding={COLLISION_PADDING}
              sideOffset={sideOffset} {...(sticky === undefined ? {} : { sticky })}
              {...pressGuard(anchorRef)} onEscapeKeyDown={ignoreComposingEscape()}
              onClick={stopClickPropagation ? (event) => event.stopPropagation() : undefined}
            >
              <OutsideToolbar>{content}</OutsideToolbar>
            </Popover.Content>
          </Popover.Portal>
        )}
    </Popover.Root>
  )
}

/**
 * Row `index` of a candidate list driven by `keys`, in the shared menu item anatomy. It is lit only
 * while it is the active row, and pointer movement over it makes it the active row, so the row
 * under the pointer and the row the arrow keys move are always one row.
 */
export function PickOption({ keys, index, className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'onMouseMove'> & {
  keys: Pick<CandidateKeys, 'active' | 'pointAt'>
  index: number
}) {
  return (
    <div
      {...props} onMouseMove={() => keys.pointAt(index)}
      className={`mi rrow${className === undefined ? '' : ` ${className}`}${keys.active === index ? ' on' : ''}`}
    />
  )
}
