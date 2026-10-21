import type { WikiSignal, WikiSignalKind } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { EmptyState } from '../EmptyState.js'
import { FadeText } from '../FadeText.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { ProjectSignalKind } from '../project/ProjectSignals.js'

/** The signal kinds the tidying list shows, in the order it lists them, with the tone of each kind's tag. */
const SHOWN = {
  'open-conflict': 'bad', 'broken-link': 'bad', 'thin-aggregation': 'warn', 'unfiled-paper': 'warn',
} as const satisfies Partial<Record<WikiSignalKind, 'bad' | 'warn'>>
type ShownKind = keyof typeof SHOWN
const ORDER = Object.keys(SHOWN) as ShownKind[]

/** One tidying row: a signal kind the list shows and the page (or `projects/<id>`) the signal is about. */
export type TidyRow = { kind: ShownKind; page: string }

/**
 * The tidying rows `signals` give: conflicts, broken links, thin pages and unfiled papers, in that
 * order and in Core's order within a kind, one row per kind and page.
 */
export function tidyRows(signals: WikiSignal[]): TidyRow[] {
  const seen = new Set<string>()
  return ORDER.flatMap((kind) => signals.filter((s) => s.kind === kind).flatMap((s) => {
    const key = `${kind} ${s.page}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ kind, page: s.page }]
  }))
}

/**
 * The tidying screen's list: one row per entry of `rows`, its kind tag and the page's name from
 * `titles` (a paper title may carry LaTeX; a page `titles` does not name shows its id), the list
 * scrolling with the page; activating a row hands its page to `onOpen`. `titles` is null while the
 * names load.
 */
export function TidyList({ rows, titles, onOpen }: {
  rows: TidyRow[]
  titles: Record<string, string> | null
  onOpen: (page: string) => void
}) {
  const m = useMessages()
  const t = m.wiki.tidy
  if (rows.length === 0) return <EmptyState variant="section">{t.empty}</EmptyState>
  if (titles === null) return <LoadingPlaceholder shape="rows" />
  return (
    <StructuredList className="attn" variant="embedded" maxVisibleRows="all">
      {rows.map((row) => {
        const title = titles[row.page] ?? row.page
        return (
          <StructuredRow
            className="attnrow project-signal-columns" key={`${row.kind} ${row.page}`} data-wk={row.page}
            columns="var(--project-signal-kind-width) minmax(0,1fr)" onActivate={() => onOpen(row.page)}
          >
            <ProjectSignalKind tone={SHOWN[row.kind]}>{t.kinds[row.kind]}</ProjectSignalKind>
            <FadeText className="attn-text" label={plainTitle(title)}><PaperText text={title} /></FadeText>
          </StructuredRow>
        )
      })}
    </StructuredList>
  )
}
