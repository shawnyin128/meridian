import type { ReactNode } from 'react'

/** The heading bar every panel of the reader rail opens with: the panel's title, and an optional note at its end. */
export function ReaderPanelHeader({ title, note }: { title: ReactNode; note?: ReactNode }) {
  return (
    <header className="reader-panel-head">
      <strong>{title}</strong>
      {note === undefined ? null : <span>{note}</span>}
    </header>
  )
}
