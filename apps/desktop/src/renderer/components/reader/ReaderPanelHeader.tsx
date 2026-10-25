import type { ReactNode } from 'react'
import { HeadingCount } from '../HeadingCount.js'

/**
 * The heading bar every panel of the reader rail opens with: the panel's title, its `count` after it
 * as ` · N`, and an optional note at its end.
 */
export function ReaderPanelHeader({ title, count, note }: { title: ReactNode; count?: number | undefined; note?: ReactNode }) {
  return (
    <header className="reader-panel-head">
      <strong>{title}<HeadingCount count={count} /></strong>
      {note === undefined ? null : <span>{note}</span>}
    </header>
  )
}
