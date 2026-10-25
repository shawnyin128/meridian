import type { ReactNode } from 'react'
import { SectionHeading } from '../PageShell.js'
import { TagButton } from '../Tag.js'
import { Tooltip } from '../Tooltip.js'

/** One link of a rail block: its name, the whole name its tooltip shows, the Wiki page it is (if any) and what opening it does. */
export type RailLink = {
  key: string
  title: ReactNode
  fullTitle?: string | undefined
  page?: string | undefined
  onOpen: () => void
}

/**
 * A block of a Wiki page's right rail that lists links: its rail heading, then one row per label with
 * a chip button per link, which opens it and shows its whole name in the tooltip. Renders nothing
 * without rows.
 */
export function RailLinks({ heading, rows }: { heading: string; rows: { label: string; links: RailLink[] }[] }) {
  if (rows.length === 0) return null
  return (
    <>
      <SectionHeading level="group">{heading}</SectionHeading>
      {rows.map((row) => (
        <div className="wkrel rail-links" key={row.label}>
          <span className="rl">{row.label}</span>
          {row.links.map((link) => (
            <Tooltip key={link.key} label={link.fullTitle}>
              <TagButton shape="chip" className="tagchip" data-wk={link.page} onClick={link.onOpen}>{link.title}</TagButton>
            </Tooltip>
          ))}
        </div>
      ))}
    </>
  )
}
