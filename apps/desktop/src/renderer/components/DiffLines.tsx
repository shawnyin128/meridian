import type { DiffPiece } from '../../shared/contract.js'
import { PaperText } from './paper/PaperText.js'
import './DiffLines.css'

/** One change line: its text, or its pieces, a paper title among them rendering through PaperText. */
export type DiffLine = string | readonly DiffPiece[]

/** Pieces of text in a row, each paper title through PaperText. */
export function LinePieces({ pieces }: { pieces: readonly DiffPiece[] }) {
  return pieces.map((piece, at) => (typeof piece === 'string' ? piece : <PaperText key={at} text={piece.paper} />))
}

/**
 * The one rendering of change lines: each line starting with `+` is an addition, every other line a
 * removal or a change, in the order given. The change log and a claim's version history show their
 * lines through it.
 */
export function DiffLines({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="diff">
      {lines.map((line, at) => {
        const text = typeof line === 'string' ? line : line.map((piece) => (typeof piece === 'string' ? piece : piece.paper)).join('')
        return (
          <div className={text.startsWith('+') ? 'add' : 'del'} key={`${at} ${text}`}>
            {typeof line === 'string' ? line : <LinePieces pieces={line} />}
          </div>
        )
      })}
    </div>
  )
}
