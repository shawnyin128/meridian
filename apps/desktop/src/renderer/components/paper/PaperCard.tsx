import type { ReactNode } from 'react'
import { useMessages } from '../../messages/useMessages.js'
import { InlineMessage } from '../InlineMessage.js'
import { Item } from '../Item.js'
import { Tag } from '../Tag.js'
import { PaperAbstract } from './PaperAbstract.js'
import { PaperText } from './PaperText.js'
import './PaperCard.css'

/**
 * The paper card shared by Inbox and Read Later, a card Item; pages only pass actions, notices and
 * optional details. `actions` are icon buttons; they go in the card's row-actions slot at the end of
 * the title, and `metadata` is the card's meta line under it.
 */
export function PaperCard({
  paperId, watchId, title, actions, notices, metadata, abstract, recommendation, leaving = false,
}: {
  paperId: string
  watchId?: string
  title: string
  actions: ReactNode
  notices?: ReactNode
  metadata: ReactNode
  abstract?: string
  recommendation?: string
  leaving?: boolean
}) {
  const m = useMessages()
  return (
    <Item
      density="card" className={`paper-card pcard${leaving ? ' is-leaving gone' : ''}`} leaving={leaving}
      data-pid={paperId} {...(watchId === undefined ? {} : { 'data-w': watchId })}
      title={<h3><PaperText text={title} /></h3>} meta={metadata} actions={actions}
    >
      {notices}
      {abstract ? (
        <section className="paper-card-section">
          <div className="paper-card-label plabel">{m.papers.card.abstractLabel}</div>
          <PaperAbstract text={abstract} folded />
        </section>
      ) : null}
      {recommendation ? (
        <section className="paper-card-section">
          <div className="paper-card-label plabel">{m.papers.card.recommendationLabel}</div>
          <div className="paper-card-recommendation prec">{recommendation}</div>
        </section>
      ) : null}
    </Item>
  )
}

/** A short badge in a paper card's metadata, such as the venue or the source: a neutral tag. */
export function PaperCardBadge({ children }: { children: ReactNode }) {
  return <Tag className="paper-card-badge venue">{children}</Tag>
}

/** A failure on a paper card, the error box of InlineMessage; `action` is the button that retries it. */
export function PaperCardNotice({ children, action }: { children: ReactNode; action: ReactNode }) {
  return <InlineMessage tone="error" variant="box" className="paper-card-notice" action={action}>{children}</InlineMessage>
}

/** The citation count, kept as dimmed fixed-width digits. */
export function PaperCardCitations({ count }: { count: number }) {
  const m = useMessages()
  return <span className="paper-card-citations citations">{m.papers.card.citations(count)}</span>
}
