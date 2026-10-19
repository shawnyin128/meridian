import { Fragment } from 'react'
import type {
  ChatAction, ChatMessage, ChatMessageFields, ChatRun,
} from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'

export const plain = (text: string): { kind: 'text'; text: string } => ({ kind: 'text', text })
export const said = (runs: ChatRun[]): ChatMessageFields => ({ role: 'you', runs, actions: [] })
export const answer = (runs: ChatRun[], actions: ChatAction[] = []): ChatMessageFields =>
  ({ role: 'ai', runs, actions })
/** The honest status until a model is connected; global and paper chats must state the same limits. */
export const noModel = (m: Catalog): ChatMessageFields =>
  ({ role: 'status', runs: [plain(m.chat.noModel)], actions: [] })

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
 * One message: what you said sits on the right as a bubble, the answer on the left as a card, and a
 * status line never poses as a model answer.
 */
export function ChatMessageView({ message, onAct }: {
  message: ChatMessage
  onAct: (action: ChatAction) => void
}) {
  const m = useMessages()
  if (message.role === 'status') {
    return (
      <div className="mwrap">
        <div className="msg"><div className="event"><Runs runs={message.runs} /></div></div>
      </div>
    )
  }
  return (
    <div className="mwrap">
      <div className={message.role === 'you' ? 'msg you' : 'msg ai'}>
        <div className="bubble">
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
