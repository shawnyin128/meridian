import type { MouseEvent, ReactNode } from 'react'
import brandmark from '../../../resources/mark-64.png'
import './TitleBar.css'

/**
 * The window's title bar: its controls and the breadcrumb, as `children`. Its background drags the
 * window and a double-click on it calls `onZoom`; its controls do neither. It makes way for the window
 * buttons of the platform.
 */
export function TitleBar({ onZoom, children }: { onZoom: () => void; children: ReactNode }) {
  const zoom = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('button,a,input,select,textarea,[contenteditable="true"]')) return
    onZoom()
  }
  return <div className="titlebar" onDoubleClick={zoom}>{children}</div>
}

/** The app's mark, the glyph of the title bar's app menu button. */
export function AppMark() {
  return <img className="brandmark" src={brandmark} alt="Meridian" />
}
