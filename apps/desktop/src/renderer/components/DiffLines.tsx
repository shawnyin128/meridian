import './DiffLines.css'

/**
 * The one rendering of change lines: each line starting with `+` is an addition, every other line a
 * removal or a change, in the order given. The change log, the review queue and a claim's version
 * history show their lines through it. `declined` draws lines that never took effect, muted and
 * struck through instead of tinted.
 */
export function DiffLines({ lines, declined = false }: { lines: string[]; declined?: boolean }) {
  return (
    <div className={declined ? 'diff is-declined' : 'diff'}>
      {lines.map((line, at) => (
        <div className={declined ? undefined : line.startsWith('+') ? 'add' : 'del'} key={`${at} ${line}`}>{line}</div>
      ))}
    </div>
  )
}
