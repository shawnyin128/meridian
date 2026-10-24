import { createContext, useCallback, useContext, useMemo } from 'react'
import type { CallFailure, JobsStatus } from '../../shared/contract.js'
import { chat, harness } from '../ipc.js'

/** Replies being generated, per chat, and Wiki proposals, per paper, as Core reports them; see `useCoreGenerations`. */
export type Generations = {
  /** Whether Core last reported a reply being generated in `chat`. */
  running: (chat: string) => boolean
  /** Takes `work`, a send or a start already made to Core, and asks Core for a new report now and once `work` settles. */
  run: (work: Promise<unknown>) => Promise<void>
  /** Asks Core to stop the reply being generated in `chat`, then for a new report. */
  stop: (chat: string) => void
  /** Whether Core last reported a Wiki proposal being generated for paper `paper`. */
  wikiRunning: (paper: string) => boolean
  /**
   * Asks Core to stop the Wiki proposal being generated for paper `paper`, then for a new report.
   * Settles as Core answers the stop, rejecting when Core refuses it.
   */
  stopWiki: (paper: string) => Promise<unknown>
  /** Why Core last reported the last Wiki run of paper `paper` failed, undefined when it did not. */
  wikiFailure: (paper: string) => CallFailure | undefined
  /** Asks Core to forget why the last Wiki run of paper `paper` failed, then for a new report. */
  dismissWiki: (paper: string) => Promise<unknown>
}

export const GenerationsContext = createContext<Generations | null>(null)

/**
 * The replies and Wiki proposals Core is generating, from `status`, the shell's latest jobs status;
 * `refresh` asks Core for a new one. A chat, or a paper's Wiki proposal, counts as generating on every
 * screen that shows it, whichever screen started it, and stopping it on any screen stops it on all.
 * `run`, `stop`, `stopWiki` and `dismissWiki` keep their identity across renders.
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
  const stopWiki = useCallback((paper: string) => {
    const stopped = harness.cancel(paper)
    refresh()
    return stopped
  }, [refresh])
  const dismissWiki = useCallback(async (paper: string) => {
    await harness.dismissFailure(paper)
    refresh()
  }, [refresh])
  const generating = status?.generating
  const generatingWiki = status?.generatingWiki
  const wikiFailures = status?.wikiFailures
  return useMemo(() => ({
    running: (id) => generating?.includes(id) ?? false,
    run,
    stop,
    wikiRunning: (paper) => generatingWiki?.includes(paper) ?? false,
    stopWiki,
    wikiFailure: (paper) => wikiFailures?.[paper],
    dismissWiki,
  }), [generating, generatingWiki, wikiFailures, run, stop, stopWiki, dismissWiki])
}

/** Returns the shell's generations. */
export function useGenerations(): Generations {
  const generations = useContext(GenerationsContext)
  if (!generations) throw new Error('useGenerations needs AppShell')
  return generations
}
