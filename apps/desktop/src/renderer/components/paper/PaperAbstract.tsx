import { useRef, useState } from 'react'
import { PaperText } from './PaperText.js'
import { useClipped } from '../../hooks/useClipped.js'
import { useMessages } from '../../messages/useMessages.js'
import '../FadeText.css'
import './PaperCard.css'

/**
 * The one presentation of paper abstracts. Abstracts render through `PaperText` as Markdown, so the
 * `$…$` and `$$…$$` math and the text commands common on arXiv show rendered instead of raw LaTeX.
 * With `folded`, the abstract shows its first three lines, fading out where the last one ends when there
 * is more, and offers to expand.
 */
export function PaperAbstract({ text, folded = false }: { text: string; folded?: boolean }) {
  const m = useMessages()
  const body = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const cut = useClipped(body, text, true)
  const shut = folded && !expanded
  const overflows = shut && cut
  return (
    <>
      <div ref={body} className={`paper-abstract pabs${shut ? ' is-folded fade-lines' : ''}${overflows ? ' clipped' : ''}`}>
        <PaperText text={text} block />
      </div>
      {folded && (overflows || expanded) ? (
        <button type="button" className="btn ghost sm paper-abstract-toggle" onClick={() => setExpanded((open) => !open)}>
          {expanded ? m.papers.card.collapseAbstract : m.papers.card.expandAbstract}
        </button>
      ) : null}
    </>
  )
}
