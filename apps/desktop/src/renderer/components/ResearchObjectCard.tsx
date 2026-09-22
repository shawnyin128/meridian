import type {
  HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode, Ref,
} from 'react'
import './ResearchObjectCard.css'

/** Shared list-card shell for first-class research objects such as projects and ideas. */
export function ResearchObjectCard({
  children, className = '', selected = false, muted = false, cardRef, onActivate, ...props
}: {
  children: ReactNode
  className?: string
  selected?: boolean
  muted?: boolean
  cardRef?: Ref<HTMLElement>
  onActivate?: () => void
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'onClick' | 'onKeyDown'>) {
  const activateWithKeyboard = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onActivate?.()
  }
  const stateClass = `${selected ? ' selected' : ''}${muted ? ' muted' : ''}`
  return (
    <article
      ref={cardRef}
      className={`research-object-card${stateClass}${className ? ` ${className}` : ''}`}
      data-actionable={onActivate === undefined ? undefined : ''}
      role={onActivate === undefined ? undefined : 'button'}
      tabIndex={onActivate === undefined ? undefined : 0}
      onClick={onActivate}
      onKeyDown={onActivate === undefined ? undefined : activateWithKeyboard}
      {...props}
    >
      {children}
    </article>
  )
}
