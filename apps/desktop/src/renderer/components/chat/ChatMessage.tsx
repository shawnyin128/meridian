import { Fragment } from 'react'
import type {
  ChatAction, ChatMessage, ChatMessageFields, ChatRun,
} from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { useJump } from '../../shell/AppShell.js'
import { ENTITY_SCREEN, EntityLink, opensHere } from '../EntityLink.js'
import { Icon } from '../icons.js'
import { AgentLabel } from '../SourceLabel.js'
import { Tag } from '../Tag.js'
import { Button } from '../Button.js'

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
 * One message: what you said sits on the right as a bubble, an answer is unboxed text under the agent
 * label, and a status line is an inline note led by an icon that never poses as a model answer. With
 * `onRetry`, given to the status line of a turn that got no answer, the line ends with Retry.
 */
export function ChatMessageView({ message, onAct, onRetry }: {
  message: ChatMessage
  onAct: (action: ChatAction) => void
  onRetry?: (() => void) | undefined
}) {
  const m = useMessages()
  if (message.role === 'status') {
    return (
      <div className="mwrap">
        <div className="msg">
          <div className="event">
            <span className="event-icon" aria-hidden="true">
              <Icon><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></Icon>
            </span>
            <span><Runs runs={message.runs} /></span>
            {onRetry === undefined ? null : <Button size="compact" variant="ghost" onClick={onRetry}>{m.common.retry}</Button>}
          </div>
        </div>
      </div>
    )
  }
  const answer = message.role === 'ai'
  return (
    <div className="mwrap">
      <div className={answer ? 'msg ai' : 'msg you'}>
        {answer ? <AgentLabel className="msg-who" /> : null}
        <div className={answer ? 'answer' : 'bubble'}>
          <Runs runs={message.runs} />
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
