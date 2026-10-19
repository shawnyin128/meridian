import type { HTMLAttributes, ReactNode, Ref } from 'react'
import './ResearchObjectCard.css'

/**
 * Shared card shell for first-class research objects: projects and ideas in a list, the Wiki's pages
 * and papers in a `grid`. An actionable card is composite, like a composite StructuredRow: it holds
 * controls of its own and forwards a pointer click anywhere else on it to `onActivate`, so its
 * children must include the keyboard control for the same action, a `CardOpen` around the object's
 * name. The card hosts the row-actions slot.
 */
export function ResearchObjectCard({
  children, className = '', variant = 'list', selected = false, muted = false, cardRef, onActivate, ...props
}: {
  children: ReactNode
  className?: string
  variant?: 'list' | 'grid'
  selected?: boolean
  muted?: boolean
  cardRef?: Ref<HTMLElement>
  onActivate?: () => void
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className' | 'onClick'>) {
  const variantClass = variant === 'grid' ? ' research-object-card--grid' : ''
  const stateClass = `${selected ? ' selected' : ''}${muted ? ' muted' : ''}`
  return (
    <article
      ref={cardRef}
      className={`research-object-card${variantClass}${stateClass}${className ? ` ${className}` : ''}`}
      data-actionable={onActivate === undefined ? undefined : ''}
      data-row-actions=""
      onClick={onActivate}
      {...props}
    >
      {children}
    </article>
  )
}

/** The button around a card's name: the card's keyboard control, whose click reaches the card. */
export function CardOpen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <button type="button" className={`research-object-card-open${className ? ` ${className}` : ''}`}>{children}</button>
  )
}
