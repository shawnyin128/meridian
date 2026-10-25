import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import type { KeptText } from '../hooks/useDrafts.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { CandidateField } from './CandidateField.js'
import { FormInput, type FormControlAppearance } from './FormControls.js'
import { PaperText } from './paper/PaperText.js'

/** A candidate in the drop-down: target id, display name, gray text on the right; a `paper` name is a paper title. */
export type PickHit = { id: string; title: string; meta?: string; paper?: boolean }

/**
 * The input of a draft row, with suggested candidates on CandidateField: typing asks `suggest` for
 * candidates, the up/down keys or the pointer move the highlight, and Enter picks the highlighted one.
 * Clicking a candidate picks it; with no candidate highlighted and `allowNew` true, Enter hands the
 * typed text over as a new name. Enter does nothing while the candidates have not caught up with the input, and the input
 * is `aria-busy` meanwhile. Enter, a candidate click, Esc, a press outside the draft and focus
 * leaving it go through `useInlineDraft`, which sends no second pick until the first has landed.
 * Leaving the draft with text in it acts as Enter does; leaving it empty, with `initialText`
 * unchanged, or at all with `cancelOnLeave`, closes it.
 * `row` is the element that counts as inside the draft, mounted on it by the caller; pressing or
 * focusing one of the `triggers`, the buttons that open this draft, does not count as outside. A
 * failed `suggest` goes to `onError`. The input starts out holding `initialText`. With `kept`, what is
 * typed is kept there as a draft, which the input starts from instead; the draft closing drops it.
 */
export function PickRow({
  row, triggers, placeholder, initialText = '', suggest, allowNew, onPick, onNew, onCancel, onError,
  inputClassName = 'inedit',
  inputAppearance = 'inline',
  cancelOnLeave = false, kept,
}: {
  row: RefObject<HTMLElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  placeholder: string
  initialText?: string
  suggest: (query: string) => Promise<PickHit[]>
  allowNew: boolean
  onPick: (hit: PickHit) => boolean | Promise<boolean>
  onNew: (title: string) => boolean | Promise<boolean>
  onCancel: () => void
  onError: (e: Error) => void
  inputClassName?: string
  inputAppearance?: FormControlAppearance
  cancelOnLeave?: boolean
  kept?: KeptText | undefined
}) {
  const [text, setOwnText] = useState(kept?.drafts.get(kept.target) ?? initialText)
  const setText = (next: string) => {
    setOwnText(next)
    kept?.drafts.set(kept.target, next)
  }
  const [hits, setHits] = useState<PickHit[]>([])
  const [answered, setAnswered] = useState('')
  const seq = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  // Candidates are re-selected for each input; old results returned late are discarded.
  useEffect(() => {
    const mine = ++seq.current
    void suggest(text.trim()).then((found) => {
      if (mine !== seq.current) return
      setHits(found)
      setAnswered(text.trim())
    }).catch((e: Error) => {
      onError(e)
      if (mine !== seq.current) return
      setAnswered(text.trim())
    })
  }, [text, suggest, onError])

  const stale = answered !== text.trim()

  const pick = (): boolean | Promise<boolean> => {
    if (stale) return false
    const hit = hits[keys.active]
    if (hit !== undefined) return onPick(hit)
    if (allowNew && text.trim() !== '') return onNew(text.trim())
    return false
  }
  const draft = useInlineDraft({
    row, triggers, onSubmit: pick, onCancel, kept,
    isEmpty: () => cancelOnLeave || text.trim() === '' || text.trim() === initialText.trim(),
  })
  // A stale result set must not be selected by Enter; the input's own onSubmit (pick) re-checks
  // `stale` and takes over instead, matching the mouse-pick path's staleness rule.
  const keys = useCandidateKeys(hits.length, (i) => { if (!stale) draft.submit(() => onPick(hits[i]!)) })

  return (
    <CandidateField
      anchorRef={input} keys={keys}
      field={(
        <FormInput
          appearance={inputAppearance} className={inputClassName} ref={input} placeholder={placeholder}
          {...draft.inputProps}
          aria-busy={stale} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            keys.onKeyDown(e)
            draft.inputProps.onKeyDown(e)
          }}
        />
      )}
      candidates={hits.map((h) => ({ id: h.id, label: h.paper ? <PaperText text={h.title} /> : h.title, meta: h.meta }))}
      onPick={(_, i) => draft.submit(() => onPick(hits[i]!))}
    />
  )
}
