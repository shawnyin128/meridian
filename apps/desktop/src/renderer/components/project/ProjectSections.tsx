import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, ReactNode, RefObject } from 'react'
import type { AgentSession, Attachment, RelationGroup } from '../../../shared/contract.js'
import { papers } from '../../ipc.js'
import { AddAction } from '../AddAction.js'
import { CardTray } from '../CardTray.js'
import { IconCross } from '../icons.js'
import { MarkdownBox } from '../Markdown.js'
import { PickRow, type PickHit } from '../PickRow.js'
import { useFormat } from '../../lib/format.js'
import { useInlineDraft } from '../../hooks/useInlineDraft.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormInput } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import './ProjectSections.css'

/** Local-only grouping key for linked papers inside the relations list; never sent to Core. */
export const PROJECT_PAPER_GROUP = 'papers'
/** Stored group key of web-address relations. */
export const PROJECT_URL_GROUP = 'links'
export const PROJECT_RELATION_GROUPS = ['Wiki', PROJECT_PAPER_GROUP, PROJECT_URL_GROUP] as const

/** The name a web address shows under when the user gives none: the address without its scheme. */
export const urlDisplayName = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/**
 * Two-field draft for a web-address relation: the address and an optional display name. Enter in
 * either field submits, Escape or a click outside `row` cancels. `onSubmit` receives a normalized
 * http(s) address and resolves true when the row should close.
 */
export function ProjectUrlDraft({ row, triggers, onSubmit, onCancel, onInvalid }: {
  row: RefObject<HTMLElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  onSubmit: (url: string, name: string) => boolean | Promise<boolean>
  onCancel: () => void
  onInvalid: () => void
}) {
  const m = useMessages()
  const address = useRef<HTMLInputElement>(null)
  const label = useRef<HTMLInputElement>(null)
  const draft = useInlineDraft({
    row, triggers, onCancel,
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
        ref={address} className="inedit" placeholder={m.project.links.urlPlaceholder}
        autoComplete="off" autoFocus onKeyDown={draft.inputProps.onKeyDown}
      />
      <FormInput
        ref={label} className="inedit" placeholder={m.project.links.urlNamePlaceholder}
        autoComplete="off" onKeyDown={draft.inputProps.onKeyDown}
      />
    </div>
  )
}

const NO_TRIGGERS: Array<RefObject<HTMLElement | null>> = []
const CLIP_PATH = 'M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'

/** Project topic editor backed by the library's existing topic vocabulary. */
export function ProjectTopicField({ value, onSave, onError }: {
  value: string
  onSave: (topic: string) => Promise<boolean>
  onError: (error: Error) => void
}) {
  const m = useMessages()
  const [editing, setEditing] = useState(false)
  const [topics, setTopics] = useState<string[] | null>(null)
  const row = useRef<HTMLSpanElement>(null)
  const stop = useCallback(() => setEditing(false), [])

  useEffect(() => {
    if (!editing) return
    void papers.facets('topics').then((facets) => setTopics(facets.map((facet) => facet.value))).catch(onError)
  }, [editing, onError])

  const suggest = useCallback(async (query: string): Promise<PickHit[]> => (topics ?? [])
    .filter((topic) => topic.toLowerCase().includes(query.toLowerCase()))
    .map((topic) => ({ id: topic, title: topic })), [topics])

  if (!editing) {
    return (
      <span className="metadata-field">
        <button
          className="pv metadata-editable" title={m.common.field.clickToEdit}
          onClick={() => setEditing(true)}
        >
          {value}
        </button>
      </span>
    )
  }
  return (
    <span className="metadata-field" ref={row}>
      <PickRow
        row={row} triggers={NO_TRIGGERS} allowNew placeholder={m.project.identity.topic} suggest={suggest}
        inputClassName="metadata-input pickin" inputAppearance="inline"
        onPick={(hit) => onSave(hit.title)} onNew={onSave} onCancel={stop} onError={onError}
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
  const toggle = () => {
    if (!editing) { onEditing(true); return }
    const next = box.current?.innerText.trim() ?? ''
    onEditing(false)
    onSave(next)
  }
  return (
    <>
      <SectionHeading variant="content" className="flexh">{m.project.sections.remark}
        <button className="btn plain" onClick={toggle}>{editing ? m.common.save : m.common.edit}</button>
      </SectionHeading>
      <MarkdownBox
        className="memo" text={text} editing={editing} box={box}
        onCancel={() => onEditing(false)} onOpen={onOpen}
        empty={<span className="lm">{m.project.remarkEmpty}</span>}
      />
    </>
  )
}

/** Chip text that fades out at the chip's edge when it does not fit, and is left whole when it does. */
function ChipText({ children }: { children: string }) {
  const text = useRef<HTMLSpanElement>(null)
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const element = text.current
    if (element === null) return
    const measure = () => setClipped(element.scrollWidth > element.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [children])
  return <span ref={text} className={`tagchip-text${clipped ? ' clipped' : ''}`}>{children}</span>
}

/** Grouped paper/wiki relations with one insertion slot and consistent removable chips. */
export function ProjectRelations({
  groups, papers: linked, adding, onRemove, onOpenPage, onOpenPaper, onRemovePaper, onMove,
}: {
  groups: RelationGroup[]
  papers: { id: string; title: string }[]
  adding?: {
    group: string
    row: RefObject<HTMLDivElement | null>
    input: ReactNode
    onGroup: (group: string) => void
  } | undefined
  onRemove: (relationId: string, text: string) => void
  onOpenPage: (page: string) => void
  onOpenPaper: (paperId: string) => void
  onRemovePaper: (paperId: string, title: string) => void
  /** Drops the chip `id` at `index` among the chips of the same row. */
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
  })
  const chipClass = (row: RelationGroup, id: string) => {
    const at = rowChipIds(row).indexOf(id)
    const before = dropAt !== null && dropAt.row === row.group && dropAt.index === at
    const after = dropAt !== null && dropAt.row === row.group && dropAt.index === at + 1
      && at === rowChipIds(row).length - 1
    return `tagchip${dragging?.id === id ? ' dragging' : ''}${before ? ' drop-before' : ''}${after ? ' drop-after' : ''}`
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
  const rows = [
    ...groups,
    ...wanted
      .filter((group, at) => wanted.indexOf(group) === at && !groups.some((row) =>
        row.group === group || (isPaperRow(group) && isPaperRow(row.group))))
      .map((group) => ({ group, items: [] })),
  ]
  return (
    <>
      {rows.map((row) => (
        <div
          className="wkrel" key={row.group}
          ref={adding !== undefined && sameRow(adding.group, row.group) ? adding.row : undefined}
        >
          <span className="rl">{groupLabel(row.group)}</span>
          {isPaperRow(row.group)
            ? linked.map((paper) => (
              <span
                className={chipClass(row, paper.id)} key={paper.id} data-paper={paper.id}
                onClick={() => onOpenPaper(paper.id)} {...dragProps(row, paper.id)}
              >
                <ChipText>{paper.title}</ChipText>
                <button
                  className="rx" title={m.common.removeLink}
                  onClick={(event) => { event.stopPropagation(); onRemovePaper(paper.id, paper.title) }}
                ><IconCross sw={2.5} /></button>
              </span>
            ))
            : null}
          {row.items.map((item) => (
            <span
              className={chipClass(row, item.id)} key={item.id} data-wk={item.page} data-url={item.url}
              title={item.url} {...dragProps(row, item.id)}
              onClick={item.url !== undefined
                ? () => { window.open(item.url, '_blank') }
                : item.page === undefined ? undefined : () => onOpenPage(item.page!)}
            ><ChipText>{item.text}</ChipText>
              <button
                className="rx" title={m.common.removeLink}
                onClick={(event) => { event.stopPropagation(); onRemove(item.id, item.text) }}
              ><IconCross sw={2.5} /></button>
            </span>
          ))}
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
  onReveal: (attachment: Attachment) => void
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
          <AddAction variant="section" title={m.project.attachments.addTitle} onClick={() => input.current?.click()}>
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
        {attachments.length === 0 ? <div className="lm">{m.project.attachments.empty}</div> : null}
        {attachments.length === 0
          ? null
          : (
            <StructuredList className="attachment-list" variant="embedded">
              {attachments.map((attachment) => (
                <StructuredRow className="attrow" key={attachment.id}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={CLIP_PATH} />
                  </svg>
                  <span
                    className="an" title={m.project.attachments.reveal} onClick={() => onReveal(attachment)}
                  >{attachment.name}</span>
                  <span className="as">{attachment.size}</span>
                  <button
                    className="ax" title={m.project.attachments.delete} onClick={() => onRemove(attachment.id)}
                  ><IconCross /></button>
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
      <SectionHeading variant="content">{m.project.agentSessions.heading(sessions.length)}</SectionHeading>
      {sessions.map((session) => (
        <div className="agcard" key={session.id}>
          <div className="agh">
            <span className="agnm">{session.title}</span>
            <span className="stag mut">{m.project.agentSessions.done}</span>
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
