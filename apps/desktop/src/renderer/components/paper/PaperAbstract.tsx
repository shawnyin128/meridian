import { useLayoutEffect, useRef, useState } from 'react'
import { Markdown } from '../Markdown.js'
import { useMessages } from '../../messages/useMessages.js'
import './PaperCard.css'

/**
 * Unified presentation of paper abstracts. Excerpts are parsed in Markdown, so the arXiv common `$…$` and `$$…$$`
 * Mathematical expressions reuse global KaTeX rendering instead of exposing LaTeX source code directly to users.
 * With `folded`, the abstract shows its first lines fading out and offers to expand when there is more.
 */
export function PaperAbstract({ text, folded = false }: { text: string; folded?: boolean }) {
  const m = useMessages()
  const body = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const element = body.current
    if (!folded || element === null) return
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [folded, text])

  const clipped = folded && !expanded
  return (
    <>
      <div ref={body} className={`paper-abstract pabs${clipped ? ' is-folded' : ''}${clipped && overflows ? ' is-clipped' : ''}`}>
        <Markdown src={text} />
      </div>
      {folded && (overflows || expanded) ? (
        <button type="button" className="paper-abstract-toggle" onClick={() => setExpanded((open) => !open)}>
          {expanded ? m.papers.card.collapseAbstract : m.papers.card.expandAbstract}
        </button>
      ) : null}
    </>
  )
}
