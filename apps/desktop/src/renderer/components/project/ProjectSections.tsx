import { useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { AgentSession, Attachment, RelationGroup } from '../../../shared/contract.js'
import { AddAction } from '../AddAction.js'
import { CardTray } from '../CardTray.js'
import { FadeText } from '../FadeText.js'
import { IconButton } from '../IconButton.js'
import { IconTrash } from '../icons.js'
import { EmptyState } from '../EmptyState.js'
import { MarkdownSection } from '../Markdown.js'
import { PaperText } from '../paper/PaperText.js'
import { useFormat } from '../../lib/format.js'
import type { KeptText, TextEdit } from '../../hooks/useDrafts.js'
import { useDragReorder } from '../../hooks/useDragReorder.js'
import { useInlineDraft } from '../../hooks/useInlineDraft.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormInput } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { ChipList } from '../ChipList.js'
import { Item, ItemOpen } from '../Item.js'
import { List } from '../List.js'
import { Tag } from '../Tag.js'
import { TopicChips } from '../TopicChips.js'
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
 * close. With `kept`, the address is kept as a draft under its target and the name under the target
 * followed by `:name`; the fields start from them, and the row closing drops both.
 */
export function ProjectUrlDraft({ row, triggers, initial, onSubmit, onCancel, onInvalid, kept }: {
  row: RefObject<HTMLElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  initial?: { url: string; text: string }
  onSubmit: (url: string, name: string) => boolean | Promise<boolean>
  onCancel: () => void
  onInvalid: () => void
  kept?: KeptText | undefined
}) {
  const m = useMessages()
  const address = useRef<HTMLInputElement>(null)
  const label = useRef<HTMLInputElement>(null)
  const draft = useInlineDraft({
    row, triggers, kept,
    onCancel: () => {
      kept?.drafts.drop(`${kept.target}:name`)
      onCancel()
    },
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
        defaultValue={kept?.drafts.get(kept.target) ?? initial?.url}
        {...draft.inputProps}
        onInput={(event) => {
          draft.inputProps.onInput()
          kept?.drafts.set(kept.target, event.currentTarget.value)
        }}
      />
      <FormInput
        ref={label} appearance="inline" className="inedit" placeholder={m.project.links.urlNamePlaceholder}
        defaultValue={kept?.drafts.get(`${kept.target}:name`) ?? initial?.text}
        {...draft.inputProps} autoFocus={false}
        onInput={(event) => {
          draft.inputProps.onInput()
          kept?.drafts.set(`${kept.target}:name`, event.currentTarget.value)
        }}
      />
    </div>
  )
}

const CLIP_PATH = 'M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'

/**
 * Project `projectId`'s topics in its property rail, on the same TopicChips papers use: a chip per
 * topic, which a click edits in place and whose × removes it, then the `+` that adds one where it
 * lands. `onSave` receives the whole new list of titles after an add or an edit, `onRemove` the list
 * after a removal; each returns whether the write completed.
 */
export function ProjectTopicsField({ projectId, topics, onSave, onRemove, onError }: {
  projectId: string
  topics: string[]
  onSave: (topics: string[]) => Promise<boolean>
  onRemove: (topics: string[]) => Promise<boolean>
  onError: (error: Error) => void
}) {
  return (
    <span className="metadata-field project-topics">
      <TopicChips
        topics={topics} onError={onError} keep={['project', projectId, 'areas']}
        onAdd={(topic) => onSave([...new Set([...topics, topic])])}
        onRemove={(topic) => onRemove(topics.filter((held) => held !== topic))}
        onReplace={(from, to) => onSave([...new Set(topics.map((held) => (held === from ? to : held)))])}
      />
    </span>
  )
}

/** The project memo, edited in place. `edit` is the memo's kept edit (see `editText`). */
export function ProjectMemo({ edit, onSave, onOpen }: {
  edit: TextEdit
  onSave: (next: string) => void
  onOpen: (id: string) => void
}) {
  const m = useMessages()
  return (
    <MarkdownSection
      title={m.project.sections.remark} className="memo" edit={edit} onOpen={onOpen}
      onSave={(next) => {
        edit.drop()
        onSave(next)
      }}
    />
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
  /**
   * Puts the chip `id` at `index` among the chips it moves with, from a drop or Alt+← / Alt+→: a row's
   * relation items, or the linked papers.
   */
  onMove: (id: string, index: number) => void
}) {
  const m = useMessages()
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
  // Linked papers and a row's relation items are stored apart, so each moves only among its own kind.
  const scopes = new Map(rows.flatMap((row) => [
    ...(isPaperRow(row.group) ? linked.map((paper) => [paper.id, `${row.group} papers`] as const) : []),
    ...row.items.map((item) => [item.id, `${row.group} items`] as const),
  ]))
  const scopeOf = (id: string) => scopes.get(id)!
  const reorder = useDragReorder([...scopes.keys()], scopeOf, (order, moved) => {
    onMove(moved, order.filter((id) => scopeOf(id) === scopeOf(moved)).indexOf(moved))
  }, { axis: 'x', handle: 'row' })
  return (
    <>
      {rows.length === 0 ? <EmptyState variant="section" /> : null}
      {rows.map((row) => {
        const adds = adding !== undefined && sameRow(adding.group, row.group)
        return (
          <ChipList
            key={row.group} label={groupLabel(row.group)} ref={adds ? adding.row : undefined} reorder={reorder.itemProps}
            before={adds
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
            chips={[
              ...(isPaperRow(row.group) ? linked : []).map((paper) => ({
                id: paper.id,
                name: <PaperText text={paper.title} />,
                onOpen: () => onOpenPaper(paper.id),
                data: { 'data-paper': paper.id },
                remove: { label: m.common.removeLink, onRemove: () => onRemovePaper(paper.id, paper.title) },
              })),
              ...row.items.map((item) => ({
                id: item.id,
                name: item.text,
                ...(item.url !== undefined
                  ? { onOpen: () => { window.open(item.url, '_blank') }, tooltip: item.url, external: true }
                  : item.page === undefined ? {} : { onOpen: () => onOpenPage(item.page!) }),
                data: { 'data-wk': item.page, 'data-url': item.url },
                edit: { label: m.project.links.editTitle, onEdit: () => onEdit(item) },
                remove: { label: m.common.removeLink, onRemove: () => onRemove(item.id, item.text) },
                ...(editing?.id === item.id ? { editor: <div className="reladd" ref={editing.row}>{editing.input}</div> } : {}),
              })),
            ]}
          />
        )
      })}
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
        level="group"
        actions={(
          <AddAction size="compact" label={m.project.attachments.addTitle} onClick={() => input.current?.click()}>
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
        {attachments.length === 0 ? <EmptyState variant="section" /> : null}
        {attachments.length === 0
          ? null
          : (
            <List className="attachment-list" variant="embedded">
              {attachments.map((attachment) => (
                <Item
                  className="attrow" key={attachment.id}
                  {...(attachment.path === undefined ? {} : { composite: true, onActivate: () => onReveal(attachment.path!) })}
                  leading={(
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={CLIP_PATH} />
                    </svg>
                  )}
                  title={(
                    <>
                      <ItemOpen className="an" disabled={attachment.path === undefined}><FadeText>{attachment.name}</FadeText></ItemOpen>
                      {attachment.path === undefined ? <Tag>{m.project.attachments.noPath}</Tag> : null}
                    </>
                  )}
                  trailing={<span className="as">{attachment.size}</span>}
                  actions={(
                    <IconButton
                      label={m.project.attachments.delete} size="nested" tone="danger" className="ax"
                      onClick={(event) => { event.stopPropagation(); onRemove(attachment.id) }}
                    ><IconTrash /></IconButton>
                  )}
                />
              ))}
            </List>
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
      <SectionHeading count={sessions.length}>{m.project.agentSessions.heading}</SectionHeading>
      {sessions.map((session) => (
        <Item
          density="card" className="agcard" key={session.id}
          title={<><span className="agnm">{session.title}</span><Tag>{m.project.agentSessions.done}</Tag></>}
          trailing={fmt.date(session.when)}
        >
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
        </Item>
      ))}
    </>
  )
}
