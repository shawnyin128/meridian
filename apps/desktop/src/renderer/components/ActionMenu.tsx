import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { MouseEvent as ReactMouseEvent, MouseEventHandler, ReactElement, ReactNode } from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { ignoreComposingEscape } from '../lib/keyboard.js'
import { COLLISION_PADDING } from './floating-layer.js'
import { IconCheck } from './icons.js'
import { OutsideToolbar } from './Toolbar.js'
import './ActionMenu.css'

/**
 * The looks of the one menu surface: `menu` holds items, `editor` holds a ShortTextEditor edge to
 * edge, `form` holds a form with room around it, and `toolbar` holds a toolbar and is as wide as it.
 */
export type MenuSurface = 'menu' | 'editor' | 'form' | 'toolbar'

/** The class list of the menu surface of `surface`, followed by `extra` classes that name or place it. */
export function menuSurfaceClass(surface: MenuSurface = 'menu', extra = ''): string {
  return ['ctxmenu', surface === 'menu' ? '' : `ctxmenu--${surface}`, extra].filter(Boolean).join(' ')
}

type ContentProps = Omit<DropdownMenu.DropdownMenuContentProps,
  'children' | 'className' | 'side' | 'align' | 'sideOffset' | 'alignOffset'
>

export type ActionMenuProps = {
  trigger: ReactElement
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  modal?: boolean
  surface?: MenuSurface
  contentClassName?: string
  side?: DropdownMenu.DropdownMenuContentProps['side']
  align?: DropdownMenu.DropdownMenuContentProps['align']
  sideOffset?: number
  alignOffset?: number
  stopContentClickPropagation?: boolean
  onContentClick?: MouseEventHandler<HTMLDivElement>
  contentProps?: ContentProps
  contentData?: Record<string, string>
  scrolls?: boolean
}

/**
 * The app-wide action menu skeleton. Callers provide the trigger button, the items and when it opens
 * and closes; Root, the asChild trigger, Portal, surface style, positioning, the gap from the window
 * edge and inline click isolation are implemented only here. The surface takes the look of `surface`,
 * and `contentClassName` adds classes that name or place it. A menu that switches to an editor in
 * the same popover is controlled through `open`/`onOpenChange`; `contentProps` only carries advanced
 * Radix options such as focus and Escape handling. An Escape pressed while an input method is composing neither closes
 * the menu nor reaches `contentProps.onEscapeKeyDown`. A menu that `scrolls` past its height fades the edge it hides.
 */
export function ActionMenu({
  trigger, children, open, onOpenChange, modal,
  surface = 'menu', contentClassName = '', side = 'bottom', align = 'end', sideOffset = 4, alignOffset = 0,
  stopContentClickPropagation = false, onContentClick, contentProps, contentData, scrolls = false,
}: ActionMenuProps) {
  const fade = useScrollFade('y')
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
          collisionPadding={COLLISION_PADDING} {...contentProps} {...contentData}
          onEscapeKeyDown={ignoreComposingEscape(contentProps?.onEscapeKeyDown)}
          className={menuSurfaceClass(surface, contentClassName)} side={side} align={align} sideOffset={sideOffset}
          alignOffset={alignOffset}
          {...(scrolls ? { ref: fade, 'data-fade-paint': '' } : {})}
          {...(contentClick === undefined ? {} : { onClick: contentClick })}
        >
          <OutsideToolbar>{children}</OutsideToolbar>
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

/** The slot before an item's label; it holds the one checked mark while the item is checked. */
function CheckSlot() {
  return <span className="ck"><DropdownMenu.ItemIndicator><IconCheck /></DropdownMenu.ItemIndicator></span>
}

export function MenuRadioItem({ className = 'mi', children, ...props }: DropdownMenu.DropdownMenuRadioItemProps) {
  return <DropdownMenu.RadioItem className={className} {...props}><CheckSlot />{children}</DropdownMenu.RadioItem>
}

export function MenuCheckboxItem({ className = 'mi', children, ...props }: DropdownMenu.DropdownMenuCheckboxItemProps) {
  return <DropdownMenu.CheckboxItem className={className} {...props}><CheckSlot />{children}</DropdownMenu.CheckboxItem>
}
