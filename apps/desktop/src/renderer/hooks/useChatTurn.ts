import { useCallback } from 'react'
import type { ChatRun, ChatSendResult } from '../../shared/contract.js'
import { chat } from '../ipc.js'
import { useVaultRevision } from '../shell/AppShell.js'
import { useGenerations } from './useGenerations.js'
import { useVaultWrite } from './useVaultWrite.js'

/**
 * Starts the turns of a chat the way both chat screens do. `send` asks the model about `runs` in chat
 * `session`; `retry` asks it again about the chat's last question after that turn got no answer; with
 * `design` either is a design turn, whose answer may carry an experiment design. Each
 * counts as the chat generating until it settles, passes through `track` (useModelStatus) and ends as
 * a vault write. A sent question shows at once: Core keeps it before it asks the model and answers
 * calls in the order they come, so the messages read again right after the send already hold it.
 */
export function useChatTurn(track: (turn: Promise<ChatSendResult>) => Promise<ChatSendResult>): {
  send: (session: string, runs: ChatRun[], design: boolean) => Promise<void>
  retry: (session: string, design: boolean) => Promise<void>
} {
  const { run } = useGenerations()
  const write = useVaultWrite()
  const { bump } = useVaultRevision()
  const send = useCallback((session: string, runs: ChatRun[], design: boolean) => {
    const turn = run(write(track(chat.send(session, runs, design))))
    bump()
    return turn
  }, [run, write, track, bump])
  const retry = useCallback(
    (session: string, design: boolean) => run(write(track(chat.retry(session, design)))), [run, write, track],
  )
  return { send, retry }
}
