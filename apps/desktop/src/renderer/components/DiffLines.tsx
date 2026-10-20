import { PaperText } from './paper/PaperText.js'
import { SLOT } from './TitleNote.js'
import './DiffLines.css'

/** One change line: its text, or `message` placing a paper `title`, which renders through PaperText. */
export type DiffLine = string | { message: (title: string) => string; title: string }

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
        const text = typeof line === 'string' ? line : line.message(SLOT)
        const [before, after] = text.split(SLOT)
        return (
          <div className={declined ? undefined : text.startsWith('+') ? 'add' : 'del'} key={`${at} ${text}`}>
            {typeof line === 'string' ? line : <>{before}<PaperText text={line.title} />{after}</>}
          </div>
        )
      })}
    </div>
  )
}
