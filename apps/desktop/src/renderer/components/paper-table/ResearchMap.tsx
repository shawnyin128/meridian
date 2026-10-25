import { useEffect, useMemo, useState } from 'react'
import type { PaperRow, ReadState } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { ContextMenu, ContextMenuItem } from '../ContextMenu.js'
import { EmptyState } from '../EmptyState.js'
import { FadeText } from '../FadeText.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { RatingStars, ReadStatePicker } from '../PaperMetadata.js'
import { ReadDots } from '../ReadDots.js'
import { ListColumn, StructuredList, StructuredRow } from '../StructuredList.js'
import { CountBadge } from '../CountBadge.js'
import { Tag } from '../Tag.js'
import { Toolbar, ToolbarButton } from '../Toolbar.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { buildResearchMap, readCount, type ResearchMapReason } from './research-map.js'

const reasonKey = (reason: ResearchMapReason): string => `${reason.kind}:${reason.label}`

/** The ids of the rows after the groups; a group id starts with `concept:` or `project:`. */
const CROSS_GROUP = 'cross-group'
const UNGROUPED = 'ungrouped'

/** A row of the group lists and the papers its detail shows, each with the chips beside it. */
type MapEntry = {
  id: string
  label: string
  kind?: string
  papers: { paper: PaperRow; chips: { key: string; text: string }[] }[]
}

export function ResearchMap({ rows, total, loading, onOpenPaper, onReadPaper, onRate, onPickReadState }: {
  rows: PaperRow[]
  total: number
  loading: boolean
  onOpenPaper: (paper: PaperRow) => void
  onReadPaper: (paper: PaperRow) => void
  onRate: (paper: PaperRow, rating: number | null) => void
  onPickReadState: (paper: PaperRow, readState: ReadState) => void
}) {
  const m = useMessages()
  const map = useMemo(() => buildResearchMap(rows), [rows])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const entries = useMemo(() => {
    const groups = map.groups.map<MapEntry>((group) => ({
      id: group.id, label: group.label,
      ...(group.kind === 'phrase' ? {} : { kind: m.papers.researchMap.kind[group.kind] }),
      papers: group.members.map((member) => ({
        paper: member.paper,
        chips: member.reasons.map((item) => ({ key: reasonKey(item), text: m.papers.researchMap.reason[item.kind](item.label) })),
      })),
    }))
    const beyond: MapEntry[] = [
      ...map.crossGroup.length === 0 ? [] : [{
        id: CROSS_GROUP, label: m.papers.researchMap.crossGroup,
        papers: map.crossGroup.map((member) => ({
          paper: member.paper, chips: member.groups.map((group) => ({ key: group.id, text: group.label })),
        })),
      }],
      ...map.ungrouped.length === 0 ? [] : [{
        id: UNGROUPED, label: m.papers.researchMap.ungrouped, papers: map.ungrouped.map((paper) => ({ paper, chips: [] })),
      }],
    ]
    return { groups, beyond, all: [...groups, ...beyond] }
  }, [map, m])
  const selected = entries.all.find((entry) => entry.id === selectedId) ?? entries.groups[0]

  useEffect(() => {
    if (selectedId !== null && !entries.all.some((entry) => entry.id === selectedId)) setSelectedId(null)
  }, [entries, selectedId])

  const entryRow = (entry: MapEntry) => (
    <StructuredRow
      key={entry.id}
      className="research-map-group" selected={selected?.id === entry.id}
      aria-pressed={selected?.id === entry.id}
      onActivate={() => setSelectedId(entry.id)}
    >
      <span className="research-map-group-copy">
        <FadeText className="research-map-group-name" label={entry.label}>{entry.label}</FadeText>
        <ReadDots
          states={entry.papers.map((item) => item.paper.readState)}
          label={m.papers.researchMap.readProgress(readCount(entry.papers.map((item) => item.paper)), entry.papers.length)}
        />
        {entry.kind === undefined ? null : <span>{entry.kind}</span>}
      </span>
      <CountBadge count={entry.papers.length} />
    </StructuredRow>
  )

  return (
    <section className="research-map" aria-label={m.papers.views.researchMap}>
      {total > rows.length
        ? <div className="research-map-limit">{m.papers.researchMap.limit(rows.length, total)}</div>
        : null}

      {loading && rows.length === 0
        ? <LoadingPlaceholder shape="rows" />
        : map.groups.length === 0
          ? <EmptyState variant="page">{m.papers.researchMap.empty}</EmptyState>
          : (
            <div className="research-map-layout">
              <ListColumn className="research-map-index">
                <StructuredList className="research-map-groups" aria-label={m.papers.researchMap.groupListAria}>
                  {entries.groups.map(entryRow)}
                </StructuredList>
                {entries.beyond.length === 0
                  ? null
                  : <StructuredList className="research-map-groups">{entries.beyond.map(entryRow)}</StructuredList>}
              </ListColumn>

              {selected === undefined
                ? null
                : (
                  <div className="research-map-detail">
                    <div className="research-map-detail-head">
                      <div>
                        <FadeText className="research-map-detail-name" label={selected.label}>{selected.label}</FadeText>
                        <span>{m.papers.researchMap.paperCount(selected.papers.length)}</span>
                      </div>
                    </div>
                    <StructuredList
                      variant="embedded" maxVisibleRows="fill" className="research-map-papers"
                      aria-label={m.papers.researchMap.paperListAria(selected.label)}
                    >
                      {selected.papers.map((member) => (
                        <ContextMenu
                          key={member.paper.id} label={m.papers.contextMenu.label(plainTitle(member.paper.title))}
                          trigger={(
                            // The row is the toolbar of its own controls, from its title to its reading status.
                            <Toolbar label={plainTitle(member.paper.title)}>
                              <StructuredRow composite className="research-map-paper" onActivate={() => onOpenPaper(member.paper)}>
                                <ToolbarButton className="research-map-paper-open">
                                  <FadeText className="research-map-paper-title" label={plainTitle(member.paper.title)}>
                                    <PaperText text={member.paper.title} />
                                  </FadeText>
                                </ToolbarButton>
                                <span className="research-map-paper-marks">
                                  <RatingStars value={member.paper.rating} onChange={(rating) => onRate(member.paper, rating)} />
                                  <ReadStatePicker
                                    value={member.paper.readState} onPick={(readState) => onPickReadState(member.paper, readState)}
                                  />
                                </span>
                                <span className="research-map-paper-meta">
                                  {[member.paper.shortTitle, member.paper.year, member.paper.venue]
                                    .filter((part) => part !== undefined).join(' · ')}
                                </span>
                                {member.chips.length === 0 ? null : (
                                  <FadeText className="research-map-why">
                                    {member.chips.map((chip) => <Tag shape="chip" key={chip.key}>{chip.text}</Tag>)}
                                  </FadeText>
                                )}
                              </StructuredRow>
                            </Toolbar>
                          )}
                        >
                          <ContextMenuItem onSelect={() => onOpenPaper(member.paper)}>{m.papers.contextMenu.openDetail}</ContextMenuItem>
                          <ContextMenuItem onSelect={() => onReadPaper(member.paper)}>{m.papers.contextMenu.openReader}</ContextMenuItem>
                        </ContextMenu>
                      ))}
                    </StructuredList>
                  </div>
                )}
            </div>
          )}
    </section>
  )
}
