import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { MouseEvent as ReactMouseEvent, MouseEventHandler, ReactElement, ReactNode } from 'react'
import { ignoreComposingEscape } from '../lib/keyboard.js'

type ContentProps = Omit<DropdownMenu.DropdownMenuContentProps,
  'children' | 'className' | 'side' | 'align' | 'sideOffset'
>

export type ActionMenuProps = {
  trigger: ReactElement
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  modal?: boolean
  contentClassName?: string
  side?: DropdownMenu.DropdownMenuContentProps['side']
  align?: DropdownMenu.DropdownMenuContentProps['align']
  sideOffset?: number
  stopContentClickPropagation?: boolean
  onContentClick?: MouseEventHandler<HTMLDivElement>
  contentProps?: ContentProps
  contentData?: Record<string, string>
}

/**
 * The app-wide action menu skeleton. Callers provide the trigger button, the items and when it opens
 * and closes; Root, the asChild trigger, Portal, surface style, positioning and inline click
 * isolation are implemented only here. A menu that switches to an editor in the same popover is
 * controlled through `open`/`onOpenChange`; `contentProps` only carries advanced Radix options such
 * as focus and Escape handling. An Escape pressed while an input method is composing neither closes
 * the menu nor reaches `contentProps.onEscapeKeyDown`.
 */
export function ActionMenu({
  trigger, children, open, onOpenChange, modal,
  contentClassName = 'ctxmenu', side = 'bottom', align = 'end', sideOffset = 4,
  stopContentClickPropagation = false, onContentClick, contentProps, contentData,
}: ActionMenuProps) {
  const rootProps = {
    ...(open === undefined ? {} : { open }),
    ...(onOpenChange === undefined ? {} : { onOpenChange }),
    ...(modal === undefined ? {} : { modal }),
  }
  const contentClick = stopContentClickPropagation || onContentClick !== undefined
    ? ((event: ReactMouseEvent<HTMLDivElement>) => {
      if (stopContentClickPropagation) event.stopPropagation()
      onContentClick?.(event)
    })
    : undefined

  return (
    <DropdownMenu.Root {...rootProps}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...contentProps} {...contentData}
          onEscapeKeyDown={ignoreComposingEscape(contentProps?.onEscapeKeyDown)}
          className={contentClassName} side={side} align={align} sideOffset={sideOffset}
          {...(contentClick === undefined ? {} : { onClick: contentClick })}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function MenuItem({ className = 'mi', ...props }: DropdownMenu.DropdownMenuItemProps) {
  return <DropdownMenu.Item className={className} {...props} />
}

export function MenuSeparator({ className = 'msep', ...props }: DropdownMenu.DropdownMenuSeparatorProps) {
  return <DropdownMenu.Separator className={className} {...props} />
}

export function MenuRadioGroup(props: DropdownMenu.DropdownMenuRadioGroupProps) {
  return <DropdownMenu.RadioGroup {...props} />
}

export function MenuRadioItem({ className = 'mi', ...props }: DropdownMenu.DropdownMenuRadioItemProps) {
  return <DropdownMenu.RadioItem className={className} {...props} />
}

export function MenuCheckboxItem({ className = 'mi', ...props }: DropdownMenu.DropdownMenuCheckboxItemProps) {
  return <DropdownMenu.CheckboxItem className={className} {...props} />
}
