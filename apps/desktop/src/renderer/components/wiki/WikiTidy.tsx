import { Fragment } from 'react'
import type { WikiSignal, WikiSignalKind } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { EmptyState } from '../EmptyState.js'
import { EntityLink } from '../EntityLink.js'
import { FadeText } from '../FadeText.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { ProjectSignalKind } from '../project/ProjectSignals.js'
import './WikiTidy.css'

/** The signal kinds the tidying list shows, in the order it lists them, with the tone of each kind's tag. */
const SHOWN = {
  'open-conflict': 'bad', 'broken-link': 'bad', 'thin-aggregation': 'warn', 'unfiled-paper': 'warn',
} as const satisfies Partial<Record<WikiSignalKind, 'bad' | 'warn'>>
type ShownKind = keyof typeof SHOWN
const ORDER = Object.keys(SHOWN) as ShownKind[]

/**
 * One tidying row: a signal kind the list shows, the page (or `projects/<id>`) it is about, and where
 * it is wrong: for a broken link the ids of the missing pages it points to; for a conflict the
 * `page#claim` ref of the conflicting claim (`claim`) and of the claims it conflicts with.
 */
export type TidyRow = { kind: ShownKind; page: string; claim?: string; targets: string[] }

/**
 * The tidying rows `signals` give: conflicts, broken links, thin pages and unfiled papers, in that
 * order and in Core's order within a kind, one row per kind and page, holding the targets of every
 * signal of that kind on that page once; a conflict row lands on the first conflicting claim.
 */
export function tidyRows(signals: WikiSignal[]): TidyRow[] {
  const rows = new Map<string, TidyRow>()
  for (const kind of ORDER) {
    for (const s of signals.filter((held) => held.kind === kind)) {
      const key = `${kind} ${s.page}`
      const row = rows.get(key) ?? { kind, page: s.page, targets: [] }
      const [first, ...rest] = s.related
      const found = kind === 'broken-link' ? s.related : kind === 'open-conflict' ? rest : []
      if (kind === 'open-conflict' && row.claim === undefined && first !== undefined) row.claim = first
      row.targets = [...new Set([...row.targets, ...found])]
      rows.set(key, row)
    }
  }
  return [...rows.values()]
}

/** The Wiki page a `page#claim` ref is on. */
const pageOf = (ref: string): string => ref.split('#')[0]!

/**
 * The tidying screen's list: one row per entry of `rows`, its kind tag, the page's name and, after it,
 * where it is wrong: the missing pages a broken link points to, or the claims a conflict is with, each a
 * link that opens it. `titles` names pages and claims by id or `page#claim` ref (a paper title may carry
 * LaTeX; an id it does not name shows as written); it is null while the names load. The list scrolls
 * with the page and its kind column is as wide as its longest tag. Activating a row hands its page and,
 * for a conflict, its claim to `onOpen`; a claim's link hands that claim's.
 */
export function TidyList({ rows, titles, onOpen }: {
  rows: TidyRow[]
  titles: Record<string, string> | null
  onOpen: (page: string, claim?: string) => void
}) {
  const m = useMessages()
  const t = m.wiki.tidy
  if (rows.length === 0) return <EmptyState variant="section">{t.empty}</EmptyState>
  if (titles === null) return <LoadingPlaceholder shape="rows" />
  const name = (id: string): string => titles[id] ?? id
  return (
    <StructuredList className="attn project-signal-columns tidy-list" variant="embedded" maxVisibleRows="all">
      {rows.map((row) => (
        <StructuredRow
          composite className="attnrow tidy-row" key={`${row.kind} ${row.page}`} data-wk={row.page}
          onActivate={() => onOpen(row.page, row.claim)}
        >
          <ProjectSignalKind tone={SHOWN[row.kind]}>{t.kinds[row.kind]}</ProjectSignalKind>
          <span className="tidy-what">
            <button type="button" className="tidy-open">
              <FadeText className="attn-text" label={plainTitle(name(row.page))}><PaperText text={name(row.page)} /></FadeText>
            </button>
            {row.targets.length === 0 ? null : (
              <FadeText className="tidy-wrong" label={`${row.kind === 'broken-link' ? t.pointsTo : t.conflictsWith} ${row.targets.map((id) => plainTitle(name(id))).join(' · ')}`}>
                {row.kind === 'broken-link'
                  ? `${t.pointsTo} ${row.targets.map(name).join(' · ')}`
                  : (
                    <>
                      {t.conflictsWith}{' '}
                      {row.targets.map((ref, at) => (
                        <Fragment key={ref}>
                          {at === 0 ? null : ' · '}
                          <EntityLink kind="page" label={<PaperText text={name(ref)} />} onOpen={() => onOpen(pageOf(ref), ref)} />
                        </Fragment>
                      ))}
                    </>
                  )}
              </FadeText>
            )}
          </span>
        </StructuredRow>
      ))}
    </StructuredList>
  )
}
