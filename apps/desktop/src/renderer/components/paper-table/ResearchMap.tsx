import { useEffect, useMemo, useState } from 'react'
import type { PaperRow } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { useScrollFade } from '../../hooks/useScrollFade.js'
import { ContextMenu, ContextMenuItem } from '../ContextMenu.js'
import { EmptyState } from '../EmptyState.js'
import { FadeText } from '../FadeText.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { CountBadge, Tag } from '../Tag.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { buildResearchMap, type ResearchMapReason } from './research-map.js'

const reasonKey = (reason: ResearchMapReason): string => `${reason.kind}:${reason.label}`

export function ResearchMap({ rows, total, loading, onOpenPaper, onReadPaper }: {
  rows: PaperRow[]
  total: number
  loading: boolean
  onOpenPaper: (paper: PaperRow) => void
  onReadPaper: (paper: PaperRow) => void
}) {
  const m = useMessages()
  const mapFade = useScrollFade('y')
  const map = useMemo(() => buildResearchMap(rows), [rows])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = map.groups.find((group) => group.id === selectedId) ?? map.groups[0]

  useEffect(() => {
    if (selectedId !== null && !map.groups.some((group) => group.id === selectedId)) setSelectedId(null)
  }, [map.groups, selectedId])

  const reason = (item: ResearchMapReason): string => m.papers.researchMap.reason[item.kind](item.label)

  return (
    <section className="research-map" ref={mapFade} aria-label={m.papers.researchMap.title}>
      <div className="research-map-intro">
        <div className="research-map-copy">
          <div className="research-map-title">
            <strong>{m.papers.researchMap.title}</strong>
          </div>
        </div>
        <div className="research-map-stats" aria-label={m.papers.researchMap.summaryAria}>
          <span><strong>{map.groups.length}</strong>{m.papers.researchMap.groups}</span>
          <span><strong>{map.covered}</strong>{m.papers.researchMap.covered(total)}</span>
          <span><strong>{map.overlapping}</strong>{m.papers.researchMap.overlapping}</span>
        </div>
      </div>

      {total > rows.length
        ? <div className="research-map-limit">{m.papers.researchMap.limit(rows.length, total)}</div>
        : null}

      {loading && rows.length === 0
        ? <LoadingPlaceholder shape="rows" />
        : map.groups.length === 0
          ? <EmptyState variant="page">{m.papers.researchMap.empty}</EmptyState>
          : (
            <div className="research-map-layout">
              <StructuredList className="research-map-groups" aria-label={m.papers.researchMap.groupListAria}>
                {map.groups.map((group) => (
                  <StructuredRow
                    key={group.id}
                    className="research-map-group" selected={selected?.id === group.id}
                    aria-pressed={selected?.id === group.id}
                    onActivate={() => setSelectedId(group.id)}
                  >
                    <span className="research-map-group-copy">
                      <FadeText className="research-map-group-name" label={group.label}>{group.label}</FadeText>
                      {group.kind === 'phrase' ? null : <span>{m.papers.researchMap.kind[group.kind]}</span>}
                    </span>
                    <CountBadge count={group.members.length} />
                  </StructuredRow>
                ))}
              </StructuredList>

              {selected === undefined
                ? null
                : (
                  <div className="research-map-detail">
                    <div className="research-map-detail-head">
                      <div>
                        <FadeText className="research-map-detail-name" label={selected.label}>{selected.label}</FadeText>
                        <span>{m.papers.researchMap.paperCount(selected.members.length)}</span>
                      </div>
                    </div>
                    <StructuredList
                      variant="embedded" className="research-map-papers"
                      aria-label={m.papers.researchMap.paperListAria(selected.label)}
                    >
                      {selected.members.map((member) => (
                        <ContextMenu
                          key={member.paper.id} label={m.papers.contextMenu.label(plainTitle(member.paper.title))}
                          trigger={(
                            <StructuredRow className="research-map-paper" onActivate={() => onOpenPaper(member.paper)}>
                              <FadeText className="research-map-paper-title" label={plainTitle(member.paper.title)}>
                                <PaperText text={member.paper.title} />
                              </FadeText>
                              <span className="research-map-paper-meta">
                                {member.paper.year === undefined ? member.paper.venue : `${member.paper.year} · ${member.paper.venue}`}
                              </span>
                              <FadeText className="research-map-why">
                                {member.reasons.map((item) => <Tag shape="chip" className="tagchip" key={reasonKey(item)}>{reason(item)}</Tag>)}
                              </FadeText>
                            </StructuredRow>
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
