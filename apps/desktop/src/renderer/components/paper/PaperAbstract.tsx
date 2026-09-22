import { Markdown } from '../Markdown.js'
import './PaperCard.css'

/**
 * Unified presentation of paper abstracts. Excerpts are parsed in Markdown, so the arXiv common `$…$` and `$$…$$`
 * Mathematical expressions reuse global KaTeX rendering instead of exposing LaTeX source code directly to users.
 */
export function PaperAbstract({ text }: { text: string }) {
  return (
    <div className="paper-abstract pabs">
      <Markdown src={text} />
    </div>
  )
}
