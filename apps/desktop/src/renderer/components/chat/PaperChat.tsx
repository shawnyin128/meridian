import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatRun, ChatSession, PaperRow } from '../../../shared/contract.js'
import { chat, feed, idea as ideaApi } from '../../ipc.js'
import { errorLabel } from '../../lib/failure-label.js'
import {
  useJump, useNotice, usePaperChatCollapsed, usePaperChatGrip, useVaultRevision,
} from '../../shell/AppShell.js'
import { GripTooltip } from '../../shell/GripTooltip.js'
import { ChatMessageView } from './ChatMessage.js'
import { ChatComposer, draftText, type ChatComposerHandle } from './ChatComposer.js'
import { BackButton } from '../BackButton.js'
import { Grip } from '../Grip.js'
import { EmptyState } from '../EmptyState.js'
import { FadeText } from '../FadeText.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { PageError } from '../PageShell.js'
import { useDrafts } from '../../hooks/useDrafts.js'
import { useGenerations } from '../../hooks/useGenerations.js'
import { useFollowEnd } from '../../hooks/useFollowEnd.js'
import { useNoModelChats } from '../../hooks/useNoModelChats.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { useScrollFade } from '../../hooks/useScrollFade.js'
import { namedRuns, TitleNote } from '../TitleNote.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { useMessages } from '../../messages/useMessages.js'
import { IdeaDraft, type IdeaDraftText } from '../ideas/IdeaDraft.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
import { Button } from '../Button.js'
import './Chat.css'

/**
 * The reader's paper chat. Core keeps one session per paper id, so leaving the reader and coming
 * back, or opening it from the global chat list, shows the same history. It never touches the vault
 * directly, and the discussion does not pose as Wiki content.
 */
export type PaperChatPrompt = { seq: number; quote: string }

export function PaperChat({ paper, onBack = () => {}, prompt = null }: {
  paper: PaperRow | null
  onBack?: () => void
  prompt?: PaperChatPrompt | null
}) {
  const m = useMessages()
  const { revision, bump } = useVaultRevision()
  const notice = useNotice()
  const { open } = useJump()
  const write = useVaultWrite()
  const grip = usePaperChatGrip()
  const collapsed = usePaperChatCollapsed()
  const [session, setSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  // The question being typed and an idea being drafted belong to their paper.
  const drafts = useDrafts<ChatRun[]>(['paper', paper?.id ?? ''])
  const ideaDrafts = useDrafts<IdeaDraftText>(['paper', paper?.id ?? ''])
  const ideaAt = useRef<HTMLDivElement>(null)
  const { running, run, stop } = useGenerations()
  const { noModel, track } = useNoModelChats()
  const { error, load } = useScreenLoad()
  const streamFade = useScrollFade('y')
  const { ref: followRef, follow } = useFollowEnd<HTMLDivElement>()
  const stream = useCallback((area: HTMLDivElement | null) => {
    streamFade(area)
    followRef(area)
  }, [streamFade, followRef])
  const composer = useRef<ChatComposerHandle>(null)
  const paperId = paper?.id ?? null
  const sessionId = session?.id ?? null
  const draft = paperId === null ? [] : drafts.get('chat-message') ?? []
  const ideaDraft = paperId === null ? undefined : ideaDrafts.get('chat-idea')
  const sending = sessionId !== null && running(sessionId)

  useEffect(() => {
    setSession(null)
    setMessages(null)
    follow()
  }, [paperId, follow])

  // The paper's chat is looked up again after every vault write, before its messages are read:
  // deleting that chat or restoring it from the trash changes which chat the paper has.
  const shownSession = useRef<string | null>(null)
  useEffect(() => {
    if (paperId === null) return
    const read = chat.forPaper(paperId).then(async (value) => ({ value, held: await chat.messages(value.id) }))
    return load('chat', read, ({ value, held }) => {
      setSession(value)
      setMessages(held)
      if (shownSession.current === value.id) return
      shownSession.current = value.id
      // Opening it the first time may create a session, so refresh the shell's chat list; Core hides
      // empty paper sessions for now.
      bump()
    })
  }, [paperId, revision, bump, load])

  useEffect(() => {
    if (prompt === null || paperId === null) return
    drafts.set('chat-message', [{ kind: 'text', text: m.chat.quotePrefix(prompt.quote) }])
    requestAnimationFrame(() => composer.current?.focus())
  }, [prompt, m])

  const submit = () => {
    if (draftText(draft).trim() === '' || paperId === null || session === null || sending) return
    drafts.drop('chat-message')
    follow()
    void run(write(track(session.id, chat.send(session.id, draft))))
  }

  const stopSending = () => {
    if (session !== null) stop(session.id)
  }

  const act = (message: ChatMessage) => {
    if (session === null) return
    void chat.recordAction(session.id, message.id).then(async (held) => {
      notice.success(<TitleNote message={m.chat.recordedNote} title={held.name} />)
      await feed.append({
        source: 'me', body: { kind: 'runs', runs: namedRuns(m.chat.recordedNote, held.name, { kind: 'project', id: held.id }) },
      })
      bump()
    }).catch((cause: unknown) => notice.refusal(errorLabel(m, cause)))
  }

  const hasDiscussion = (messages ?? []).some((message) => message.role === 'you')

  const startIdea = () => {
    if (paperId === null) return
    if (ideaDraft === undefined) ideaDrafts.set('chat-idea', { title: '', body: '' })
    else ideaAt.current?.querySelector<HTMLElement>('.form-control')?.focus()
  }

  return (
    <aside className="paper-chat stream" aria-label={m.chat.paperChatLabel} inert={collapsed}>
      <header className="paper-chat-head">
        <BackButton onClick={onBack} />
        <FadeText
          className="paper-chat-title"
          label={paper === null ? m.common.loading : plainTitle(paper.title)}
        >
          {paper === null ? m.common.loading : <PaperText text={paper.title} />}
        </FadeText>
      </header>
      <PageError error={error} />
      <div className="msgs" ref={stream}>
        {messages === null
          ? (error === null ? <div className="mwrap"><LoadingPlaceholder shape="lines" /></div> : null)
          : messages.length === 0 && error === null
          ? <div className="mwrap"><EmptyState variant="page">{m.chat.empty}</EmptyState></div>
          : messages.map((message) => (
            <ChatMessageView key={message.id} message={message} onAct={() => act(message)} />
          ))}
        {session === null || paper === null || ideaDraft === undefined
          ? null
          : (
            <div className="mwrap" ref={ideaAt}>
              <IdeaDraft
                source={`${plainTitle(paper.title)} · ${plainTitle(session.title)}`} draft={ideaDraft}
                onChange={(next) => ideaDrafts.set('chat-idea', next)} onCancel={() => ideaDrafts.drop('chat-idea')}
                onSave={(title, body) => write(ideaApi.create(session.id, title, body), {
                  note: m.chat.ideaSavedNote,
                  action: (idea) => ({ label: m.common.open, onAction: () => open('ideas', idea.id) }),
                }).then((saved) => { if (saved) ideaDrafts.drop('chat-idea') })}
              />
            </div>
          )}
      </div>
      <div className="composer paper-chat-composer">
        <div className="mwrap">
          <div className="qacts">
            <Button
              size="compact" variant="ghost" className="save-idea" disabled={session === null || !hasDiscussion}
              onClick={startIdea}
            >{m.chat.saveIdeaLabel}</Button>
          </div>
          <ChatComposer
            key={paperId} ref={composer} label={m.chat.askAboutPaper} placeholder={m.chat.composerPlaceholder}
            draft={draft} onDraft={(next) => { if (paperId !== null) drafts.set('chat-message', next) }} unavailable={session === null}
            running={sending} noModel={sessionId !== null && noModel(sessionId)} onSend={submit} onStop={stopSending}
          />
        </div>
      </div>
      <GripTooltip label={m.chat.collapsePaperChat}><Grip {...grip} /></GripTooltip>
    </aside>
  )
}
