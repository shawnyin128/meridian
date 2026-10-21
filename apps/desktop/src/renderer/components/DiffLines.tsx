import type { DiffPiece } from '../../shared/contract.js'
import { PaperText } from './paper/PaperText.js'
import { SLOT } from './TitleNote.js'
import './DiffLines.css'

/** One change line: its text, or its pieces, a paper title among them rendering through PaperText. */
export type DiffLine = string | readonly DiffPiece[]

/** The pieces of `message` with the paper title `title` where the message places it. */
export function paperLine(message: (title: string) => string, title: string): DiffPiece[] {
  const [before, after] = message(SLOT).split(SLOT)
  return [before!, { paper: title }, after!]
}

/** Pieces of text in a row, each paper title through PaperText. */
export function LinePieces({ pieces }: { pieces: readonly DiffPiece[] }) {
  return pieces.map((piece, at) => (typeof piece === 'string' ? piece : <PaperText key={at} text={piece.paper} />))
}

/**
 * The one rendering of change lines: each line starting with `+` is an addition, every other line a
 * removal or a change, in the order given. The change log, the review queue and a claim's version
 * history show their lines through it. `declined` draws lines that never took effect, muted and
 * struck through instead of tinted.
 */
export function DiffLines({ lines, declined = false }: { lines: DiffLine[]; declined?: boolean }) {
  return (
    <div className={declined ? 'diff is-declined' : 'diff'}>
      {lines.map((line, at) => {
        const text = typeof line === 'string' ? line : line.map((piece) => (typeof piece === 'string' ? piece : piece.paper)).join('')
        return (
          <div className={declined ? undefined : text.startsWith('+') ? 'add' : 'del'} key={`${at} ${text}`}>
            {typeof line === 'string' ? line : <LinePieces pieces={line} />}
          </div>
        )
      })}
    </div>
  )
}
