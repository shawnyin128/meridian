import { useCallback, useState } from 'react'
import type { ChatSendResult } from '../../shared/contract.js'

/** The chats whose last send found no model set up; see `useNoModelChats`. */
export type NoModelChats = {
  /** Whether the last send in `chat` failed because no model is set up. */
  noModel: (chat: string) => boolean
  /** Passes `send` through, clearing `chat`'s mark as it starts and setting it if the send fails with `no-model`. */
  track: (chat: string, send: Promise<ChatSendResult>) => Promise<ChatSendResult>
}

/** Holds, per chat, whether its last send failed for want of a model, for as long as the caller stays mounted. */
export function useNoModelChats(): NoModelChats {
  const [chats, setChats] = useState<ReadonlySet<string>>(new Set())
  const mark = useCallback((chat: string, on: boolean) => setChats((held) => {
    if (held.has(chat) === on) return held
    const next = new Set(held)
    if (on) next.add(chat)
    else next.delete(chat)
    return next
  }), [])
  const track = useCallback((chat: string, send: Promise<ChatSendResult>) => {
    mark(chat, false)
    return send.then((result) => {
      mark(chat, result.state === 'failed' && result.reason === 'no-model')
      return result
    })
  }, [mark])
  return { noModel: (chat) => chats.has(chat), track }
}
