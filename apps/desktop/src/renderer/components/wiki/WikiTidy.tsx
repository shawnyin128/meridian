import { Fragment } from 'react'
import type { WikiSignal, WikiSignalKind } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { EmptyState } from '../EmptyState.js'
import { EntityLink } from '../EntityLink.js'
import { FadeText } from '../FadeText.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { Item, ItemOpen } from '../Item.js'
import { List } from '../List.js'
import { Tag } from '../Tag.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { ProjectSignalKind } from '../project/ProjectSignals.js'
import './WikiTidy.css'

/** The signal kinds the tidying list shows, in the order it lists them, with the state each kind's tag names. */
const SHOWN = {
  'open-conflict': 'error', 'broken-link': 'error', 'thin-aggregation': 'warning', 'unfiled-paper': 'warning',
} as const satisfies Partial<Record<WikiSignalKind, 'error' | 'warning'>>
type ShownKind = keyof typeof SHOWN
const ORDER = Object.keys(SHOWN) as ShownKind[]

/** A missing page a broken link points to: its id, the name Core gives it, and whether it is in the trash. */
type MissingPage = { id: string } & NonNullable<WikiSignal['missing']>

/**
 * One tidying row: a signal kind the list shows, the page (or `projects/<id>`) it is about, and where
 * it is wrong: for a broken link the `missing` pages it points to; for a conflict the `page#claim` ref
 * of the conflicting claim (`claim`) and of the claims it conflicts with (`targets`).
 */
export type TidyRow = { kind: ShownKind; page: string; claim?: string; targets: string[]; missing: MissingPage[] }

/**
 * The tidying rows `signals` give: conflicts, broken links, thin pages and unfiled papers, in that
 * order and in Core's order within a kind, one row per kind and page, holding the targets or missing
 * pages of every signal of that kind on that page once; a conflict row lands on the first conflicting
 * claim. Throws on a broken link Core sent without naming its missing page.
 */
export function tidyRows(signals: WikiSignal[]): TidyRow[] {
  const rows = new Map<string, TidyRow>()
  for (const kind of ORDER) {
    for (const s of signals.filter((held) => held.kind === kind)) {
      const key = `${kind} ${s.page}`
      const row = rows.get(key) ?? { kind, page: s.page, targets: [], missing: [] }
      const [first, ...rest] = s.related
      if (kind === 'open-conflict' && row.claim === undefined && first !== undefined) row.claim = first
      if (kind === 'open-conflict') row.targets = [...new Set([...row.targets, ...rest])]
      if (kind === 'broken-link') {
        if (s.missing === undefined || first === undefined) throw new Error(`broken link without its missing page: ${s.page}`)
        if (!row.missing.some((held) => held.id === first)) row.missing.push({ id: first, ...s.missing })
      }
      rows.set(key, row)
    }
  }
  return [...rows.values()]
}

/** The Wiki page a `page#claim` ref is on. */
const pageOf = (ref: string): string => ref.split('#')[0]!

/**
 * The tidying screen's list: one row per entry of `rows`, its kind tag, the page's name and, after it,
 * where it is wrong: the missing pages a broken link points to by name, each one in the trash tagged as
 * such, or the claims a conflict is with, each a link that opens it. `titles` names pages and claims by
 * id or `page#claim` ref (a paper title may carry LaTeX; an id it does not name shows as written); it
 * is null while the names load, and shows nothing once `failed` says reading them failed. The list scrolls
 * with the page and its kind column is as wide as its longest tag. Activating a row hands its page and,
 * for a conflict, its claim to `onOpen`; a claim's link hands that claim's.
 */
export function TidyList({ rows, titles, failed, onOpen }: {
  rows: TidyRow[]
  titles: Record<string, string> | null
  failed: boolean
  onOpen: (page: string, claim?: string) => void
}) {
  const m = useMessages()
  const t = m.wiki.tidy
  if (rows.length === 0) return <EmptyState variant="section">{t.empty}</EmptyState>
  if (titles === null) return failed ? null : <LoadingPlaceholder shape="rows" />
  const name = (id: string): string => titles[id] ?? id
  /** A missing page's name as plain text, with the trash mark after it when it is in the trash. */
  const missingText = (page: MissingPage): string => (page.trashed ? `${plainTitle(page.name)} ${t.inTrash}` : plainTitle(page.name))
  return (
    <List className="attn project-signal-columns tidy-list" variant="embedded" rows="all">
      {rows.map((row) => (
        <Item
          composite className="attnrow tidy-row" key={`${row.kind} ${row.page}`} data-wk={row.page}
          onActivate={() => onOpen(row.page, row.claim)}
        >
          <ProjectSignalKind state={SHOWN[row.kind]}>{t.kinds[row.kind]}</ProjectSignalKind>
          <span className="tidy-what">
            <ItemOpen className="tidy-open">
              <FadeText className="attn-text" label={plainTitle(name(row.page))}><PaperText text={name(row.page)} /></FadeText>
            </ItemOpen>
            {row.targets.length === 0 && row.missing.length === 0 ? null : (
              <FadeText
                className="tidy-wrong"
                label={row.kind === 'broken-link'
                  ? `${t.pointsTo} ${row.missing.map(missingText).join(' · ')}`
                  : `${t.conflictsWith} ${row.targets.map((id) => plainTitle(name(id))).join(' · ')}`}
              >
                {row.kind === 'broken-link'
                  ? (
                    <>
                      {t.pointsTo}{' '}
                      {row.missing.map((page, at) => (
                        <Fragment key={page.id}>
                          {at === 0 ? null : ' · '}
                          <PaperText text={page.name} />
                          {page.trashed ? <Tag className="tidy-trashed">{t.inTrash}</Tag> : null}
                        </Fragment>
                      ))}
                    </>
                  )
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
        </Item>
      ))}
    </List>
  )
}
