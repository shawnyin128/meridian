import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChatMessage, ChatRun, PaperRow, ProjectSummary, WikiAggregationCard,
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
import {
  ChatComposer, draftText, type ChatComposerHandle, type MentionCandidate,
} from '../components/chat/ChatComposer.js'
import { FOCUS_KEY } from '../../shared/project-signals.js'
import { EmptyState } from '../components/EmptyState.js'
import { CHAT_BUBBLE_PATH, Icon } from '../components/icons.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import {
  PageBody, PageError, PageFooter, PageHeader, PageShell, PageTitle,
} from '../components/PageShell.js'
import { useDrafts } from '../hooks/useDrafts.js'
import { useFollowEnd } from '../hooks/useFollowEnd.js'
import { useGenerations } from '../hooks/useGenerations.js'
import { useNoModelChats } from '../hooks/useNoModelChats.js'
import { useJumpOrigin } from '../hooks/useJumpOrigin.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { CONFLICT_THREAD } from '../lib/chat.js'
import { IdeaDraft, type IdeaDraftText } from '../components/ideas/IdeaDraft.js'
import { BackButton } from '../components/BackButton.js'
import { FadeText } from '../components/FadeText.js'
import { Toolbar } from '../components/Toolbar.js'
import { namedRuns } from '../components/TitleNote.js'
import { Tooltip } from '../components/Tooltip.js'
import { readStateName } from '../components/PaperMetadata.js'
import { PaperText } from '../components/paper/PaperText.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { Button } from '../components/Button.js'
import './shell.css'
import '../components/chat/Chat.css'

/** How many recently added papers `@` offers, as in the demo's mentionEntities. */
const MENTION_PAPERS = 5
/**
 * The demo's renderQuickMentions: the quick `@` buttons above the composer take this many
 * projects and this many papers.
 */
const QUICK_MENTIONS = 2

/**
 * The entities `@` can reference, as in the demo's mentionEntities: projects first, by most recent
 * progress, then the most recently added papers, then every Wiki page.
 */
function mentionsOf(
  projects: ProjectSummary[], rows: PaperRow[], pages: WikiAggregationCard[], fmt: Format, m: Catalog,
): MentionCandidate[] {
  const advanced = (p: ProjectSummary) => {
    const last = p.recentEvents.at(-1)
    return last === undefined ? 0 : dnum(last.date)
  }
  return [
    ...[...projects].sort((a, b) => advanced(b) - advanced(a)).map((p): MentionCandidate => ({
      kind: 'project', id: p.id, title: p.name,
      meta: `${p.status} · ${m.project.identity.focusLabel[FOCUS_KEY[p.status]]}:${p.focus}`, label: p.name,
    })),
    ...rows.map((p): MentionCandidate => ({
      kind: 'paper', id: p.id,
      title: plainTitle(p.title),
      meta: p.year === undefined ? readStateName(m, p.readState) : `${p.year} · ${readStateName(m, p.readState)}`,
      label: <PaperText text={p.title} />,
    })),
    ...pages.map((p): MentionCandidate => ({
      kind: 'page', id: p.id, title: p.title, meta: `${p.kindLabel} · ${m.common.updatedOn(fmt.date(p.updated))}`, label: p.title,
    })),
  ]
}

/** Persistent conversation UI. Core owns context and writes; each explicit send runs one Harness turn. */
export function Chat() {
  const fmt = useFormat()
  const m = useMessages()
  const { id, title, archived, select } = useChatSession()
  const { jump, open } = useJump()
  const { origin, back } = useJumpOrigin()
  const { revision, bump } = useVaultRevision()
  const notice = useNotice()
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  // The message being typed and an idea being drafted belong to their chat.
  const drafts = useDrafts<ChatRun[]>(['chat', id ?? ''])
  const ideaDrafts = useDrafts<IdeaDraftText>(['chat', id ?? ''])
  const ideaAt = useRef<HTMLDivElement>(null)
  const { running, run, stop } = useGenerations()
  const { noModel, track } = useNoModelChats()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [rows, setRows] = useState<PaperRow[]>([])
  const [pages, setPages] = useState<WikiAggregationCard[]>([])
  // The page body, not the message list, scrolls the conversation.
  const { ref: followRef, follow } = useFollowEnd<HTMLDivElement>()
  const composer = useRef<ChatComposerHandle>(null)
  const consumed = useRef(0)
  const { error, load } = useScreenLoad()
  const write = useVaultWrite()
  const draft = id === null ? [] : drafts.get('message') ?? []
  const ideaDraft = id === null ? undefined : ideaDrafts.get('idea')
  const sending = id !== null && running(id)

  useEffect(() => load('projects', project.list(), setProjects), [revision, load])
  useEffect(() => load('papers', papers.list({ page: 1, size: MENTION_PAPERS }), (r) => setRows(r.rows)), [revision, load])
  useEffect(() => load('pages', wiki.cards(), setPages), [revision, load])

  useEffect(() => {
    setMessages(null)
    follow()
  }, [id, follow])
  useEffect(() => {
    if (id === null) return
    return load('messages', chat.messages(id), setMessages)
  }, [id, revision, load])

  // Empty until the vault data arrives, after which an `@` already typed opens the picker by itself.
  const mentions = useMemo(() => mentionsOf(projects, rows, pages, fmt, m), [projects, rows, pages, fmt, m])

  const send = useCallback((session: string, runs: ChatRun[]) => {
    follow()
    return run(write(track(session, chat.send(session, runs))))
  }, [follow, run, write, track])

  const stopSending = () => {
    if (id !== null) stop(id)
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
      await send(session.id, [{ kind: 'text', text: m.chat.conflictQuestion }])
    }).catch((e: unknown) => notice.refusal(errorLabel(m, e)))
  }, [jump, select, send, notice, m])

  const submit = () => {
    if (draftText(draft).trim() === '' || id === null || sending) return
    drafts.set('message', [])
    void send(id, draft)
  }

  const act = (message: ChatMessage) => {
    if (id === null) return
    void chat.recordAction(id, message.id).then(async (p) => {
      await feed.append({
        source: 'me', body: { kind: 'runs', runs: namedRuns(m.chat.recordedNote, p.name, { kind: 'project', id: p.id }) },
      })
      bump()
    }).catch((e: unknown) => notice.refusal(errorLabel(m, e)))
  }
  const hasDiscussion = (messages ?? []).some((message) => message.role === 'you')

  const startIdea = () => {
    if (id === null) return
    if (ideaDraft === undefined) ideaDrafts.set('idea', { title: '', body: '' })
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
        {origin === null ? null : <BackButton onClick={back} />}
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
                ? <div className="mwrap"><EmptyState variant="page" icon={<Icon sw={1.4}><path d={CHAT_BUBBLE_PATH} /></Icon>} /></div>
                : messages.map((msg) => (
                  <ChatMessageView key={msg.id} message={msg} onAct={() => act(msg)} />
                ))}
            {id === null || ideaDraft === undefined
              ? null
              : (
                <div className="mwrap" ref={ideaAt}>
                  <IdeaDraft
                    source={title === null ? m.chat.currentChat : plainTitle(title)} draft={ideaDraft}
                    onChange={(next) => ideaDrafts.set('idea', next)} onCancel={() => ideaDrafts.drop('idea')}
                    onSave={(ideaTitle, body) => write(ideaApi.create(id, ideaTitle, body), {
                      note: m.chat.ideaSavedNote,
                      action: (idea) => ({ label: m.common.open, onAction: () => open('ideas', idea.id) }),
                    }).then((saved) => { if (saved) ideaDrafts.drop('idea') })}
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
                      <Button size="compact" variant="ghost" className="qm" onClick={() => composer.current?.mention(mention)}>
                        <FadeText>@{mention.label}</FadeText>
                      </Button>
                    </Tooltip>
                  ))}
                </span>
                <Button
                  size="compact" variant="ghost" className="save-idea" id="qaIdea" disabled={id === null || !hasDiscussion}
                  onClick={startIdea}
                >{m.chat.saveIdeaLabel}</Button>
              </div>
            </Toolbar>

            <ChatComposer
              key={id} ref={composer} id="composer" sendId="sendBtn" placeholder={m.chat.composerPlaceholder}
              draft={draft} onDraft={(next) => { if (id !== null) drafts.set('message', next) }} unavailable={id === null}
              running={sending} noModel={id !== null && noModel(id)} onSend={submit} onStop={stopSending}
              mentions={mentions}
            />
          </div>
        </div>
      </PageFooter>

    </PageShell>
  )
}
