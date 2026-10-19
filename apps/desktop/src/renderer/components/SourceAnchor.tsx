import { useId, useState } from 'react'
import type { FocusEvent, MouseEvent } from 'react'
import { useMessages } from '../messages/useMessages.js'
import './EntityLink.css'
import './SourceAnchor.css'

/**
 * The one anchor control: `p.N`, a link-styled button that opens the reader at page `page` of the
 * paper it anchors through `onOpen`. While the pointer rests on it or it has focus, it shows `quote`,
 * the source text it anchors, when there is one.
 */
export function SourceAnchor({ page, quote, onOpen }: {
  page: number
  quote?: string | undefined
  onOpen: () => void
}) {
  const m = useMessages()
  const quoteId = useId()
  const [shown, setShown] = useState<{ left: number; top: number } | null>(null)
  const show = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    setShown({ left: box.left, top: box.bottom + 8 })
  }
  const hide = () => setShown(null)
  return (
    <>
      <button
        type="button" className="entity-link source-anchor" aria-label={m.common.anchor.name(page)}
        aria-describedby={quote !== undefined && shown !== null ? quoteId : undefined}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={(event) => { event.stopPropagation(); onOpen() }}
      >{m.common.anchor.label(page)}</button>
      {quote !== undefined && shown !== null
        ? (
          <span className="source-anchor-quote" id={quoteId} role="tooltip" style={{ left: shown.left, top: shown.top }}>
            <b>{m.common.anchor.quoteHeading(page)}</b>“{quote}”
          </span>
        )
        : null}
    </>
  )
}
