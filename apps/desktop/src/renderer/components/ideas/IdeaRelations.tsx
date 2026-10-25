import { useCallback, useMemo, useRef, useState } from 'react'
import type { IdeaRelations as Relations, ProjectSummary, ResearchIdea } from '../../../shared/contract.js'
import { useDrafts } from '../../hooks/useDrafts.js'
import { useMessages } from '../../messages/useMessages.js'
import { AddAction } from '../AddAction.js'
import { EmptyState } from '../EmptyState.js'
import { FadeText } from '../FadeText.js'
import { IconButton } from '../IconButton.js'
import { IconCross } from '../icons.js'
import { SectionHeading } from '../PageShell.js'
import { PickRow, type PickHit } from '../PickRow.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { useDraftSlot } from '../DraftSlot.js'
import { RowActions } from '../Item.js'
import { tagClass } from '../Tag.js'

type Row = keyof Relations

const ROWS: readonly Row[] = ['projects', 'pages']

/**
 * The relations section of an idea's panel: what the idea is about, a row of projects and a row of
 * Wiki pages as the project page draws its relations, each chip opening what it names and removable.
 * The heading's add action drafts a relation in place, in the row it lands in, picked from `projects`
 * or from `pages` (Wiki page titles by id). The project the idea was sparked in comes first among the
 * projects while it is not related, as a candidate. `onChange` writes the whole set, with the name of the
 * relation it removes when it removes one, and settles whether it was written; a failed suggestion goes
 * to `onError`.
 */
export function IdeaRelations({ idea, projects, pages, onChange, onOpenProject, onOpenPage, onError }: {
  idea: ResearchIdea
  projects: readonly ProjectSummary[]
  pages: ReadonlyMap<string, string>
  onChange: (relations: Relations, removed?: string) => Promise<boolean>
  onOpenProject: (projectId: string) => void
  onOpenPage: (pageId: string) => void
  onError: (error: Error) => void
}) {
  const m = useMessages()
  const r = m.ideas.relation
  const held = useMemo(() => idea.relations ?? { projects: [], pages: [] }, [idea.relations])
  // The row being added to and what is typed there are kept as a draft of the idea.
  const kept = useDrafts<string>(['idea', idea.id, 'relation'])
  const [ownAdding, setOwnAdding] = useState<Row | null>(null)
  const adding = ownAdding ?? ROWS.find((row) => kept.get(`add:${row}`) !== undefined) ?? null
  const setAdding = useCallback((row: Row | null) => {
    for (const other of ROWS) if (other !== row) kept.drop(`add:${other}`)
    setOwnAdding(row)
  }, [kept])
  const relationDraft = useDraftSlot<HTMLDivElement>(adding !== null, () => setAdding('projects'))
  const draftRow = relationDraft.slot
  const add = useRef<HTMLButtonElement>(null)
  const triggers = useMemo(() => [add], [])
  const stop = useCallback(() => setAdding(null), [setAdding])
  const nameOf = (row: Row, id: string) => (row === 'projects'
    ? projects.find((project) => project.id === id)?.name ?? m.ideas.link.unavailable
    : pages.get(id) ?? id)
  const candidate = idea.sourceProject !== undefined && !held.projects.includes(idea.sourceProject)
    ? projects.find((project) => project.id === idea.sourceProject)
    : undefined

  const suggest = useCallback(async (query: string): Promise<PickHit[]> => {
    const needle = query.toLowerCase()
    const matches = (title: string) => title.toLowerCase().includes(needle)
    if (adding === 'pages') {
      return query === ''
        ? []
        : [...pages].filter(([id, title]) => !held.pages.includes(id) && matches(title)).map(([id, title]) => ({ id, title }))
    }
    const first = candidate === undefined || !matches(candidate.name) ? [] : [{ id: candidate.id, title: candidate.name, meta: r.candidate }]
    const rest = query === ''
      ? []
      : projects.filter((project) => project.id !== candidate?.id && !held.projects.includes(project.id) && matches(project.name))
        .map((project) => ({ id: project.id, title: project.name }))
    return [...first, ...rest]
  }, [adding, candidate, held, pages, projects, r.candidate])

  const visible = ROWS.filter((row) => held[row].length > 0 || adding === row)
  return (
    <>
      <SectionHeading
        level="group"
        actions={(
          <AddAction size="compact" ref={add} label={m.project.links.addTitle} onClick={relationDraft.start}>
            {m.project.sections.links}
          </AddAction>
        )}
      >{m.project.sections.links}
      </SectionHeading>
      {visible.length === 0 ? <EmptyState variant="section">{m.project.links.empty}</EmptyState> : null}
      {visible.map((row) => (
        <div className="wkrel idea-relation-row" data-relations={row} key={row} ref={adding === row ? draftRow : undefined}>
          <span className="rl">{r.rows[row]}</span>
          {adding === row
            ? (
              <div className="reladd">
                <SegmentedControl
                  label={m.project.links.groupLabel} value={row}
                  options={ROWS.map((value) => ({ value, label: r.rows[value] }))}
                  onChange={setAdding}
                />
                <PickRow
                  key={row} row={draftRow} triggers={triggers} allowNew={false} onNew={() => false}
                  placeholder={row === 'projects' ? m.project.identity.nameFieldLabel : m.project.links.pagePlaceholder}
                  suggest={suggest} onCancel={stop} onError={onError} kept={{ drafts: kept, target: `add:${row}` }}
                  onPick={(hit) => onChange({ ...held, [row]: [...held[row], hit.id] })}
                />
              </div>
            )
            : null}
          {held[row].map((id) => (
            <span className={tagClass(undefined, 'chip', 'tagchip')} key={id} data-row-actions="">
              <button
                type="button" className="tagchip-open"
                onClick={() => (row === 'projects' ? onOpenProject(id) : onOpenPage(id))}
              ><FadeText className="tagchip-text">{nameOf(row, id)}</FadeText>
              </button>
              <RowActions>
                <IconButton
                  label={m.common.removeLink} size="inline" className="rx"
                  onClick={() => { void onChange({ ...held, [row]: held[row].filter((other) => other !== id) }, nameOf(row, id)) }}
                ><IconCross /></IconButton>
              </RowActions>
            </span>
          ))}
        </div>
      ))}
    </>
  )
}
