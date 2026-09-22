import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { PickerPopover } from './PickerPopover.js'
import { FormInput, type FormControlAppearance } from './FormControls.js'
import './PickRow.css'

/** A candidate in the drop-down: target id, display name, gray text on the right. */
export type PickHit = { id: string; title: string; meta?: string }

/** The maximum number of drop-down items is this many. */
const LIMIT = 8

/**
 * The input box in the placeholder has associated candidates: when typing, press `suggest` to select the candidate column, use the up and down keys to select, and press Enter to select the highlighted one.
 * Click on a candidate to select that one; when there is no highlighted candidate and `allowNew` is true, press Enter to hand over the input of the original text as the new name.
 * Enter does not move when the candidate has not caught up with the input. During this period, the input box is `aria-busy`. Enter, click candidate, Esc, click outside the placeholder
 * When the focus leaves the placeholder, it is controlled by `useInlineDraft`, and the second one is not sent until the selection is landed.
 * `row` is the element that is counted as "within the placeholder" and is hung on the placeholder by the caller; `triggers` can be reopened or focused
 * Clicking on the entry buttons of this placeholder does not count as clicking outside the placeholder. Handled to `onError` when candidate selection fails.
 */
export function PickRow({
  row, triggers, placeholder, suggest, allowNew, onPick, onNew, onCancel, onError,
  inputClassName = 'inedit pickin',
  inputAppearance = 'plain',
}: {
  row: RefObject<HTMLElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  placeholder: string
  suggest: (query: string) => Promise<PickHit[]>
  allowNew: boolean
  onPick: (hit: PickHit) => boolean | Promise<boolean>
  onNew: (title: string) => boolean | Promise<boolean>
  onCancel: () => void
  onError: (e: Error) => void
  inputClassName?: string
  inputAppearance?: FormControlAppearance
}) {
  const [text, setText] = useState('')
  const [hits, setHits] = useState<PickHit[]>([])
  const [answered, setAnswered] = useState('')
  const seq = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  // Candidates are re-selected for each input; old results returned late are discarded.
  useEffect(() => {
    const mine = ++seq.current
    void suggest(text.trim()).then((found) => {
      if (mine !== seq.current) return
      setHits(found.slice(0, LIMIT))
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
    const hit = hits[at]
    if (hit !== undefined) return onPick(hit)
    if (allowNew && text.trim() !== '') return onNew(text.trim())
    return false
  }
  const draft = useInlineDraft({ row, triggers, onSubmit: pick, onCancel })
  // A stale result set must not be selected by Enter; the input's own onSubmit (pick) re-checks
  // `stale` and takes over instead, matching the mouse-pick path's staleness rule.
  const keys = useCandidateKeys(hits.length, (i) => { if (!stale) draft.submit(() => onPick(hits[i]!)) })
  const at = keys.active

  return (
    <PickerPopover
      open={hits.length > 0} anchorRef={input} contentClassName="pickhits"
      anchor={(
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
      content={(
          <ul>
            {hits.map((h, i) => (
              <li
                className={i === at ? 'on' : undefined} key={h.id}
                onMouseDown={(e) => { e.preventDefault(); draft.submit(() => onPick(h)) }}
              >
                {h.title}{h.meta === undefined ? null : <span className="meta">{h.meta}</span>}
              </li>
            ))}
          </ul>
      )}
    />
  )
}
