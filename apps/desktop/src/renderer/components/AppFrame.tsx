import type { CSSProperties, ReactNode } from 'react'
import './AppFrame.css'

/**
 * The window below the title bar: its panes side by side on the window's ground. `collapsed` says the
 * leading pane is folded away and `reading` that the reader is on screen; the panes read both from it.
 * `style` carries the widths the shell sets on the panes.
 */
export function AppFrame({ collapsed, reading, style, children }: {
  collapsed: boolean
  reading: boolean
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className={`main${collapsed ? ' sbhide' : ''}${reading ? ' reading' : ''}`} id="main" style={style}>{children}</div>
  )
}

/**
 * Keeps a screen mounted while another one is shown, so its view state survives. The slot takes no
 * part in the layout: the screen's root is a pane of the frame itself. The slot shown is the page's
 * main landmark; a hidden one is out of the accessibility tree.
 */
export function ScreenSlot({ shown, children }: { shown: boolean; children: ReactNode }) {
  return <div className="screenslot" role="main" hidden={!shown}>{children}</div>
}
