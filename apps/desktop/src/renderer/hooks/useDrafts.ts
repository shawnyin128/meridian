import { useState } from 'react'

/** Unsent text held per target; see `useDrafts`. */
export type Drafts = {
  /** Returns the text typed for `target`, or undefined when it has no draft. */
  get: (target: string) => string | undefined
  /** Replaces the draft of `target`; an empty text is kept as a draft of its own. */
  set: (target: string, text: string) => void
  /** Forgets the draft of `target`, once it has been sent or saved. */
  drop: (target: string) => void
}

/**
 * Holds one draft per target (a chat, a paper, a note) in memory for as long as the calling
 * component stays mounted. Text typed for one target is never read under another, and a target's
 * draft is still there after the caller switches away and back.
 */
export function useDrafts(): Drafts {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  return {
    get: (target) => drafts.get(target),
    set: (target, text) => setDrafts((held) => new Map(held).set(target, text)),
    drop: (target) => setDrafts((held) => {
      const next = new Map(held)
      next.delete(target)
      return next
    }),
  }
}
