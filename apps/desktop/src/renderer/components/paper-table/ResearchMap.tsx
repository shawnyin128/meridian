import { useEffect, useMemo, useState } from 'react'
import type { PaperRow } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { EmptyState } from '../EmptyState.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { buildResearchMap, type ResearchMapReason } from './research-map.js'

const reasonKey = (reason: ResearchMapReason): string => `${reason.kind}:${reason.label}`

export function ResearchMap({ rows, total, loading, onOpenPaper }: {
  rows: PaperRow[]
  total: number
  loading: boolean
  onOpenPaper: (paper: PaperRow) => void
}) {
  const m = useMessages()
  const map = useMemo(() => buildResearchMap(rows), [rows])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = map.groups.find((group) => group.id === selectedId) ?? map.groups[0]

  useEffect(() => {
    if (selectedId !== null && !map.groups.some((group) => group.id === selectedId)) setSelectedId(null)
  }, [map.groups, selectedId])

  const reason = (item: ResearchMapReason): string => m.papers.researchMap.reason[item.kind](item.label)

  return (
    <section className="research-map" aria-label={m.papers.researchMap.title}>
      <div className="research-map-intro">
        <div className="research-map-copy">
          <div className="research-map-title">
            <strong>{m.papers.researchMap.title}</strong>
            <span className="tagchip">{m.papers.researchMap.preview}</span>
          </div>
          <p>{m.papers.researchMap.description}</p>
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
        ? <EmptyState variant="page">{m.papers.researchMap.loading}</EmptyState>
        : map.groups.length === 0
          ? <EmptyState variant="page">{m.papers.researchMap.empty}</EmptyState>
          : (
            <div className="research-map-layout">
              <StructuredList className="research-map-groups" aria-label={m.papers.researchMap.groupListAria}>
                {map.groups.map((group) => (
                  <StructuredRow
                    key={group.id}
                    className={selected?.id === group.id ? 'research-map-group is-selected' : 'research-map-group'}
                    aria-pressed={selected?.id === group.id}
                    onActivate={() => setSelectedId(group.id)}
                  >
                    <span className="research-map-group-copy">
                      <strong>{group.label}</strong>
                      <span>{m.papers.researchMap.kind[group.kind]}</span>
                    </span>
                    <span className="research-map-count">{group.members.length}</span>
                  </StructuredRow>
                ))}
              </StructuredList>

              {selected === undefined
                ? null
                : (
                  <div className="research-map-detail">
                    <div className="research-map-detail-head">
                      <div>
                        <strong>{selected.label}</strong>
                        <span>{m.papers.researchMap.paperCount(selected.members.length)}</span>
                      </div>
                      <span className="research-map-readonly">{m.papers.researchMap.readOnly}</span>
                    </div>
                    <StructuredList
                      variant="embedded" maxVisibleRows={7} className="research-map-papers"
                      aria-label={m.papers.researchMap.paperListAria(selected.label)}
                    >
                      {selected.members.map((member) => (
                        <StructuredRow
                          key={member.paper.id} className="research-map-paper"
                          onActivate={() => onOpenPaper(member.paper)}
                        >
                          <span className="research-map-paper-title">{member.paper.title}</span>
                          <span className="research-map-paper-meta">
                            {member.paper.year === undefined ? member.paper.venue : `${member.paper.year} · ${member.paper.venue}`}
                          </span>
                          <span className="research-map-why">
                            <span>{m.papers.researchMap.whyHere}</span>
                            {member.reasons.map((item) => <span className="tagchip" key={reasonKey(item)}>{reason(item)}</span>)}
                          </span>
                        </StructuredRow>
                      ))}
                    </StructuredList>
                  </div>
                )}
            </div>
          )}
    </section>
  )
}
