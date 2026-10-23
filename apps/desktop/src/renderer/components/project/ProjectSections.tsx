import { useCallback, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react'
import type { AgentSession, Attachment, RelationGroup } from '../../../shared/contract.js'
import { projectAreas } from '../../../shared/project-signals.js'
import { project as projectApi } from '../../ipc.js'
import { AddAction } from '../AddAction.js'
import { CardTray } from '../CardTray.js'
import { FadeText } from '../FadeText.js'
import { IconButton } from '../IconButton.js'
import { IconCross, IconPencil, IconTrash } from '../icons.js'
import { EditActions } from '../EditActions.js'
import { ExternalMark } from '../EntityLink.js'
import { EmptyState } from '../EmptyState.js'
import { MarkdownBox } from '../Markdown.js'
import { PaperText } from '../paper/PaperText.js'
import { useFormat } from '../../lib/format.js'
import { useInlineDraft } from '../../hooks/useInlineDraft.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormInput } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { RowActions, StructuredList, StructuredRow } from '../StructuredList.js'
import { Tag, tagClass } from '../Tag.js'
import { TagChips } from '../TagChips.js'
import { Tooltip } from '../Tooltip.js'
import './ProjectSections.css'

/** Local-only grouping key for linked papers inside the relations list; never sent to Core. */
export const PROJECT_PAPER_GROUP = 'papers'
/** Stored group key of web-address relations. */
export const PROJECT_URL_GROUP = 'links'
export const PROJECT_RELATION_GROUPS = ['Wiki', PROJECT_PAPER_GROUP, PROJECT_URL_GROUP] as const

/** The name a web address shows under when the user gives none: the address without its scheme. */
export const urlDisplayName = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/**
 * Two-field draft for a web-address relation: the address and an optional display name, holding
 * `initial` at first. Enter in either field or leaving `row` submits, Escape cancels, and leaving
 * both fields empty closes the row, as does leaving an `initial` draft unchanged or without an
 * address. `onSubmit` receives a normalized http(s) address and resolves true when the row should
 * close.
 */
export function ProjectUrlDraft({ row, triggers, initial, onSubmit, onCancel, onInvalid }: {
  row: RefObject<HTMLElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  initial?: { url: string; text: string }
  onSubmit: (url: string, name: string) => boolean | Promise<boolean>
  onCancel: () => void
  onInvalid: () => void
}) {
  const m = useMessages()
  const address = useRef<HTMLInputElement>(null)
  const label = useRef<HTMLInputElement>(null)
  const draft = useInlineDraft({
    row, triggers, onCancel,
    isEmpty: () => {
      const typed = address.current?.value.trim() ?? ''
      const name = label.current?.value.trim() ?? ''
      return initial === undefined
        ? `${typed}${name}` === ''
        : typed === '' || (typed === initial.url && name === initial.text)
    },
    onSubmit: () => {
      const typed = address.current?.value.trim() ?? ''
      if (typed === '') return false
      const url = /^https?:\/\//i.test(typed) ? typed : `https://${typed}`
      if (!URL.canParse(url)) { onInvalid(); return false }
      const name = label.current?.value.trim() ?? ''
      return onSubmit(url, name === '' ? urlDisplayName(url) : name)
    },
  })
  return (
    <div className="urldraft">
      <FormInput
        ref={address} appearance="inline" className="inedit" placeholder={m.project.links.urlPlaceholder}
        defaultValue={initial?.url}
        {...draft.inputProps}
      />
      <FormInput
        ref={label} appearance="inline" className="inedit" placeholder={m.project.links.urlNamePlaceholder}
        defaultValue={initial?.text}
        {...draft.inputProps} autoFocus={false}
      />
    </div>
  )
}

const CLIP_PATH = 'M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'

/**
 * Project `projectId`'s areas in its property rail: a chip per area, which a click edits in place and
 * whose × removes it, then the `+` that adds one where it lands. Every input offers the areas the
 * other projects use that this one lacks, asked of project.list each time it opens. `onSave`
 * receives the whole new list and returns whether the write completed.
 */
export function ProjectAreasField({ projectId, areas, onSave, onError }: {
  projectId: string
  areas: string[]
  onSave: (areas: string[]) => Promise<boolean>
  onError: (error: Error) => void
}) {
  const m = useMessages()
  const vocabulary = useCallback(() => projectApi.list().then((projects) => [...new Set(projects
    .filter((other) => other.id !== projectId).flatMap(projectAreas))]), [projectId])
  return (
    <span className="metadata-field project-areas">
      <TagChips
        values={areas} vocabulary={vocabulary} onError={onError}
        labels={{ add: m.project.identity.addArea, remove: m.project.identity.removeArea, existing: m.project.identity.existingAreas }}
        onAdd={(area) => onSave([...new Set([...areas, area])])}
        onRemove={(area) => onSave(areas.filter((held) => held !== area))}
        onReplace={(from, to) => onSave([...new Set(areas.map((held) => (held === from ? to : held)))])}
      />
    </span>
  )
}

/** Rendered Markdown and its source editor share one stable project-memo shell. */
export function ProjectMemo({ text, editing, onEditing, onSave, onOpen }: {
  text: string
  editing: boolean
  onEditing: (editing: boolean) => void
  onSave: (next: string) => void
  onOpen: (id: string) => void
}) {
  const m = useMessages()
  const box = useRef<HTMLDivElement>(null)
  const draft = useRef(text)
  const edit = () => {
    draft.current = text
    onEditing(true)
  }
  const save = () => {
    onEditing(false)
    onSave(draft.current.trim())
  }
  return (
    <>
      <SectionHeading
        actions={(
          <EditActions editing={editing} onEdit={edit} onCancel={() => onEditing(false)} onSave={save} />
        )}
      >{m.project.sections.remark}
      </SectionHeading>
      <MarkdownBox
        className="memo" text={text} editing={editing} box={box}
        live={{ onChange: (next) => { draft.current = next } }}
        onCancel={() => onEditing(false)} onSave={save} onOpen={onOpen}
        empty={<EmptyState variant="section">{m.project.remarkEmpty}</EmptyState>}
      />
    </>
  )
}

/**
 * Grouped paper/wiki relations with one insertion slot, consistent removable chips, and relation
 * items that open an edit slot: `editing.input` takes the place of the item `editing.id` inside
 * `editing.row`.
 */
export function ProjectRelations({
  groups, papers: linked, adding, editing, onEdit, onRemove, onOpenPage, onOpenPaper, onRemovePaper, onMove,
}: {
  groups: RelationGroup[]
  papers: { id: string; title: string }[]
  adding?: {
    group: string
    row: RefObject<HTMLDivElement | null>
    input: ReactNode
    onGroup: (group: string) => void
  } | undefined
  editing?: { id: string; row: RefObject<HTMLDivElement | null>; input: ReactNode } | undefined
  onEdit: (item: RelationGroup['items'][number]) => void
  onRemove: (relationId: string, text: string) => void
  onOpenPage: (page: string) => void
  onOpenPaper: (paperId: string) => void
  onRemovePaper: (paperId: string, title: string) => void
  /** Puts the chip `id` at `index` among the chips of the same row, from a drop or Alt+← / Alt+→. */
  onMove: (id: string, index: number) => void
}) {
  const m = useMessages()
  const [dragging, setDragging] = useState<{ row: string; id: string } | null>(null)
  const [dropAt, setDropAt] = useState<{ row: string; index: number } | null>(null)
  // The row's chips in display order, so a drop index counts papers and items together.
  const rowChipIds = (row: RelationGroup) => [
    ...(isPaperRow(row.group) ? linked.map((paper) => paper.id) : []),
    ...row.items.map((item) => item.id),
  ]
  const dragProps = (row: RelationGroup, id: string) => ({
    draggable: true,
    onDragStart: (event: ReactDragEvent) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', id)
      setDragging({ row: row.group, id })
    },
    onDragEnd: () => { setDragging(null); setDropAt(null) },
    onDragOver: (event: ReactDragEvent<HTMLElement>) => {
      if (dragging === null || dragging.row !== row.group) return
      event.preventDefault()
      const box = event.currentTarget.getBoundingClientRect()
      const at = rowChipIds(row).indexOf(id) + (event.clientX > box.left + box.width / 2 ? 1 : 0)
      setDropAt({ row: row.group, index: at })
    },
    onDrop: (event: ReactDragEvent) => {
      if (dragging === null || dropAt === null || dragging.row !== row.group) return
      event.preventDefault()
      const ids = rowChipIds(row)
      const from = ids.indexOf(dragging.id)
      const to = dropAt.index > from ? dropAt.index - 1 : dropAt.index
      setDragging(null)
      setDropAt(null)
      if (to !== from) onMove(dragging.id, to)
    },
    // The keyboard path of a drag: Alt+← / Alt+→ move the chip one place along its row.
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      const by = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      if (by === 0 || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      event.preventDefault()
      const ids = rowChipIds(row)
      const to = ids.indexOf(id) + by
      if (to >= 0 && to < ids.length) onMove(id, to)
    },
  })
  const chipClass = (row: RelationGroup, id: string) => {
    const at = rowChipIds(row).indexOf(id)
    const before = dropAt !== null && dropAt.row === row.group && dropAt.index === at
    const after = dropAt !== null && dropAt.row === row.group && dropAt.index === at + 1
      && at === rowChipIds(row).length - 1
    return tagClass('neutral', 'chip', `tagchip${dragging?.id === id ? ' dragging' : ''}${before ? ' drop-before' : ''}${after ? ' drop-after' : ''}`)
  }
  const groupLabel = (group: string) => (group === PROJECT_PAPER_GROUP
    ? m.project.sections.papers
    : group === PROJECT_URL_GROUP ? m.project.sections.urls : group)
  // A stored group named like the papers label is the papers row: linked papers render on it too.
  const isPaperRow = (group: string) => group === PROJECT_PAPER_GROUP || group === m.project.sections.papers
  const sameRow = (a: string, b: string) => a === b || (isPaperRow(a) && isPaperRow(b))
  const wanted = [
    ...(linked.length > 0 ? [PROJECT_PAPER_GROUP] : []),
    ...(adding === undefined ? [] : [adding.group]),
  ]
  // A stored group with no items shows only while it holds linked papers or is being added to.
  const held = groups.filter((row) => row.items.length > 0
    || (isPaperRow(row.group) && linked.length > 0) || (adding !== undefined && sameRow(adding.group, row.group)))
  const rows = [
    ...held,
    ...wanted
      .filter((group, at) => wanted.indexOf(group) === at && !held.some((row) =>
        row.group === group || (isPaperRow(group) && isPaperRow(row.group))))
      .map((group) => ({ group, items: [] })),
  ]
  return (
    <>
      {rows.length === 0 ? <EmptyState variant="section">{m.project.links.empty}</EmptyState> : null}
      {rows.map((row) => (
        <div
          className="wkrel" key={row.group}
          ref={adding !== undefined && sameRow(adding.group, row.group) ? adding.row : undefined}
        >
          <span className="rl">{groupLabel(row.group)}</span>
          {adding !== undefined && sameRow(adding.group, row.group)
            ? (
              <div className="reladd">
                <SegmentedControl
                  label={m.project.links.groupLabel}
                  value={adding.group}
                  options={PROJECT_RELATION_GROUPS.map((group) => ({ value: group, label: groupLabel(group) }))}
                  onChange={adding.onGroup}
                />
                {adding.input}
              </div>
            )
            : null}
          {isPaperRow(row.group)
            ? linked.map((paper) => (
              <span
                className={chipClass(row, paper.id)} key={paper.id} data-paper={paper.id} data-row-actions=""
                onClick={() => onOpenPaper(paper.id)} {...dragProps(row, paper.id)}
              >
                <button type="button" className="tagchip-open">
                  <FadeText className="tagchip-text"><PaperText text={paper.title} /></FadeText>
                </button>
                <RowActions>
                  <IconButton
                    label={m.common.removeLink} size="inline" className="rx"
                    onClick={(event) => { event.stopPropagation(); onRemovePaper(paper.id, paper.title) }}
                  ><IconCross /></IconButton>
                </RowActions>
              </span>
            ))
            : null}
          {row.items.map((item) => (editing?.id === item.id
            ? <div className="reladd" key={item.id} ref={editing.row}>{editing.input}</div>
            : (
              <span
                className={chipClass(row, item.id)} key={item.id} data-wk={item.page} data-url={item.url}
                data-row-actions="" {...dragProps(row, item.id)}
                onClick={item.url !== undefined
                  ? () => { window.open(item.url, '_blank') }
                  : item.page === undefined ? undefined : () => onOpenPage(item.page!)}
              >
                {item.url === undefined && item.page === undefined
                  ? <FadeText className="tagchip-text">{item.text}</FadeText>
                  : (
                    <Tooltip label={item.url}>
                      <button type="button" className="tagchip-open">
                        <FadeText className="tagchip-text">{item.text}</FadeText>
                        {item.url === undefined ? null : <ExternalMark />}
                      </button>
                    </Tooltip>
                  )}
                <RowActions>
                  <IconButton
                    label={m.project.links.editTitle} size="inline" className="tagchip-edit"
                    onClick={(event) => { event.stopPropagation(); onEdit(item) }}
                  ><IconPencil /></IconButton>
                  <IconButton
                    label={m.common.removeLink} size="inline" className="rx"
                    onClick={(event) => { event.stopPropagation(); onRemove(item.id, item.text) }}
                  ><IconCross /></IconButton>
                </RowActions>
              </span>
            )))}
        </div>
      ))}
    </>
  )
}

export const attachmentSizeText = (bytes: number) => bytes >= 1048576
  ? `${(bytes / 1048576).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`

/** Attachment drop target and list; persistence and reveal behavior stay injected. */
export function ProjectAttachments({ attachments, onAdd, onReveal, onRemove }: {
  attachments: Attachment[]
  onAdd: (files: File[]) => void
  onReveal: (path: string) => void
  onRemove: (attachmentId: string) => void
}) {
  const m = useMessages()
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <SectionHeading
        variant="rail"
        actions={(
          <AddAction variant="section" label={m.project.attachments.addTitle} onClick={() => input.current?.click()}>
            {m.project.sections.attachments}
          </AddAction>
        )}
      >{m.project.sections.attachments}
      </SectionHeading>
      <div
        className={over ? 'attachments drag' : 'attachments'}
        onDragOver={(event) => { event.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault(); setOver(false)
          const dropped = [...event.dataTransfer.files]
          if (dropped.length) onAdd(dropped)
        }}
      >
        <FormInput
          ref={input} type="file" multiple hidden
          onChange={(event) => {
            const picked = [...(event.target.files ?? [])]
            event.target.value = ''
            if (picked.length) onAdd(picked)
          }}
        />
        {attachments.length === 0 ? <EmptyState variant="section">{m.project.attachments.empty}</EmptyState> : null}
        {attachments.length === 0
          ? null
          : (
            <StructuredList className="attachment-list" variant="embedded">
              {attachments.map((attachment) => (
                <StructuredRow className="attrow" key={attachment.id}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={CLIP_PATH} />
                  </svg>
                  <button
                    type="button" className="an" disabled={attachment.path === undefined}
                    onClick={() => { if (attachment.path !== undefined) onReveal(attachment.path) }}
                  >{attachment.name}</button>
                  {attachment.path === undefined ? <Tag>{m.project.attachments.noPath}</Tag> : null}
                  <span className="as">{attachment.size}</span>
                  <RowActions>
                    <IconButton
                      label={m.project.attachments.delete} size="nested" tone="danger" className="ax"
                      onClick={() => onRemove(attachment.id)}
                    ><IconTrash /></IconButton>
                  </RowActions>
                </StructuredRow>
              ))}
            </StructuredList>
          )}
      </div>
    </>
  )
}

/** Read-only translation of completed coding-agent sessions for a project. */
export function ProjectAgentSessions({ sessions }: { sessions: AgentSession[] }) {
  const fmt = useFormat()
  const m = useMessages()
  return (
    <>
      <SectionHeading>{m.project.agentSessions.heading(sessions.length)}</SectionHeading>
      {sessions.map((session) => (
        <div className="agcard" key={session.id}>
          <div className="agh">
            <span className="agnm">{session.title}</span>
            <Tag>{m.project.agentSessions.done}</Tag>
            <span className="agbg">{fmt.date(session.when)}</span>
          </div>
          <CardTray
            className="agent-run-tray" summary={session.outcome}
            expandLabel={m.common.details.expand} collapseLabel={m.common.details.collapse}
          >
            <div className="agsteps">
              {session.steps.map((step) => (
                <div className="agstep" key={`${step.time} ${step.text}`}>
                  <span className="agt">{step.time}</span>{step.text}
                </div>
              ))}
            </div>
          </CardTray>
        </div>
      ))}
    </>
  )
}
