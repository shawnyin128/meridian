import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { ProjectSummary, ResearchIdea } from '../../shared/contract.js'
import { FINISHED_PROJECT } from '../../shared/vocabulary.js'
import { idea as ideaApi, project as projectApi } from '../ipc.js'
import { MenuItem, MenuSeparator } from '../components/ActionMenu.js'
import { SortMenu } from '../components/SortMenu.js'
import { FormInput, FormTextarea } from '../components/FormControls.js'
import { ChoicePicker, DotsMenu } from '../components/FieldPickers.js'
import { EditActions } from '../components/EditActions.js'
import { CollapsibleGroup } from '../components/CollapsibleGroup.js'
import { EmptyState } from '../components/EmptyState.js'
import { IdeaPanel, ideaSourceLabel } from '../components/ideas/IdeaPanel.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { DetailPanel } from '../components/DetailPanel.js'
import { CardOpen, ResearchObjectCard } from '../components/ResearchObjectCard.js'
import { RowActions } from '../components/StructuredList.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { useEscapeLayer, useJump, useScreenReentry, useVaultRevision } from '../shell/AppShell.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useDragReorder, type Reorderable } from '../hooks/useDragReorder.js'
import { DragHandle } from '../components/DragHandle.js'
import { useFormat } from '../lib/format.js'
import { commitsMultiline, composing } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import type { Catalog } from '../messages/catalog.js'
import { AgentLabel, SourceLabel } from '../components/SourceLabel.js'
import { Tag } from '../components/Tag.js'
import { Tooltip } from '../components/Tooltip.js'
import './Ideas.css'


function linkedProjectLabel(idea: ResearchIdea, linked: ProjectSummary | undefined, m: Catalog): string {
  if (idea.project === undefined) return m.ideas.link.none
  return linked === undefined ? m.ideas.link.unavailable : m.ideas.link.project(linked.name)
}

/**
 * Idea cards share the project cards' row-end pattern: clicking the card opens its details, and
 * management actions sit in the "More" menu.
 */
function IdeaMenu({ idea, linked, onMove, canMove, onArchive, onDelete }: {
  idea: ResearchIdea
  linked: ProjectSummary | undefined
  onMove: (by: -1 | 1) => void
  canMove: (by: -1 | 1) => boolean
  onArchive: () => void
  onDelete: () => void
}) {
  const m = useMessages()
  const locked = idea.archived && linked?.status === FINISHED_PROJECT
  return (
    <DotsMenu label={m.ideas.manage(idea.title)} stopRowActivation>
      <MenuItem disabled={!canMove(-1)} onSelect={() => onMove(-1)}>{m.common.moveUp}</MenuItem>
      <MenuItem disabled={!canMove(1)} onSelect={() => onMove(1)}>{m.common.moveDown}</MenuItem>
      <MenuSeparator />
      <MenuItem disabled={locked} onSelect={onArchive}>{idea.archived ? m.common.unarchive : m.common.archive}</MenuItem>
      <MenuSeparator />
      <MenuItem className="mi danger" onSelect={onDelete}>{m.common.delete}</MenuItem>
    </DotsMenu>
  )
}

function IdeaCard({ idea, linked, selected, menu, onOpen, reorder, dropClassName }: {
  idea: ResearchIdea
  linked: ProjectSummary | undefined
  selected: boolean
  menu: ReactNode
  onOpen: () => void
  reorder: Reorderable
  dropClassName: string
}) {
  const fmt = useFormat()
  const m = useMessages()
  return (
    <ResearchObjectCard
      className={`idea-card${dropClassName ? ` ${dropClassName}` : ''}`} selected={selected} muted={idea.archived}
      data-idea={idea.id} onActivate={onOpen} {...reorder.item}
    >
      <div className="idea-card-content">
        <div className="idea-card-title-row">
          <CardOpen><strong>{idea.title}</strong></CardOpen>
          <Tag
            tone={linked === undefined && idea.project !== undefined ? 'bad' : 'neutral'}
            className="idea-project-tag"
          >{linkedProjectLabel(idea, linked, m)}</Tag>
        </div>
        <p className="idea-card-summary">{idea.body}</p>
        <div className="idea-card-meta">
          <Tooltip label={m.project.idea.sourceTag(ideaSourceLabel(idea))} whenClipped>
            <span className="idea-card-source">{m.project.idea.sourceTag(ideaSourceLabel(idea))}</span>
          </Tooltip>
          {idea.source.agent === true
            ? <AgentLabel className="idea-source-kind" />
            : (
              <SourceLabel className="idea-source-kind">
                {idea.source.paperTitle === undefined ? m.ideas.sourceKind.chat : m.ideas.sourceKind.paperReading}
              </SourceLabel>
            )}
          <span className="idea-card-updated">{m.ideas.updated(fmt.date(idea.updated))}</span>
        </div>
      </div>
      <RowActions><DragHandle {...reorder.handle} />{menu}</RowActions>
    </ResearchObjectCard>
  )
}

function IdeaDetailPanel({ idea, linked, projects, onClose, onSave, onProject, onPromote, onOpen }: {
  idea: ResearchIdea
  linked: ProjectSummary | undefined
  projects: ProjectSummary[]
  onClose: () => void
  onSave: (title: string, body: string) => Promise<boolean>
  onProject: (projectId: string | null) => void
  onPromote: () => void
  onOpen: (screen: 'project' | 'chat', id: string) => void
}) {
  const m = useMessages()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(idea.title)
  const [body, setBody] = useState(idea.body)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setEditing(false)
    setTitle(idea.title)
    setBody(idea.body)
    setBusy(false)
  }, [idea.id, idea.title, idea.body])

  const startEditing = () => {
    setTitle(idea.title)
    setBody(idea.body)
    setEditing(true)
  }
  const cancelEditing = () => {
    setTitle(idea.title)
    setBody(idea.body)
    setEditing(false)
  }
  const save = () => {
    const nextTitle = title.trim()
    const nextBody = body.trim()
    if (busy || nextTitle === '' || nextBody === '') return
    setBusy(true)
    void onSave(nextTitle, nextBody).then((saved) => {
      setBusy(false)
      if (saved) setEditing(false)
    })
  }
  /** Enter commits the title, ⌘Enter or Ctrl+Enter the body, and Escape restores both. */
  const commitOrCancel = (multiline: boolean) => (event: KeyboardEvent<HTMLElement>) => {
    if (composing(event.nativeEvent)) return
    if (event.key === 'Escape') { event.stopPropagation(); cancelEditing(); return }
    if (multiline ? commitsMultiline(event.nativeEvent) : event.key === 'Enter') { event.preventDefault(); save() }
  }

  return (
    <aside className="idea-detail-panel node-document-pane" aria-label={m.ideas.detailHeading}>
      <IdeaPanel
        idea={idea} onClose={onClose} onOpenSourceChat={(chatId) => onOpen('chat', chatId)}
        actions={(
          <EditActions
            editing={editing} saving={busy} canSave={title.trim() !== '' && body.trim() !== ''}
            onEdit={startEditing} onCancel={cancelEditing} onSave={save}
          />
        )}
        editor={editing
          ? (
            <section className="idea-detail-editor">
              <label>
                <span>{m.ideas.editor.titleLabel}</span>
                <FormInput
                  autoFocus value={title} maxLength={160}
                  onChange={(event) => setTitle(event.target.value)} onKeyDown={commitOrCancel(false)}
                />
              </label>
              <label>
                <span>{m.ideas.bodyLabel}</span>
                <FormTextarea
                  value={body} maxLength={20_000}
                  onChange={(event) => setBody(event.target.value)} onKeyDown={commitOrCancel(true)}
                />
              </label>
            </section>
          )
          : undefined}
      >
        <SectionHeading
          variant="rail"
          actions={idea.project === undefined
            ? <button className="btn sm" onClick={onPromote}>{m.ideas.promote.action}</button>
            : linked === undefined
              ? undefined
              : <button className="btn sm" onClick={() => onOpen('project', linked.id)}>{m.ideas.promote.openProject}</button>}
        >{m.ideas.link.heading}
        </SectionHeading>
        <ChoicePicker
          appearance="field" className="idea-link-picker" aria-label={m.ideas.link.selectAriaLabel(idea.title)}
          value={idea.project ?? ''}
          options={[
            '',
            ...(idea.project !== undefined && linked === undefined ? [idea.project] : []),
            ...projects.map((project) => project.id),
          ]}
          label={(id) => {
            if (id === '') return m.ideas.link.none
            const project = projects.find((candidate) => candidate.id === id)
            return project === undefined ? m.ideas.link.originalUnavailable : `${project.name} · ${project.status}`
          }}
          onPick={(id) => onProject(id || null)}
        />
        {idea.project !== undefined && linked === undefined
          ? <div className="idea-missing-project">{m.ideas.link.originalUnavailable}</div>
          : null}
      </IdeaPanel>
    </aside>
  )
}

export function Ideas() {
  const m = useMessages()
  const { revision } = useVaultRevision()
  const { jump, open } = useJump()
  const write = useVaultWrite()
  const consumedJump = useRef(0)
  const [rows, setRows] = useState<ResearchIdea[] | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeDetail = useCallback(() => setSelectedId(null), [])

  const load = useCallback(() => {
    void Promise.all([ideaApi.list(), projectApi.list()]).then(([ideas, projectRows]) => {
      setRows(ideas)
      setProjects(projectRows)
      setSelectedId((held) => held !== null && ideas.some((idea) => idea.id === held) ? held : null)
      setError(null)
    }).catch((cause: Error) => setError(cause.message))
  }, [])
  useEffect(load, [load, revision])
  // Clicking the sidebar while this screen is shown lands on the plain list: an open detail closes.
  const reentry = useScreenReentry()
  useEffect(() => { setSelectedId(null) }, [reentry])
  useEffect(() => {
    if (jump === null || jump.seq === consumedJump.current) return
    consumedJump.current = jump.seq
    setSelectedId(jump.target)
  }, [jump])
  useEscapeLayer(selectedId !== null, closeDetail)

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )
  const listed = useMemo(() => rows ?? [], [rows])
  const selected = selectedId === null ? undefined : listed.find((idea) => idea.id === selectedId)
  const active = listed.filter((idea) => !idea.archived)
  const archived = listed.filter((idea) => idea.archived)

  const ids = useMemo(() => listed.map((idea) => idea.id), [listed])
  const archivedOf = useMemo(() => new Map(listed.map((idea) => [idea.id, idea.archived])), [listed])
  const reorder = useDragReorder(
    ids, (id) => (archivedOf.get(id) ? 'archived' : 'active'),
    (order) => { void write(ideaApi.reorder(order)) },
  )
  const sortByUpdated = () => {
    const order = [...listed].sort((a, b) => b.updated.localeCompare(a.updated)).map((idea) => idea.id)
    void write(ideaApi.reorder(order))
  }

  const archive = (idea: ResearchIdea) => {
    void write(
      ideaApi.update(idea.id, { archived: !idea.archived }),
      { note: idea.archived ? m.ideas.restoredNote : m.ideas.archivedNote },
    )
  }
  const remove = (idea: ResearchIdea) => {
    void write(ideaApi.delete(idea.id), { note: m.common.trashed }).then((saved) => {
      if (!saved) return
      if (selectedId === idea.id) setSelectedId(null)
    })
  }
  const card = (idea: ResearchIdea) => {
    const linked = idea.project === undefined ? undefined : projectsById.get(idea.project)
    return (
      <IdeaCard
        idea={idea} linked={linked} selected={selectedId === idea.id} key={idea.id}
        onOpen={() => setSelectedId(idea.id)}
        menu={(
          <IdeaMenu
            idea={idea} linked={linked} onArchive={() => archive(idea)} onDelete={() => remove(idea)}
            onMove={(by) => reorder.move(idea.id, by)} canMove={(by) => reorder.canMove(idea.id, by)}
          />
        )}
        reorder={{ item: reorder.itemProps(idea.id), handle: reorder.handleProps(idea.id) }}
        dropClassName={reorder.dropClass(idea.id)}
      />
    )
  }

  return (
    <PageShell className="ideas-page">
      <PageHeader><PageTitle>{m.ideas.title(active.length)}</PageTitle></PageHeader>
      <PageError error={error} />
      <PageBody className="ideas-body">
        <div className={`ideas-workspace${selected === undefined ? '' : ' has-detail'}`}>
          <main className="ideas-list">
            <SectionHeading actions={active.length === 0 ? undefined : (
              <SortMenu label={m.ideas.sort} options={[{ label: m.ideas.sortUpdated, onSelect: sortByUpdated }]} />
            )}
            >{m.ideas.activeHeading(active.length)}</SectionHeading>
            {rows === null ? (
              error === null ? <LoadingPlaceholder shape="cards" /> : null
            ) : active.length === 0
              ? <EmptyState variant="section">{m.ideas.empty}</EmptyState>
              : active.map(card)}
            {archived.length === 0 ? null : (
              <CollapsibleGroup
                variant="quiet" title={m.common.archived} count={archived.length}
                open={archiveOpen || archived.some((idea) => idea.id === selectedId)}
                onToggle={() => setArchiveOpen((open) => !open)}
              >
                {archived.map(card)}
              </CollapsibleGroup>
            )}
          </main>

          <DetailPanel open={selected !== undefined} mode="inline" className="idea-detail-slot">
            {selected === undefined ? null : (
              <IdeaDetailPanel
                idea={selected}
                linked={selected.project === undefined ? undefined : projectsById.get(selected.project)}
                projects={projects}
                onClose={closeDetail}
                onSave={(title, body) => write(
                  ideaApi.update(selected.id, { title, body }), { note: m.ideas.updatedNote },
                )}
                onProject={(projectId) => void write(
                  ideaApi.update(selected.id, { project: projectId }),
                  { note: projectId === null ? m.ideas.link.cleared : m.ideas.link.linked },
                )}
                onPromote={() => void write(
                  ideaApi.promote(selected.id), { note: m.ideas.promote.createdNote },
                )}
                onOpen={open}
              />
            )}
          </DetailPanel>
        </div>
      </PageBody>
    </PageShell>
  )
}
