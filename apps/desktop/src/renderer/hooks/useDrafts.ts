import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { composing } from '../lib/keyboard.js'

/** Unsent drafts held per target; see `useDrafts`. */
export type Drafts<D = string> = {
  /** Returns the draft of `target`, or undefined when it has none. */
  get: (target: string) => D | undefined
  /** Replaces the draft of `target`; an empty text is kept as a draft of its own. */
  set: (target: string, draft: D) => void
  /** Forgets the draft of `target`, once it has been sent, saved or discarded. */
  drop: (target: string) => void
}

/** A draft that edits stored text: what was typed, and the stored text it was typed over. */
export type EditDraft = { text: string; base: string }

/**
 * Holds one draft per target (a chat, a paper, a note) in memory for as long as the calling
 * component stays mounted. Text typed for one target is never read under another, and a target's
 * draft is still there after the caller switches away and back.
 */
export function useDrafts<D = string>(): Drafts<D> {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, D>>(new Map())
  return {
    get: (target) => drafts.get(target),
    set: (target, draft) => setDrafts((held) => new Map(held).set(target, draft)),
    drop: (target) => setDrafts((held) => {
      const next = new Map(held)
      next.delete(target)
      return next
    }),
  }
}

/**
 * The field that edits `stored`, with its draft kept in `drafts` under `target`. `text` is the
 * draft, or `stored` when there is none; typing keeps the stored text the draft started from, and
 * Esc drops the draft so the stored text shows again, except while an input method is composing. `stale` is true when the stored text has
 * changed since the draft started: the field is then marked as a refused save (`aria-invalid`), and
 * the caller must not save it. `drop` forgets the draft once it has been saved. Spread `fieldProps`
 * onto the field.
 */
export function editField(drafts: Drafts<EditDraft>, target: string, stored: string): {
  text: string
  stale: boolean
  drop: () => void
  fieldProps: {
    value: string
    'aria-invalid': true | undefined
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  }
} {
  const draft = drafts.get(target)
  const text = draft?.text ?? stored
  const stale = draft !== undefined && draft.base !== stored
  return {
    text,
    stale,
    drop: () => drafts.drop(target),
    fieldProps: {
      value: text,
      'aria-invalid': stale || undefined,
      onChange: (event) => drafts.set(target, { text: event.target.value, base: draft?.base ?? stored }),
      onKeyDown: (event) => {
        if (event.key !== 'Escape' || draft === undefined || composing(event.nativeEvent)) return
        event.stopPropagation()
        drafts.drop(target)
      },
    },
  }
}
