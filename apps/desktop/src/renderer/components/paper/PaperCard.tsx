import type { ReactNode } from 'react'
import { useMessages } from '../../messages/useMessages.js'
import { PaperAbstract } from './PaperAbstract.js'
import './PaperCard.css'

/** The paper discovery card is shared between receiving and reading later; the page only transmits actions, prompts and optional information. */
export function PaperCard({
  paperId, watchId, title, actions, notices, metadata, abstract, recommendation, leaving = false,
}: {
  paperId: string
  watchId?: string
  title: ReactNode
  actions: ReactNode
  notices?: ReactNode
  metadata: ReactNode
  abstract?: string
  recommendation?: string
  leaving?: boolean
}) {
  const m = useMessages()
  return (
    <article
      className={`paper-card pcard${leaving ? ' is-leaving gone' : ''}`}
      data-pid={paperId} {...(watchId === undefined ? {} : { 'data-w': watchId })}
    >
      <div className="paper-card-heading ph">
        <h3>{title}</h3>
        <div className="paper-card-actions">{actions}</div>
      </div>
      {notices}
      <div className="paper-card-metadata pm">{metadata}</div>
      {abstract ? (
        <section className="paper-card-section">
          <div className="paper-card-label plabel">Abstract</div>
          <PaperAbstract text={abstract} />
        </section>
      ) : null}
      {recommendation ? (
        <section className="paper-card-section">
          <div className="paper-card-label plabel">{m.papers.card.recommendationLabel}</div>
          <div className="paper-card-recommendation prec">{recommendation}</div>
        </section>
      ) : null}
    </article>
  )
}

/** Short tags in paper metadata, such as conference name or source of affiliation. */
export function PaperCardBadge({ children }: { children: ReactNode }) {
  return <span className="paper-card-badge venue">{children}</span>
}

/** Inline hints in paper cards; `action` can hold open or retry buttons. */
export function PaperCardNotice({ children, action, tone = 'default' }: {
  children: ReactNode
  action?: ReactNode
  tone?: 'default' | 'error'
}) {
  return (
    <div className={`paper-card-notice pdup${tone === 'error' ? ' is-error pfail' : ''}`}>
      <span>{children}</span>
      {action}
    </div>
  )
}

/** Reference numbers remain as weakened fixed-width numbers. */
export function PaperCardCitations({ count }: { count: number }) {
  const m = useMessages()
  return <span className="paper-card-citations citations">{m.papers.card.citations(count)}</span>
}
