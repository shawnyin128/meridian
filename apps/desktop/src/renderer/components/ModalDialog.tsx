import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

type ContentProps = Omit<Dialog.DialogContentProps,
  'children' | 'className' | 'aria-describedby' | 'onCloseAutoFocus'
>

export function ModalTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <Dialog.Title className={className}>{children}</Dialog.Title>
}

/**
 * A trigger-free modal skeleton for the entire application. Unify overlay, portal, accessibility declaration without description, and access from application menu,
 * Focus return when programmatically opening and closing page buttons, etc. Business pages only provide content layout and open status.
 */
export function ModalDialog({
  open, onOpenChange, contentClassName, overlayClassName = 'scrim', children,
  restoreFocus = true, ariaDescribedBy, contentProps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentClassName: string
  overlayClassName?: string
  children: ReactNode
  restoreFocus?: boolean
  ariaDescribedBy?: string
  contentProps?: ContentProps
}) {
  const opener = useRef<HTMLElement | null>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  const committedOpen = useRef(open)
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (!openRef.current && event.target instanceof HTMLElement && event.target !== document.body) {
        lastFocused.current = event.target
      }
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])

  // Radix's shutdown auto-focus in a controlled, Trigger-less Dialog does not guarantee that every shutdown path will be triggered;
  // The state switch after submission is done again, and only the original entry that remains on the page is focused.
  useEffect(() => {
    const previous = committedOpen.current
    committedOpen.current = open
    if (previous && !open && restoreFocus && opener.current?.isConnected) opener.current.focus()
  }, [open, restoreFocus])

  // When a controlled Dialog without Trigger reaches onOpenAutoFocus, FocusScope may temporarily move the focus to the body.
  // In the "Close → Open" render, first remember the call entry that is still on the page, so that it can be returned stably when it is closed.
  if (open && !wasOpen.current) {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : lastFocused.current
  }
  wasOpen.current = open

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClassName} />
        <Dialog.Content
          {...contentProps}
          className={contentClassName}
          {...(ariaDescribedBy === undefined
            ? { 'aria-describedby': undefined }
            : { 'aria-describedby': ariaDescribedBy })}
          onCloseAutoFocus={(event) => {
            if (!restoreFocus || opener.current === null) return
            event.preventDefault()
            opener.current.focus()
          }}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
