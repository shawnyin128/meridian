import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './ContextMenu.css'

export type ContextMenuPoint = { x: number; y: number }

/**
 * The coordinate menu shared by the right mouse button and keyboard ContextMenu. It unifies portal, viewport clamping, click/Escape closing,
 * The first focus and the focus return after closing; business components only provide original coordinates, labels and actions.
 */
export function ContextMenu({ point, label, onClose, className = '', children }: {
  point: ContextMenuPoint
  label: string
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const surface = useRef<HTMLDivElement>(null)
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const [placed, setPlaced] = useState(point)

  useLayoutEffect(() => {
    const held = surface.current
    if (held === null) return
    const padding = 8
    setPlaced({
      x: Math.max(padding, Math.min(point.x, window.innerWidth - held.offsetWidth - padding)),
      y: Math.max(padding, Math.min(point.y, window.innerHeight - held.offsetHeight - padding)),
    })
    held.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [point])

  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !surface.current?.contains(event.target)) onClose()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', key, true)
      if (opener.current?.isConnected) opener.current.focus()
    }
  }, [onClose])

  return createPortal(
    <div
      ref={surface} className={`ctxmenu context-menu${className ? ` ${className}` : ''}`}
      role="menu" aria-label={label} style={{ left: placed.x, top: placed.y }}
    >
      {children}
    </div>,
    document.body,
  )
}

export function ContextMenuItem({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`mi${className ? ` ${className}` : ''}`} role="menuitem" {...props} />
}

export function ContextMenuSeparator() {
  return <div className="msep" role="separator" />
}
