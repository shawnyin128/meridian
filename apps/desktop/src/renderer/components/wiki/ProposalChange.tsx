import { useId, type ReactNode } from 'react'
import { Tag } from '../Tag.js'
import './ProposalChange.css'

/** One labelled row of a proposal card: its label, its value, and a quote set on its own line under them. */
export type ProposalRow = { key: string; label: string; value?: ReactNode; quote?: ReactNode }

/**
 * `rows` as one aligned two-column list, each label in the card's label column, under a visible
 * `label` that names the list when one is given; nothing when there are no rows.
 */
export function ProposalRows({ rows, label }: { rows: ProposalRow[]; label?: string | undefined }) {
  const id = useId()
  if (rows.length === 0) return null
  const list = (
    <dl className="proposal-rows" aria-labelledby={label === undefined ? undefined : id}>
      {rows.map((row) => (
        <div className="proposal-row" key={row.key}>
          <dt>{row.label}</dt>
          <dd>
            {row.value === undefined ? null : <span className="proposal-value">{row.value}</span>}
            {row.quote === undefined ? null : <span className="proposal-quote">{row.quote}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
  return label === undefined ? list : <><p className="proposal-rows-label" id={id}>{label}</p>{list}</>
}

/** A text a change writes, in body type: `new` text in ink, text it `removed` muted and struck, or the claim it acts on as `context`. */
export function ProposalText({ role = 'new', children }: { role?: 'new' | 'removed' | 'context'; children: ReactNode }) {
  return <p className={`proposal-text proposal-text--${role}`}>{children}</p>
}

/**
 * One change of a proposal, read from the top down: the change type `kind` as a label, then the page it
 * writes as `target`, with `by` (the producer and date) at the line's end; `context` under that line;
 * the texts it writes (`children`) and its labelled `fields`; and `grounds`, what it rests on, as a list
 * under the visible label `groundsLabel`.
 */
export function ProposalChange({ kind, target, by, context, fields = [], grounds = [], groundsLabel, children }: {
  kind: string
  target?: ReactNode
  by?: ReactNode
  context?: ReactNode
  fields?: ProposalRow[] | undefined
  grounds?: ProposalRow[] | undefined
  groundsLabel?: string | undefined
  children?: ReactNode
}) {
  return (
    <div className="proposal-change">
      <div className="proposal-where">
        <Tag>{kind}</Tag>
        {target === undefined ? null : (
          <>
            <span className="proposal-arrow" aria-hidden="true">→</span>
            <span className="proposal-target">{target}</span>
          </>
        )}
        {by === undefined ? null : <span className="proposal-by">{by}</span>}
      </div>
      {context}
      {children}
      <ProposalRows rows={fields} />
      <ProposalRows rows={grounds} label={groundsLabel} />
    </div>
  )
}

/**
 * A proposal card: its changes stacked in order, then the rows and notes that belong to the whole
 * proposal, then its decision row. The labelled rows of every part share one label column, as wide as
 * the longest label. `decided` mutes the card; `declined` also strikes the texts that never took effect.
 */
export function ProposalCard({ decided = false, declined = false, children }: {
  decided?: boolean
  declined?: boolean
  children: ReactNode
}) {
  return <div className={`proposal-card${decided ? ' is-decided' : ''}${declined ? ' is-declined' : ''}`}>{children}</div>
}

/** A proposal card's last line: decline, then apply, then what blocks applying, in the order given; or its decision once decided. */
export function ProposalDecision({ children }: { children: ReactNode }) {
  return <div className="proposal-decision">{children}</div>
}
