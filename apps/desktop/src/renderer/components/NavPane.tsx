import type { ReactNode } from 'react'
import { ScrollArea } from './ScrollArea.js'
import { Toolbar } from './Toolbar.js'
import './NavPane.css'

/**
 * The navigation pane at the window's leading edge, the sidebar, as wide as `--sbw`. `top` stands
 * above the rows, such as the search; `children` are the rows, which scroll; `pinned` are rows pinned
 * under them that keep the room the scrolling rows keep for their scrollbar, so every row ends at the
 * same edge. The rows are one toolbar: one Tab stop, with the arrow keys between them. `grip` sits on
 * the pane's end edge. A `collapsed` pane leaves the layout at once, slides away over the content it
 * uncovers and takes no focus; a `hidden` one is out while another pane takes its place, as the
 * reader's paper chat does. The pane is the window's navigation landmark, named `label`.
 */
export function NavPane({ id, label, top, pinned, grip, collapsed, hidden, children }: {
  id: string
  label: string
  top: ReactNode
  pinned: ReactNode
  grip: ReactNode
  collapsed: boolean
  hidden: boolean
  children: ReactNode
}) {
  return (
    <div
      className={collapsed ? 'nav-pane nav-pane--collapsed' : 'nav-pane'} id={id} role="navigation" aria-label={label}
      inert={collapsed} hidden={hidden}
    >
      {top}
      <Toolbar orientation="vertical">
        <div className="nav-pane-nav">
          <ScrollArea axis="y" fill gutter className="nav-pane-rows">{children}</ScrollArea>
          <div className="nav-pane-pinned">{pinned}</div>
        </div>
      </Toolbar>
      {grip}
    </div>
  )
}
