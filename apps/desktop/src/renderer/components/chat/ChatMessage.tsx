import { Fragment } from 'react'
import type {
  ChatAction, ChatMessage, ChatMessageFields, ChatRun, HarnessFailureDetail,
} from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { useJump } from '../../shell/AppShell.js'
import { ElapsedTime } from '../ElapsedTime.js'
import { FailureDisclosure } from '../FailureDisclosure.js'
import { ENTITY_SCREEN, EntityLink, opensHere } from '../EntityLink.js'
import { Icon, RunningRing } from '../icons.js'
import { InlineMessage } from '../InlineMessage.js'
import { AgentLabel, ModelLabel } from '../SourceLabel.js'
import { Tag } from '../Tag.js'
import { Button } from '../Button.js'
import { DesignCard } from './DesignCard.js'
import { IdeaCard } from './IdeaCard.js'
import { failedReason, statusLine } from './status-lines.js'

export const plain = (text: string): { kind: 'text'; text: string } => ({ kind: 'text', text })
export const said = (runs: ChatRun[]): ChatMessageFields => ({ role: 'you', runs, actions: [] })
export const answer = (runs: ChatRun[], actions: ChatAction[] = []): ChatMessageFields =>
  ({ role: 'ai', runs, actions })

/**
 * A mention that names an entity in the vault: the chip the composer shows it as, its name a link
 * that opens the entity. One that names nothing that opens is its text.
 */
function Mention({ run }: { run: ChatRun }) {
  const { open } = useJump()
  const target = run.target !== undefined && opensHere(run.target.kind) ? { kind: run.target.kind, id: run.target.id } : undefined
  if (target === undefined) return <>{run.text}</>
  const screen = ENTITY_SCREEN[target.kind]
  return (
    <Tag shape="chip">
      <EntityLink kind={target.kind} label={run.text} href={`#${screen}:${target.id}`} onOpen={() => open(screen, target.id)} />
    </Tag>
  )
}

/** Whether the turn `messages` end with got no answer: the chat ends with its status line, which Retry follows. */
export const endsUnanswered = (messages: readonly ChatMessage[] | null): boolean => messages?.at(-1)?.role === 'status'

/**
 * The messages a chat shows of `messages`: all of them, but without the status line they end with
 * while a turn runs, `running`, which takes its place.
 */
export const shownMessages = (messages: readonly ChatMessage[], running: boolean): readonly ChatMessage[] =>
  (running && endsUnanswered(messages) ? messages.slice(0, -1) : messages)

/** The text of a message; each run renders by its own kind. */
function Runs({ runs }: { runs: ChatRun[] }) {
  return (
    <>
      {runs.map((run, at) => (run.kind === 'mention'
        ? <Mention run={run} key={at} />
        : <Fragment key={at}>{run.text}</Fragment>))}
    </>
  )
}

/**
 * One message: what you said sits on the right as a bubble, an answer is unboxed text under the label
 * of the model that wrote it, or of an agent for an answer kept without one, and a status line is an
 * inline note led by an icon that never poses as a model answer. The status line of a failed turn says
 * only that it failed and unfolds into its reason and, with `failure`, where it failed, its kind and
 * detail. With `onRetry`, given to the status line of a turn that got no answer, the line ends with
 * Retry. With `writingSince`, when its turn
 * began, the answer is being written, and until it has text it says the model is thinking and for
 * how long so far, beside the running ring. An answer that carries an experiment design shows it
 * under its text, with what saving it as an idea of chat `chat` writes, and one that carries an
 * idea draft shows what saving the draft writes.
 */
export function ChatMessageView({ chat = null, message, onAct, onRetry, failure, writingSince }: {
  chat?: string | null
  message: ChatMessage
  onAct: (action: ChatAction) => void
  onRetry?: (() => void) | undefined
  failure?: HarnessFailureDetail | null | undefined
  writingSince?: string | undefined
}) {
  const m = useMessages()
  if (message.role === 'status') {
    const stored = message.runs.map((run) => run.text).join('')
    const reason = failedReason(stored, m)
    const retry = onRetry === undefined ? undefined : <Button size="compact" variant="ghost" onClick={onRetry}>{m.common.retry}</Button>
    if (reason !== null) {
      return (
        <div className="mwrap">
          <div className="msg">
            <FailureDisclosure
              summary={m.chat.failure.summary} action={retry}
              rows={[
                { label: reason },
                ...(failure === null || failure === undefined ? [] : [{
                  label: m.chat.failure.steps[failure.step],
                  code: failure.detail === failure.kind ? failure.kind : `${failure.kind} · ${failure.detail}`,
                }]),
              ]}
            />
          </div>
        </div>
      )
    }
    const shown = statusLine(stored, m)
    return (
      <div className="mwrap">
        <div className="msg">
          <div className="event">
            <span className="event-icon" aria-hidden="true">
              <Icon><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></Icon>
            </span>
            <span>{shown === stored ? <Runs runs={message.runs} /> : shown}</span>
            {retry}
          </div>
        </div>
      </div>
    )
  }
  const answer = message.role === 'ai'
  return (
    <div className="mwrap">
      <div className={answer ? 'msg ai' : 'msg you'}>
        {!answer ? null : message.model === undefined
          ? <AgentLabel className="msg-who" />
          : <ModelLabel model={message.model} className="msg-who" />}
        <div className={answer ? 'answer' : 'bubble'}>
          {writingSince !== undefined && message.runs.every((run) => run.text === '')
            ? (
              <InlineMessage tone="info" variant="line" lead={<RunningRing />} aria-busy>
                {m.chat.thinking} <ElapsedTime since={writingSince} />
              </InlineMessage>
            )
            : <Runs runs={message.runs} />}
          {chat === null || message.design === undefined ? null : <DesignCard chat={chat} messageId={message.id} design={message.design} />}
          {chat === null || message.idea === undefined ? null : <IdeaCard chat={chat} messageId={message.id} idea={message.idea} />}
          {message.actions.length > 0
            ? (
              <div className="macts">
                {message.actions.map((action) => (
                  <Button size="compact" key={action.kind} disabled={action.done === true} onClick={() => onAct(action)}>
                    {action.done === true ? m.chat.actionDone : action.label}
                  </Button>
                ))}
              </div>
            )
            : null}
        </div>
      </div>
    </div>
  )
}
