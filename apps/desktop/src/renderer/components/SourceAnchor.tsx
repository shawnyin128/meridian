import { useMessages } from '../messages/useMessages.js'
import { Tooltip } from './Tooltip.js'
import './EntityLink.css'
import './SourceAnchor.css'

/**
 * The one anchor control: `p.N`, a link-styled button that opens the reader at page `page` of the
 * paper it anchors through `onOpen`. While the pointer rests on it or it has keyboard focus, the
 * shared tooltip shows `quote`, the source text it anchors, when there is one. Placed right after
 * text, it never starts a line of its own: it stays on the line of that text's last word, together
 * with `separator`, the text it puts between the two, such as a space.
 */
export function SourceAnchor({ page, quote, separator, onOpen }: {
  page: number
  quote?: string | undefined
  separator?: string
  onOpen: () => void
}) {
  const m = useMessages()
  return (
    <span className="source-anchor-keep">
      {separator}
      <Tooltip label={quote === undefined ? undefined : `“${quote}”`}>
        <button
          type="button" className="entity-link source-anchor" aria-label={m.common.anchor.name(page)}
          onClick={(event) => { event.stopPropagation(); onOpen() }}
        >{m.common.anchor.label(page)}</button>
      </Tooltip>
    </span>
  )
}
