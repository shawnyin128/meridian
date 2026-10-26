import type { ReactNode } from 'react'
import type { SectionPaging } from '../hooks/useListPaging.js'
import { List } from './List.js'
import { SectionHeading } from './PageShell.js'
import { Pager } from './Pager.js'

/**
 * One section of a stack that `useStackPaging` sizes: its heading, the grid of the cards on the page
 * `paging` shows, `children`, and its own pager over its `total` items, which shows only while the
 * section has more than one page; the grid keeps the height of a full page on a shorter last one.
 * `className` only names the grid.
 */
export function PagedSection({ heading, total, paging, className = '', children }: {
  heading: ReactNode
  total: number
  paging: SectionPaging
  className?: string
  children: ReactNode
}) {
  return (
    <>
      <SectionHeading>{heading}</SectionHeading>
      <List
        variant="embedded" rows="all" grid className={className} data-stack-section={paging.key}
        {...(paging.minHeight === undefined ? {} : { style: { minHeight: paging.minHeight } })}
      >{children}</List>
      <Pager placement="section" total={total} page={paging.page} size={paging.size} onPage={paging.setPage} />
    </>
  )
}
