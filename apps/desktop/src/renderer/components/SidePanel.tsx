import { createContext, forwardRef, useCallback, useContext, useId } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { useMessages } from '../messages/useMessages.js'
import { IconButton } from './IconButton.js'
import { IconCross } from './icons.js'
import './SidePanel.css'

/** `card` lies inside a page body beside its content; `edge` lies against the window's edge, a rule on its inner side. */
export type SidePanelSurface = 'card' | 'edge'

/** The id of the title of the panel's head, which names the panel. */
const TitleId = createContext<string | undefined>(undefined)

/**
 * The one panel that opens beside a page body to show one item or tool. Each `surface` has one width
 * and one inset. It takes its width at once and only its content moves in, so nothing beside it
 * reflows frame by frame. Its content is a column: a PanelHead that stays at the top and a PanelBody
 * that scrolls under it. It is named by its PanelHead's title, or by `label` when it has none.
 * `className` only places it.
 */
export function SidePanel({ surface, label, className, children }: {
  surface: SidePanelSurface
  label?: string
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <aside
      className={`side-panel side-panel--${surface}${className ? ` ${className}` : ''}`}
      {...(label === undefined ? { 'aria-labelledby': titleId } : { 'aria-label': label })}
    >
      <TitleId.Provider value={titleId}>
        <div className="side-panel-content">{children}</div>
      </TitleId.Provider>
    </aside>
  )
}

/**
 * The head of a SidePanel: its buttons on a row of their own at the top right, the panel's `actions`
 * and then the close button, and under them its `title`, which spans the head and wraps. The title
 * comes first in the markup, so Tab reaches a title that is a control before the buttons. Its buttons
 * are compact; `onClose` folds the panel away.
 */
export function PanelHead({ title, actions, onClose }: {
  title: ReactNode
  actions?: ReactNode
  onClose: () => void
}) {
  const m = useMessages()
  return (
    <header className="panel-head">
      <div className="panel-head-title" id={useContext(TitleId)}>{title}</div>
      <div className="panel-head-actions">
        {actions}
        <IconButton label={m.common.panel.close} size="nested" className="panel-close" onClick={onClose}>
          <IconCross />
        </IconButton>
      </div>
    </header>
  )
}

/** The part of a SidePanel under its head that scrolls; it fades at an edge while content is hidden past it. `className` only names it. */
export const PanelBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PanelBody({ className, ...props }, ref) {
    const fade = useScrollFade('y')
    const attach = useCallback((node: HTMLDivElement | null) => {
      fade(node)
      if (typeof ref === 'function') ref(node)
      else if (ref !== null) ref.current = node
    }, [fade, ref])
    return <div ref={attach} className={`panel-body${className ? ` ${className}` : ''}`} {...props} />
  },
)
