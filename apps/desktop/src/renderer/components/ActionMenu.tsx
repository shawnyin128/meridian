import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { MouseEvent as ReactMouseEvent, MouseEventHandler, ReactElement, ReactNode } from 'react'

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
 * An action menu skeleton for the entire application. Entry buttons, business items and opening and closing strategies are given by the calling place; Root, asChild trigger,
 * Portal, surface style, positioning and inline click isolation are only implemented once. Controlled menus can be controlled using `open`/`onOpenChange`
 * When switching to the editor in the same layer, `contentProps` only retains Radix's advanced capabilities such as focus and Escape.
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
