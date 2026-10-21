import type { WikiBacklink } from '../../../shared/contract.js'
import { PAPER_PAGE } from '../../../shared/vocabulary.js'
import { useMessages } from '../../messages/useMessages.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { RailLinks, type RailLink } from './RailLinks.js'

/**
 * The right-rail block of a Wiki page listing what refers to it, one row per kind (a page kind,
 * paper, project, idea or chat) in the order `links` first names each kind, in the related block's
 * look; each link hands its backlink to `onOpen`. Renders nothing when nothing refers to the page.
 */
export function WikiBacklinks({ links, onOpen }: {
  links: WikiBacklink[]
  onOpen: (link: WikiBacklink) => void
}) {
  const m = useMessages()
  const b = m.wiki.backlinks
  const kindOf = (link: WikiBacklink): string => (link.kind !== 'page' ? b.kinds[link.kind]
    : link.id.startsWith(PAPER_PAGE) ? m.wiki.paperKind : link.kindLabel ?? '')
  const rows = new Map<string, RailLink[]>()
  for (const link of links) {
    rows.set(kindOf(link), [...rows.get(kindOf(link)) ?? [], {
      key: `${link.kind} ${link.id}`,
      // Page and chat titles may carry a paper title's LaTeX; project and idea names are plain text.
      title: link.kind === 'page' || link.kind === 'chat' ? <PaperText text={link.title} /> : link.title,
      fullTitle: link.fullTitle === undefined ? undefined : plainTitle(link.fullTitle),
      page: link.kind === 'page' ? link.id : undefined,
      onOpen: () => onOpen(link),
    }])
  }
  return <RailLinks heading={b.heading} rows={[...rows].map(([label, group]) => ({ label, links: group }))} />
}
