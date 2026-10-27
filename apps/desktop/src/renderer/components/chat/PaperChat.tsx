import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatRun, ChatSession, ChatTurnMode, PaperRow } from '../../../shared/contract.js'
import { chat, feed } from '../../ipc.js'
import { errorLabel } from '../../lib/failure-label.js'
import {
  useNotice, usePaperChatCollapsed, usePaperChatGrip, useVaultRevision,
} from '../../shell/AppShell.js'
import { GripTooltip } from '../../shell/GripTooltip.js'
import { ChatMessageView, endsUnanswered, shownMessages } from './ChatMessage.js'
import { ChatComposer, draftText, type ChatComposerHandle } from './ChatComposer.js'
import { BackButton } from '../BackButton.js'
import { Grip } from '../Grip.js'
import { EmptyState } from '../EmptyState.js'
import { CHAT_BUBBLE_PATH, Icon } from '../icons.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { PageError, PageHeader, PageTitle } from '../PageShell.js'
import { ScrollArea } from '../ScrollArea.js'
import { useDrafts } from '../../hooks/useDrafts.js'
import { useChatTurn } from '../../hooks/useChatTurn.js'
import { useAnswerSoFar } from '../../hooks/useAnswerSoFar.js'
import { useChatFailure } from '../../hooks/useChatFailure.js'
import { useGenerations } from '../../hooks/useGenerations.js'
import { useFollowEnd } from '../../hooks/useFollowEnd.js'
import { useModelStatus } from '../../hooks/useModelStatus.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { namedRuns } from '../TitleNote.js'
import { useMessages } from '../../messages/useMessages.js'
import { PaperText } from '../paper/PaperText.js'
import { plainTitle } from '../paper/paper-text.js'
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
  const grip = usePaperChatGrip()
  const collapsed = usePaperChatCollapsed()
  const [session, setSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  // The question being typed belongs to its paper.
  const drafts = useDrafts<ChatRun[]>(['paper', paper?.id ?? ''])
  // The mode of the paper chat's next turns stays with the paper, as its draft does.
  const modes = useDrafts<ChatTurnMode>(['paper', paper?.id ?? ''])
  const { running, stop } = useGenerations()
  const { track } = useModelStatus()
  const turn = useChatTurn(track)
  const { error, load } = useScreenLoad()
  const { ref: followRef, follow } = useFollowEnd<HTMLDivElement>()
  const composer = useRef<ChatComposerHandle>(null)
  const paperId = paper?.id ?? null
  const sessionId = session?.id ?? null
  const draft = paperId === null ? [] : drafts.get('chat-message') ?? []
  const mode = paperId === null ? null : modes.get('chat-mode') ?? null
  const sending = sessionId !== null && running(sessionId)
  const writing = useAnswerSoFar(sessionId, sending, messages)
  const failure = useChatFailure(sessionId, messages)

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
    void turn.send(session.id, draft, mode)
  }

  const stopSending = () => {
    if (session !== null) stop(session.id)
  }

  const act = (message: ChatMessage) => {
    if (session === null) return
    void chat.recordAction(session.id, message.id).then(async (held) => {
      await feed.append({
        source: 'me', body: { kind: 'runs', runs: namedRuns(m.chat.recordedNote, held.name, { kind: 'project', id: held.id }) },
      })
      bump()
    }).catch((cause: unknown) => notice.refusal(errorLabel(m, cause)))
  }


  return (
    <aside className="paper-chat stream" aria-label={m.chat.paperChatLabel} inert={collapsed}>
      <PageHeader size="pane">
        <BackButton onClick={onBack} />
        {paper === null ? null : <PageTitle label={plainTitle(paper.title)}><PaperText text={paper.title} /></PageTitle>}
      </PageHeader>
      <PageError error={error} />
      <ScrollArea axis="y" fill ref={followRef}>
        <div className="msgs" role="log" aria-label={m.chat.messagesLabel}>
          {messages === null
            ? (error === null ? <div className="mwrap"><LoadingPlaceholder shape="lines" /></div> : null)
            : messages.length === 0 && error === null
            ? <div className="mwrap"><EmptyState variant="page" icon={<Icon sw={1.4}><path d={CHAT_BUBBLE_PATH} /></Icon>} /></div>
            : shownMessages(messages, sending || writing !== null).map((message, at, shown) => (
              <ChatMessageView
                key={message.id} chat={sessionId} message={message} onAct={() => act(message)}
                failure={at === shown.length - 1 ? failure : undefined}
                onRetry={session !== null && !sending && at === shown.length - 1 && endsUnanswered(shown)
                  ? () => { follow(); void turn.retry(session.id, mode) }
                  : undefined}
              />
            ))}
          {writing === null ? null : (
            <ChatMessageView key={writing.message.id} message={writing.message} onAct={() => act(writing.message)} writingSince={writing.since} />
          )}
        </div>
      </ScrollArea>
      <div className="composer paper-chat-composer">
        <div className="mwrap">
          <ChatComposer
            key={paperId} ref={composer} chat={sessionId} label={m.chat.askAboutPaper} placeholder={m.chat.composerPlaceholder}
            draft={draft} onDraft={(next) => { if (paperId !== null) drafts.set('chat-message', next) }} unavailable={session === null}
            running={sending} onSend={submit} onStop={stopSending}
            mode={{
              value: mode,
              onChange: (next) => { if (paperId !== null) { if (next === null) modes.drop('chat-mode'); else modes.set('chat-mode', next) } },
            }}
          />
        </div>
      </div>
      <GripTooltip label={m.chat.collapsePaperChat}><Grip {...grip} /></GripTooltip>
    </aside>
  )
}
