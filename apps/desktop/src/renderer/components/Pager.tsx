import { useMessages } from '../messages/useMessages.js'
import './Pager.css'
import { PageFooter } from './PageShell.js'
import { SegmentedControl } from './SegmentedControl.js'

/**
 * Pagination bar: total number on the left, page number and each page file on the right. When the total number does not exceed the smallest one, the entire bar will not appear and return
 * null. The page numbers are output according to the rules of the demo: the first page, one page on each side of the current page, the last page, and ellipsis at the break. `page`
 * When the last page is exceeded, press the last page to draw. It is the same as the demo and does not wait for the number to be retrieved before correcting.
 * The outer layer is always PageShell's lightweight footer; `className` only complements the page's own layout modifications.
 */
export function Pager({ total, page, size, sizes, onPage, onSize, className }: {
  total: number
  page: number
  size: number
  sizes: readonly number[]
  onPage: (page: number) => void
  onSize: (size: number) => void
  className?: string
}) {
  const m = useMessages()
  if (total <= sizes[0]!) return null

  const pageCount = Math.max(1, Math.ceil(total / size))
  const shown = Math.min(page, pageCount)
  const nums: (number | null)[] = [1]
  if (shown > 3) nums.push(null)
  for (let p = Math.max(2, shown - 1); p <= Math.min(pageCount - 1, shown + 1); p++) nums.push(p)
  if (shown < pageCount - 2) nums.push(null)
  if (pageCount > 1) nums.push(pageCount)

  return (
    <PageFooter bare className={className}>
      <div className="pagebar">
        <span className="pginfo">{m.common.pager.total(total)}</span>
        <div className="pager">
          <button className="pgbtn" disabled={shown <= 1} onClick={() => onPage(shown - 1)}>‹</button>
          {nums.map((p, i) => (p === null
            ? <span className="pgell" key={i}>…</span>
            : (
              <button className={p === shown ? 'pgbtn on' : 'pgbtn'} key={i} onClick={() => onPage(p)}>
                {p}
              </button>
            )
          ))}
          <button
            className="pgbtn" disabled={shown >= pageCount} onClick={() => onPage(shown + 1)}
          >›</button>
        </div>
        <SegmentedControl
          size="sm"
          label={m.common.pager.perPage}
          value={String(size)}
          options={sizes.map((s) => ({ value: String(s), label: m.common.pager.perPageOption(s) }))}
          onChange={(value) => { onSize(Number(value)); onPage(1) }}
        />
      </div>
    </PageFooter>
  )
}
