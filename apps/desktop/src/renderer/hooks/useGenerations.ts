import { useCallback, useState } from 'react'

/** Replies being generated, held per chat; see `useGenerations`. */
export type Generations = {
  /** Whether a reply in `chat` is still being generated: started, and neither settled nor stopped. */
  running: (chat: string) => boolean
  /** Marks `chat` as generating until `work` settles, unless `chat` is stopped or started again first. */
  run: (chat: string, work: Promise<unknown>) => Promise<void>
  /** Marks `chat` as no longer generating; the stopped work settling later changes nothing. */
  stop: (chat: string) => void
}

/**
 * Holds which chats are generating a reply, for as long as the calling component stays mounted. A
 * chat's generation never marks another chat as generating, so every other chat stays usable while
 * one generates. `run` and `stop` keep their identity across renders.
 */
export function useGenerations(): Generations {
  // Each chat maps to the token of its latest run, so only that run's settling ends it.
  const [runs, setRuns] = useState<ReadonlyMap<string, object>>(new Map())
  const end = useCallback((chat: string, token?: object) => setRuns((held) => {
    if (!held.has(chat) || (token !== undefined && held.get(chat) !== token)) return held
    const next = new Map(held)
    next.delete(chat)
    return next
  }), [])
  const run = useCallback(async (chat: string, work: Promise<unknown>) => {
    const token = {}
    setRuns((held) => new Map(held).set(chat, token))
    try {
      await work
    } finally {
      end(chat, token)
    }
  }, [end])
  const stop = useCallback((chat: string) => end(chat), [end])
  return { running: (chat) => runs.has(chat), run, stop }
}
