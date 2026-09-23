import './DiffLines.css'

/**
 * The one rendering of change lines: each line starting with `+` is an addition, every other line a
 * removal or a change, in the order given. The change log, the review queue and a claim's version
 * history show their lines through it.
 */
export function DiffLines({ lines }: { lines: string[] }) {
  return (
    <div className="diff">
      {lines.map((line, at) => <div className={line.startsWith('+') ? 'add' : 'del'} key={`${at} ${line}`}>{line}</div>)}
    </div>
  )
}
