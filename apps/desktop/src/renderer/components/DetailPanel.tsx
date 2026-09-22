import type { HTMLAttributes, ReactNode } from 'react'
import './DetailPanel.css'

export type DetailPanelMode = 'inline' | 'overlay' | 'resize'

interface DetailPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  as?: 'aside' | 'div'
  children?: ReactNode
  contentClassName?: string
  mode: DetailPanelMode
  open: boolean
}

/** Shared geometry and content motion for right-side detail panels. */
export function DetailPanel({
  as = 'div', children, className = '', contentClassName = '', mode, open, ...props
}: DetailPanelProps) {
  const Element = as
  const state = open ? 'is-open' : 'is-closed'
  return (
    <Element
      {...props}
      className={`detail-panel detail-panel--${mode} ${state}${className ? ` ${className}` : ''}`}
      data-panel-state={open ? 'open' : 'closed'}
      {...(mode === 'resize' ? {} : { 'aria-hidden': !open })}
    >
      <div className={`detail-panel__content${contentClassName ? ` ${contentClassName}` : ''}`}>
        {children}
      </div>
    </Element>
  )
}
