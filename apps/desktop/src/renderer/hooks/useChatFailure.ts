import { useEffect, useState } from 'react'
import type { ChatMessage, HarnessFailureDetail } from '../../shared/contract.js'
import { chat as chatApi } from '../ipc.js'

/**
 * Where chat `chat`'s last turn failed, as Core knows it, read each time `messages`, the chat's
 * messages as last read, end with a status line; null while they end otherwise or Core knows of none.
 */
export function useChatFailure(chat: string | null, messages: readonly ChatMessage[] | null): HarnessFailureDetail | null {
  const [failure, setFailure] = useState<{ chat: string; detail: HarnessFailureDetail | null } | null>(null)
  const failed = chat !== null && messages?.at(-1)?.role === 'status'
  useEffect(() => {
    if (!failed || chat === null) return
    let live = true
    void chatApi.failure(chat).then((detail) => { if (live) setFailure({ chat, detail }) })
    return () => { live = false }
  }, [chat, failed, messages])
  return failed && failure?.chat === chat ? failure.detail : null
}
