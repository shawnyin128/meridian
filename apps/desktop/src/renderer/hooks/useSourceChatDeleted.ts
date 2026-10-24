import { useCallback, useEffect, useState } from 'react'
import type { ResearchIdea } from '../../shared/contract.js'
import { chat } from '../ipc.js'
import { useVaultRevision } from '../shell/AppShell.js'

/**
 * Returns whether the chat `idea` came from is deleted: its source names a chat the vault's chat list
 * no longer holds. The list is read again after every vault write; until it arrives, no chat counts
 * as deleted.
 */
export function useSourceChatDeleted(): (idea: ResearchIdea) => boolean {
  const { revision } = useVaultRevision()
  const [held, setHeld] = useState<ReadonlySet<string> | null>(null)
  useEffect(() => {
    let live = true
    void chat.list().then((rows) => { if (live) setHeld(new Set(rows.map((row) => row.id))) })
    return () => { live = false }
  }, [revision])
  return useCallback((idea: ResearchIdea) => (
    held !== null && idea.source.chatId !== undefined && !held.has(idea.source.chatId)
  ), [held])
}
