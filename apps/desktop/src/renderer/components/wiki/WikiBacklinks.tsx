import type { WikiBacklink } from '../../../shared/contract.js'
import { PAPER_PAGE } from '../../../shared/vocabulary.js'
import { useMessages } from '../../messages/useMessages.js'
import { EntityLink } from '../EntityLink.js'
import { SectionHeading } from '../PageShell.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import './WikiBacklinks.css'

/**
 * The right-rail block of a Wiki page listing what refers to it, one row per kind (a page kind,
 * paper, project, idea or chat) in the order `links` first names each kind, as the related block lays
 * out its rows; each link hands its backlink to `onOpen`. Renders nothing when nothing refers to the page.
 */
export function WikiBacklinks({ links, onOpen }: {
  links: WikiBacklink[]
  onOpen: (link: WikiBacklink) => void
}) {
  const m = useMessages()
  const b = m.wiki.backlinks
  const paper = (link: WikiBacklink) => link.kind === 'page' && link.id.startsWith(PAPER_PAGE)
  const kindOf = (link: WikiBacklink): string => (link.kind !== 'page' ? b.kinds[link.kind]
    : paper(link) ? m.wiki.paperKind : link.kindLabel ?? '')
  const rows = new Map<string, WikiBacklink[]>()
  for (const link of links) rows.set(kindOf(link), [...rows.get(kindOf(link)) ?? [], link])
  if (rows.size === 0) return null
  return (
    <>
      <SectionHeading variant="rail">{b.heading}</SectionHeading>
      {[...rows].map(([kind, group]) => (
        <div className="wkrel wkbacklinks" key={kind}>
          <span className="rl">{kind}</span>
          <span className="wkbacklinks-links">
            {group.map((link) => (
              <EntityLink
                key={`${link.kind} ${link.id}`} kind={paper(link) ? 'paper' : link.kind}
                data-wk={link.kind === 'page' ? link.id : undefined}
                // Page and chat titles may carry a paper title's LaTeX; project and idea names are plain text.
                label={link.kind === 'page' || link.kind === 'chat' ? <PaperText text={link.title} /> : link.title}
                title={link.fullTitle === undefined ? undefined : plainTitle(link.fullTitle)}
                onOpen={() => onOpen(link)}
              />
            ))}
          </span>
        </div>
      ))}
    </>
  )
}
