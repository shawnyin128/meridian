import { createContext, useCallback, useContext, useMemo } from 'react'
import type { JobsStatus } from '../../shared/contract.js'
import { chat } from '../ipc.js'

/** Replies being generated, per chat, as Core reports them; see `useCoreGenerations`. */
export type Generations = {
  /** Whether Core last reported a reply being generated in `chat`. */
  running: (chat: string) => boolean
  /** Takes `work`, a send already made to Core, and asks Core for a new report now and once `work` settles. */
  run: (work: Promise<unknown>) => Promise<void>
  /** Asks Core to stop the reply being generated in `chat`, then for a new report. */
  stop: (chat: string) => void
}

export const GenerationsContext = createContext<Generations | null>(null)

/**
 * The replies Core is generating, from `status`, the shell's latest jobs status; `refresh` asks Core
 * for a new one. A chat counts as generating on every screen that shows it, whichever screen sent its
 * message, and stopping it on any screen stops it on all. `run` and `stop` keep their identity across
 * renders.
 */
export function useCoreGenerations(status: JobsStatus | null, refresh: () => void): Generations {
  // Core answers calls in the order they are made, so a report asked for after a send or a cancel
  // already reflects it.
  const run = useCallback(async (work: Promise<unknown>) => {
    refresh()
    try {
      await work
    } finally {
      refresh()
    }
  }, [refresh])
  const stop = useCallback((id: string) => {
    void chat.cancel(id)
    refresh()
  }, [refresh])
  const generating = status?.generating
  return useMemo(() => ({ running: (id) => generating?.includes(id) ?? false, run, stop }), [generating, run, stop])
}

/** Returns the shell's generations. */
export function useGenerations(): Generations {
  const generations = useContext(GenerationsContext)
  if (!generations) throw new Error('useGenerations needs AppShell')
  return generations
}
