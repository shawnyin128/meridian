import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatSession, PaperRow } from '../../../shared/contract.js'
import { chat, feed, idea as ideaApi } from '../../ipc.js'
import { useBanner, useToast, useVaultRevision } from '../../shell/AppShell.js'
import { ChatMessageView, plain } from './ChatMessage.js'
import { BackButton } from '../BackButton.js'
import { paperShortTitle } from '../../lib/paper-title.js'
import { FormInput } from '../FormControls.js'
import { EmptyState } from '../EmptyState.js'
import { PageError } from '../PageShell.js'
import { useVaultWrite } from '../../hooks/useVaultWrite.js'
import { useMessages } from '../../messages/useMessages.js'
import { IdeaEditorDialog } from '../ideas/IdeaEditorDialog.js'
import { GenerationControl } from '../GenerationControl.js'
import './Chat.css'

/**
 * Reader's essay context session. It gets the only session in Core by paper id, so leave the reader and come back,
 * Or open it from the global conversation list, and you will see the same history; there is no direct access to the vault, nor does the discussion pretend to be a wiki.
 */
export type PaperChatPrompt = { seq: number; quote: string }

export function PaperChat({ paper, onBack = () => {}, prompt = null }: {
  paper: PaperRow | null
  onBack?: () => void
  prompt?: PaperChatPrompt | null
}) {
  const m = useMessages()
  const { revision, bump } = useVaultRevision()
  const banner = useBanner()
  const toast = useToast()
  const write = useVaultWrite()
  const [session, setSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [savingIdea, setSavingIdea] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stream = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLInputElement>(null)
  const sendAttempt = useRef(0)
  const reportError = useCallback((cause: Error) => setError(cause.message), [])
  const paperId = paper?.id ?? null
  const sessionId = session?.id ?? null

  useEffect(() => {
    setSession(null)
    setMessages([])
    setDraft('')
    setSavingIdea(false)
    setError(null)
    if (paperId === null) return
    let live = true
    void chat.forPaper(paperId).then((value) => {
      if (!live) return
      setSession(value)
      // A new session may be created when entering for the first time; refresh the shell list. Empty paper sessions are temporarily hidden by Core.
      bump()
    }).catch(reportError)
    return () => { live = false }
  }, [paperId, bump, reportError])

  useEffect(() => {
    if (sessionId === null) return
    let live = true
    void chat.messages(sessionId).then((value) => { if (live) setMessages(value) }).catch(reportError)
    return () => { live = false }
  }, [sessionId, revision, reportError])

  useEffect(() => {
    stream.current?.scrollTo?.({ top: stream.current.scrollHeight })
  }, [messages])

  useEffect(() => {
    if (prompt === null) return
    setDraft(m.chat.quotePrefix(prompt.quote))
    requestAnimationFrame(() => composer.current?.focus())
  }, [prompt, m])

  const submit = () => {
    const text = draft.trim()
    if (text === '' || session === null || sending) return
    const attempt = ++sendAttempt.current
    setDraft('')
    setSending(true)
    void write(chat.send(session.id, text))
      .finally(() => { if (sendAttempt.current === attempt) setSending(false) })
  }

  const stopSending = () => {
    sendAttempt.current += 1
    setSending(false)
    if (session !== null) void chat.cancel(session.id)
  }

  const act = (message: ChatMessage) => {
    if (session === null) return
    void chat.recordAction(session.id, message.id).then(async (held) => {
      banner(m.chat.recordedNote(held.name))
      await feed.append({ source: 'me', body: { kind: 'runs', runs: [
        plain(m.chat.recordedTo(held.name)),
      ] } })
      bump()
    }).catch((cause: Error) => toast(cause.message))
  }

  const hasDiscussion = messages.some((message) => message.role === 'you')

  return (
    <aside className="paper-chat stream" aria-label={m.chat.paperChatLabel}>
      <header className="paper-chat-head">
        <BackButton onClick={onBack} />
        <strong>{paper === null ? m.common.loading : m.chat.paperHeader(paperShortTitle(paper))}</strong>
      </header>
      <PageError error={error} />
      <div className="msgs" ref={stream}>
        {messages.length === 0 && error === null
          ? <EmptyState variant="page">{m.chat.paperEmpty}</EmptyState>
          : messages.map((message) => (
            <ChatMessageView key={message.id} message={message} onAct={() => act(message)} />
          ))}
      </div>
      <div className="composer paper-chat-composer">
        <div className="mwrap">
          <div className="qacts">
            <button
              className="qa" disabled={session === null || !hasDiscussion}
              title={hasDiscussion ? m.chat.saveIdea : m.chat.saveIdeaDisabled}
              onClick={() => setSavingIdea(true)}
            >{m.chat.saveIdeaLabel}</button>
          </div>
          <div className="cbox">
            <FormInput
              ref={composer} value={draft} autoComplete="off" disabled={session === null || sending}
              aria-label={m.chat.askAboutPaper} placeholder={m.chat.paperComposerPlaceholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
            />
            <GenerationControl
              className="send" running={sending} disabled={session === null}
              onStart={submit} onStop={stopSending}
            />
          </div>
        </div>
      </div>
      {session === null || paper === null ? null : (
        <IdeaEditorDialog
          open={savingIdea} sourceLabel={`${paper.title} · ${session.title}`}
          onOpenChange={setSavingIdea}
          onSubmit={(title, body) => write(
            ideaApi.create(session.id, title, body), { note: m.chat.ideaSavedNote },
          )}
        />
      )}
    </aside>
  )
}
