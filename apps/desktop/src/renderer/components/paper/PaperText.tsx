import katex from 'katex'
import type { ReactNode } from 'react'
import { Markdown } from '../Markdown.js'
import { MONO_CLASS, paperRuns } from './paper-text.js'
import type { TitleRun } from './paper-text.js'
import 'katex/dist/katex.min.css'
import './PaperText.css'

const render = (runs: TitleRun[]): ReactNode[] => runs.map((run, at) => {
  switch (run.kind) {
    case 'text': return run.text
    case 'bold': return <strong key={at}>{render(run.runs)}</strong>
    case 'italic': return <em key={at}>{render(run.runs)}</em>
    case 'mono': return <code key={at} className={MONO_CLASS}>{render(run.runs)}</code>
    // KaTeX escapes the TeX it renders, and an invalid formula renders as its source in the error color.
    case 'atom': {
      const html = katex.renderToString(run.atom.math, { throwOnError: false })
      return <span key={at} dangerouslySetInnerHTML={{ __html: html }} />
    }
  }
})

/**
 * The one presentation of a paper's title or abstract with the LaTeX arXiv metadata uses. Inline
 * (the default) renders `text` as a title, with no element around it: `$…$` formulas through KaTeX
 * and the text commands, escapes and dashes `parsePaperText` reads. `block` renders `text` as
 * Markdown, as an abstract, with the same commands applied to its text.
 */
export function PaperText({ text, block = false }: { text: string; block?: boolean }) {
  return block ? <Markdown src={text} latexText /> : <>{render(paperRuns(text))}</>
}
