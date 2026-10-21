import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChatMessage, PaperRow, ProjectSummary, WikiAggregationCard,
} from '../../shared/contract.js'
import { chat, feed, idea as ideaApi, papers, project, wiki } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import {
  useChatSession, useCrumbTail, useJump, useNotice, useVaultRevision, type CrumbSeg,
} from '../shell/AppShell.js'
import { dnum } from '../../shared/dates.js'
import { useFormat, type Format } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import type { Catalog } from '../messages/catalog.js'
import { ChatMessageView } from '../components/chat/ChatMessage.js'
import { FOCUS_KEY } from '../../shared/project-signals.js'
import { PickerPopover, PickOption } from '../components/PickerPopover.js'
import { EmptyState } from '../components/EmptyState.js'
import { FormTextarea } from '../components/FormControls.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import {
  PageBody, PageError, PageFooter, PageHeader, PageShell, PageTitle,
} from '../components/PageShell.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { useDrafts } from '../hooks/useDrafts.js'
import { useFollowEnd } from '../hooks/useFollowEnd.js'
import { useGenerations } from '../hooks/useGenerations.js'
import { useNoModelChats } from '../hooks/useNoModelChats.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { CONFLICT_THREAD, sendsMessage } from '../lib/chat.js'
import { composing } from '../lib/keyboard.js'
import { IdeaDraft, type IdeaDraftText } from '../components/ideas/IdeaDraft.js'
import { GenerationControl } from '../components/GenerationControl.js'
import { FadeText } from '../components/FadeText.js'
import { Toolbar, ToolbarButton } from '../components/Toolbar.js'
import { namedRuns, TitleNote } from '../components/TitleNote.js'
import { NoModelTag } from '../components/NoModelTag.js'
import { Tag } from '../components/Tag.js'
import { Tooltip } from '../components/Tooltip.js'
import { readStateName } from '../components/PaperMetadata.js'
import { PaperText } from '../components/paper/PaperText.js'
import { plainTitle } from '../components/paper/paper-text.js'
import './shell.css'
import '../components/chat/Chat.css'

/** How many recently added papers `@` offers, as in the demo's mentionEntities. */
const MENTION_PAPERS = 5
/** The mentionUI of the demo: Each group can list up to this many items. */
const MENTION_PER_GROUP = 4
/**
 * The demo's renderQuickMentions: the quick `@` buttons above the composer take this many
 * projects and this many papers.
 */
const QUICK_MENTIONS = 2

/** One candidate in the `@` picker; `entity` is the vault entity it names. */
type Mention =
  | { kind: 'project'; title: string; meta: string; entity: ProjectSummary }
  | { kind: 'paper'; title: string; meta: string; entity: PaperRow }
  | { kind: 'page'; title: string; meta: string; entity: WikiAggregationCard }

/**
 * The entities `@` can reference, as in the demo's mentionEntities: projects first, by most recent
 * progress, then the most recently added papers, then every Wiki page.
 */
function mentionsOf(
  projects: ProjectSummary[], rows: PaperRow[], pages: WikiAggregationCard[], fmt: Format, m: Catalog,
): Mention[] {
  const advanced = (p: ProjectSummary) => {
    const last = p.recentEvents.at(-1)
    return last === undefined ? 0 : dnum(last.date)
  }
  return [
    ...[...projects].sort((a, b) => advanced(b) - advanced(a)).map((p): Mention => ({
      kind: 'project', title: p.name,
      meta: `${p.status} · ${m.project.identity.focusLabel[FOCUS_KEY[p.status]]}:${p.focus}`, entity: p,
    })),
    ...rows.map((p): Mention => ({
      kind: 'paper',
      title: plainTitle(p.title),
      meta: p.year === undefined ? readStateName(m, p.readState) : `${p.year} · ${readStateName(m, p.readState)}`,
      entity: p,
    })),
    ...pages.map((p): Mention => ({
      kind: 'page', title: p.title, meta: `${p.kindLabel} · ${m.common.updatedOn(fmt.date(p.updated))}`, entity: p,
    })),
  ]
}

/**
 * The `@` picker's candidates for the current input, as in the demo's mentionUI: an item matches
 * when the text typed after `@` appears in its name or its gray meta line, and each group keeps at
 * most MENTION_PER_GROUP matches.
 */
function hitsOf(typed: string, all: Mention[]): Mention[] {
  const needle = typed.slice(1).toLowerCase()
  const perGroup: Record<string, number> = {}
  return all
    .filter((m) => !needle || m.title.toLowerCase().includes(needle) || m.meta.toLowerCase().includes(needle))
    .filter((m) => {
      perGroup[m.kind] = (perGroup[m.kind] ?? 0) + 1
      return perGroup[m.kind]! <= MENTION_PER_GROUP
    })
}

/** Persistent conversation UI. Core owns context and writes; each explicit send runs one Harness turn. */
export function Chat() {
  const fmt = useFormat()
  const m = useMessages()
  const { id, title, archived, select } = useChatSession()
  const { jump, open } = useJump()
  const { revision, bump } = useVaultRevision()
  const notice = useNotice()
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const drafts = useDrafts()
  // The `@` picker, like the draft, belongs to the chat it was opened in.
  const [mentionIn, setMentionIn] = useState<string | null>(null)
  // An idea being drafted belongs to its chat, as the message being typed does.
  const ideaDrafts = useDrafts<IdeaDraftText>()
  const ideaAt = useRef<HTMLDivElement>(null)
  const { running, run, stop } = useGenerations()
  const { noModel, track } = useNoModelChats()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [rows, setRows] = useState<PaperRow[]>([])
  const [pages, setPages] = useState<WikiAggregationCard[]>([])
  const [error, setError] = useState<string | null>(null)
  // The page body, not the message list, scrolls the conversation.
  const { ref: followRef, follow } = useFollowEnd<HTMLDivElement>()
  const composer = useRef<HTMLTextAreaElement>(null)
  const consumed = useRef(0)
  const reportError = useCallback((e: unknown) => setError(errorLabel(m, e)), [m])
  const write = useVaultWrite()
  const draft = id === null ? '' : drafts.get(id) ?? ''
  const ideaDraft = id === null ? undefined : ideaDrafts.get(id)
  const mentioning = id !== null && mentionIn === id
  const sending = id !== null && running(id)

  useEffect(() => {
    void project.list().then(setProjects).catch(reportError)
    void papers.list({ page: 1, size: MENTION_PAPERS }).then((r) => setRows(r.rows)).catch(reportError)
    void wiki.cards().then(setPages).catch(reportError)
  }, [revision, reportError])

  useEffect(() => {
    setMessages(null)
    follow()
  }, [id, follow])
  useEffect(() => {
    if (id === null) return
    void chat.messages(id).then(setMessages).catch(reportError)
  }, [id, revision, reportError])

  const mentions = useMemo(() => mentionsOf(projects, rows, pages, fmt, m), [projects, rows, pages, fmt, m])
  // Candidates come from the current input and the loaded vault data: empty until the data arrives,
  // after which the picker opens by itself.
  const suggest = useMemo(() => (mentioning ? hitsOf(draft.trim(), mentions) : []), [mentioning, draft, mentions])

  const send = useCallback((session: string, text: string) => {
    follow()
    return run(session, write(track(session, chat.send(session, text))))
  }, [follow, run, write, track])

  const stopSending = () => {
    if (id === null) return
    stop(id)
    void chat.cancel(id)
  }

  // The conflict brief in the Feed starts a new chat and asks the preset question, as in the demo.
  // Any other jump target is an existing chat (e.g. a search hit), so just switch to it.
  useEffect(() => {
    if (jump === null || jump.seq === consumed.current) return
    consumed.current = jump.seq
    if (jump.target !== CONFLICT_THREAD) {
      select(jump.target)
      return
    }
    void chat.create(m.chat.conflictTitle, true).then(async (session) => {
      select(session.id)
      await send(session.id, m.chat.conflictQuestion)
    }).catch((e: unknown) => notice.refusal(errorLabel(m, e)))
  }, [jump, select, send, notice, m])

  const setDraft = (text: string) => { if (id !== null) drafts.set(id, text) }
  const setMentioning = (on: boolean) => setMentionIn(on ? id : null)

  const type = (value: string) => {
    setDraft(value)
    setMentioning(value.trim().startsWith('@'))
  }

  // A row of the demo's cRes picker: replace the whole input with this mention
  const pick = (name: string) => {
    setDraft(`@${name} `)
    setMentioning(false)
    composer.current?.focus()
  }
  const keys = useCandidateKeys(suggest.length, (i) => pick(suggest[i]!.title))

  // The demo's quick @: replace the leading mention and keep the text typed after it.
  const quick = (name: string) => {
    setDraft(`@${name} ${draft.replace(/^@\S+\s*/, '')}`)
    composer.current?.focus()
  }

  const submit = () => {
    const v = draft.trim()
    if (v === '' || id === null || sending) return
    const mention = [...mentions].sort((a, b) => b.title.length - a.title.length)
      .find((m) => v.toLowerCase().startsWith(`@${m.title}`.toLowerCase()))
    if (v.startsWith('@') && mention === undefined) { setMentioning(true); return }
    setDraft('')
    setMentioning(false)
    void send(id, v)
  }

  const act = (message: ChatMessage) => {
    if (id === null) return
    void chat.recordAction(id, message.id).then(async (p) => {
      notice.success(<TitleNote message={m.chat.recordedNote} title={p.name} />)
      await feed.append({
        source: 'me', body: { kind: 'runs', runs: namedRuns(m.chat.recordedNote, p.name, { kind: 'project', id: p.id }) },
      })
      bump()
    }).catch((e: unknown) => notice.refusal(errorLabel(m, e)))
  }
  const hasDiscussion = (messages ?? []).some((message) => message.role === 'you')

  const startIdea = () => {
    if (id === null) return
    if (ideaDraft === undefined) ideaDrafts.set(id, { title: '', body: '' })
    else ideaAt.current?.querySelector<HTMLElement>('.form-control')?.focus()
  }

  // An archived chat is not listed in the sidebar. Once opened it looks like any other chat; only
  // the breadcrumb marks it as archived.
  const tail = useMemo<CrumbSeg[]>(
    () => (title === null ? [] : [{ text: archived ? m.chat.archivedSuffix(plainTitle(title)) : plainTitle(title) }]),
    [title, archived, m])
  useCrumbTail(tail)

  return (
    <PageShell className="chatcol">
      <PageHeader>
        <PageTitle label={title === null ? undefined : plainTitle(title)}>
          {title === null ? m.chat.newChat : <PaperText text={title} />}
        </PageTitle>
      </PageHeader>

      <PageBody ref={followRef}>
        <div className="stream">
          <PageError error={error} />

          <div className="msgs">
            {messages === null
              ? (id !== null && error === null ? <div className="mwrap"><LoadingPlaceholder shape="lines" /></div> : null)
              : messages.length === 0
                ? <div className="mwrap"><EmptyState variant="page">{m.chat.empty}</EmptyState></div>
                : messages.map((msg) => (
                  <ChatMessageView key={msg.id} message={msg} onAct={() => act(msg)} />
                ))}
            {id === null || ideaDraft === undefined
              ? null
              : (
                <div className="mwrap" ref={ideaAt}>
                  <IdeaDraft
                    source={title === null ? m.chat.currentChat : plainTitle(title)} draft={ideaDraft}
                    onChange={(next) => ideaDrafts.set(id, next)} onCancel={() => ideaDrafts.drop(id)}
                    onSave={(ideaTitle, body) => write(ideaApi.create(id, ideaTitle, body), {
                      note: m.chat.ideaSavedNote,
                      action: (idea) => ({ label: m.common.open, onAction: () => open('ideas', idea.id) }),
                    }).then((saved) => { if (saved) ideaDrafts.drop(id) })}
                  />
                </div>
              )}
          </div>
        </div>
      </PageBody>

      <PageFooter bare>
        <div className="composer">
          <div className="mwrap">
            <Toolbar>
              <div className="qacts">
                <span id="qmChips">
                  {[
                    ...mentions.filter((mention) => mention.kind === 'project').slice(0, QUICK_MENTIONS),
                    ...mentions.filter((mention) => mention.kind === 'paper').slice(0, QUICK_MENTIONS),
                  ].map((mention) => (
                    <Tooltip key={mention.title} label={mention.title} whenClipped side="top">
                      <ToolbarButton className="btn ghost sm qm" onClick={() => quick(mention.title)}>
                        <FadeText>@{mention.kind === 'paper' ? <PaperText text={mention.entity.title} /> : mention.title}</FadeText>
                      </ToolbarButton>
                    </Tooltip>
                  ))}
                </span>
                {hasDiscussion ? null : <Tag>{m.chat.noDiscussion}</Tag>}
                <ToolbarButton
                  className="btn ghost sm save-idea" id="qaIdea" disabled={id === null || !hasDiscussion}
                  onClick={startIdea}
                >{m.chat.saveIdeaLabel}</ToolbarButton>
              </div>
            </Toolbar>

            <PickerPopover
              open={suggest.length > 0} onOpenChange={(open) => { if (!open) setMentioning(false) }}
              contentClassName="pickhits cres" contentId="cRes" side="top" align="center" sideOffset={6}
              anchor={(
                <div className="cbox" id="cbox">
                  <FormTextarea
                    appearance="plain" id="composer" ref={composer} value={draft} rows={1} autoComplete="off"
                    placeholder={m.chat.composerPlaceholder} disabled={sending || id === null}
                    onChange={(e) => type(e.target.value)}
                    onKeyDown={(e) => {
                      // Only open candidates take the arrow keys; otherwise they move the caret between lines.
                      if (suggest.length > 0) {
                        if (composing(e.nativeEvent)) return
                        keys.onKeyDown(e)
                        if (e.key === 'Enter') e.preventDefault()
                      } else if (sendsMessage(e.nativeEvent)) {
                        e.preventDefault()
                        submit()
                      }
                    }}
                  />
                  {id !== null && noModel(id) ? <NoModelTag label={m.chat.noModel} /> : null}
                  <GenerationControl
                    className="send" id="sendBtn" running={sending} disabled={id === null || draft.trim() === ''}
                    onStart={submit} onStop={stopSending}
                  />
                </div>
              )}
              content={(
                <>
                  <div className="rh">{m.chat.mentionPickerHeading}</div>
                  {suggest.map((hit, at) => (
                    <Fragment key={`${hit.kind}${hit.title}`}>
                      {suggest[at - 1]?.kind === hit.kind
                        ? null
                        : <div className="rg">{m.chat.mentionGroup[hit.kind]}</div>}
                      <PickOption keys={keys} index={at} className="two-line" onClick={() => pick(hit.title)}>
                        <div className="rt">@{hit.kind === 'paper' ? <PaperText text={hit.entity.title} /> : hit.title}</div>
                        <div className="rm">{hit.meta}</div>
                      </PickOption>
                    </Fragment>
                  ))}
                </>
              )}
            />
          </div>
        </div>
      </PageFooter>

    </PageShell>
  )
}
