import { useMessages } from '../messages/useMessages.js'
import { IconButton } from './IconButton.js'
import { IconNext, IconPrevious } from './icons.js'
import './Pager.css'
import { PageFooter } from './PageShell.js'
import { Toolbar, ToolbarButton } from './Toolbar.js'

/**
 * Pagination bar: the total on the left, the page numbers on the right. When every item fits on one
 * page of `size`, no bar appears and this returns null.
 * Page numbers follow the demo's rule: the first page, one page on each side of the current page,
 * the last page, and an ellipsis at each gap. A `page` past the last page is drawn as the last
 * page, as in the demo, without waiting for a refetch to correct it. The page numbers and the
 * previous and next buttons are one toolbar, and the shown page is the current one.
 * The wrapper is always PageShell's bare footer; `className` only adds the page's own layout tweaks.
 */
export function Pager({ total, page, size, onPage, className }: {
  total: number
  page: number
  size: number
  onPage: (page: number) => void
  className?: string
}) {
  const m = useMessages()
  if (total <= size) return null

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
        <Toolbar>
          <div className="pager">
            <IconButton label={m.common.pager.previous} size="nested" disabled={shown <= 1} onClick={() => onPage(shown - 1)}>
              <IconPrevious />
            </IconButton>
            {nums.map((p, i) => (p === null
              ? <span className="pgell" key={i}>…</span>
              : (
                <ToolbarButton
                  className={p === shown ? 'pgbtn on' : 'pgbtn'} key={i} aria-label={m.common.pager.page(p)}
                  aria-current={p === shown ? 'page' : undefined} onClick={() => onPage(p)}
                >{p}</ToolbarButton>
              )
            ))}
            <IconButton label={m.common.pager.next} size="nested" disabled={shown >= pageCount} onClick={() => onPage(shown + 1)}>
              <IconNext />
            </IconButton>
          </div>
        </Toolbar>
      </div>
    </PageFooter>
  )
}
