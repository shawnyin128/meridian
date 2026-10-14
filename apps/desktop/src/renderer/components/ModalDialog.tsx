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
 * The app-wide modal skeleton without a trigger. It owns the overlay, the portal, the accessibility
 * declaration for a dialog without a description, and returning focus on close whether the dialog
 * was opened from the app menu, programmatically or by a page button. Pages only provide the
 * content layout and the open state.
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

  // In a controlled Dialog without a Trigger, Radix's close auto-focus is not guaranteed to fire on
  // every close path, so an effect on the committed `open` change does it again, focusing the
  // original opener only while it is still on the page.
  useEffect(() => {
    const previous = committedOpen.current
    committedOpen.current = open
    if (previous && !open && restoreFocus && opener.current?.isConnected) opener.current.focus()
  }, [open, restoreFocus])

  // By the time a controlled Dialog without a Trigger reaches onOpenAutoFocus, FocusScope may have
  // moved focus to the body for a moment. So the closed → open render first remembers the opener
  // still on the page, and closing can reliably return focus to it.
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
