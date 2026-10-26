import type { ReactNode } from 'react'
import type { SectionPaging } from '../hooks/useListPaging.js'
import { List } from './List.js'
import { SectionHeading } from './PageShell.js'
import { Pager } from './Pager.js'

/**
 * One section of a stack that `useStackPaging` sizes: its heading with its `actions`, the grid of the cards on the page
 * `paging` shows, `children`, and its own pager over its `total` items, which shows only while the
 * section has more than one page; the grid keeps the height of a full page on a shorter last one.
 * `empty`, when given, stands in place of the grid and the pager. `className` only names the grid.
 */
export function PagedSection({ heading, actions, total, paging, empty, className = '', children }: {
  heading: ReactNode
  actions?: ReactNode
  empty?: ReactNode
  total: number
  paging: SectionPaging
  className?: string
  children: ReactNode
}) {
  return (
    <>
      <SectionHeading actions={actions}>{heading}</SectionHeading>
      {empty ?? (
        <>
          <List
            variant="embedded" rows="all" grid className={className} data-stack-section={paging.key}
            {...(paging.minHeight === undefined ? {} : { style: { minHeight: paging.minHeight } })}
          >{children}</List>
          <Pager placement="section" total={total} page={paging.page} size={paging.size} onPage={paging.setPage} />
        </>
      )}
    </>
  )
}
