import { Fragment } from 'react'
import type {
  ChatAction, ChatMessage, ChatMessageFields, ChatRun,
} from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { Icon } from '../icons.js'
import { AgentLabel } from '../SourceLabel.js'

export const plain = (text: string): { kind: 'text'; text: string } => ({ kind: 'text', text })
export const said = (runs: ChatRun[]): ChatMessageFields => ({ role: 'you', runs, actions: [] })
export const answer = (runs: ChatRun[], actions: ChatAction[] = []): ChatMessageFields =>
  ({ role: 'ai', runs, actions })

/** The text of a message; each run renders by its own kind. */
function Runs({ runs }: { runs: ChatRun[] }) {
  return (
    <>
      {runs.map((run, at) => (run.kind === 'mention'
        ? <span className="mention" key={at}>{run.text}</span>
        : <Fragment key={at}>{run.text}</Fragment>))}
    </>
  )
}

/**
 * One message: what you said sits on the right as a bubble, an answer is unboxed text under the agent
 * label, and a status line is an inline note led by an icon that never poses as a model answer.
 */
export function ChatMessageView({ message, onAct }: {
  message: ChatMessage
  onAct: (action: ChatAction) => void
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
                  <button
                    className={action.done === true ? 'btn sm' : 'btn pri sm'}
                    key={action.kind} disabled={action.done === true}
                    onClick={() => onAct(action)}
                  >
                    {action.done === true ? m.chat.actionDone : action.label}
                  </button>
                ))}
              </div>
            )
            : null}
        </div>
      </div>
    </div>
  )
}
