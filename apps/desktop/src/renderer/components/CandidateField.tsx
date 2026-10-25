import type { ReactElement, ReactNode, RefObject } from 'react'
import type { CandidateKeys } from '../hooks/useCandidateKeys.js'
import { IconCheck, IconPlus } from './icons.js'
import { PickerPopover, PickOption } from './PickerPopover.js'
import { Tag } from './Tag.js'
import './CandidateField.css'

/** One candidate a CandidateField offers. */
export type Candidate = {
  /** The candidate's key among the list's. */
  id: string
  label: ReactNode
  /** Grey text at the end of the row, such as why the candidate is suggested. */
  meta?: string | undefined
  /** Whether the value the field edits holds the candidate, shown as a check before it; leave it out where nothing is held. */
  checked?: boolean | undefined
}

/**
 * The one field with candidates: `field`, the input whose ref is `anchorRef`, and below it the list of
 * `candidates`, under `heading` when given. `keys` and the pointer move the lit row, and a click picks
 * a candidate through `onPick`. With `create`, the last row adds `create.text` as a new value through
 * `create.onCreate`, drawn as the ＋ and the chip it becomes, and named `create.label` when given.
 * With nothing to offer, `empty` shows in the list's place, or no list shows. The list scrolls past
 * its height and keeps every candidate; a click in it stays with the field.
 */
export function CandidateField({ field, anchorRef, keys, heading, candidates, onPick, create, empty }: {
  field: ReactElement
  anchorRef: RefObject<HTMLElement | null>
  keys: Pick<CandidateKeys, 'active' | 'pointAt'>
  heading?: string | undefined
  candidates: readonly Candidate[]
  onPick: (candidate: Candidate, index: number) => void
  create?: { text: string; label?: string | undefined; onCreate: () => void } | undefined
  empty?: string | undefined
}) {
  const content: ReactNode = candidates.length > 0 || create !== undefined
    ? (
      <>
        {heading !== undefined && candidates.length > 0 ? <div className="rh">{heading}</div> : null}
        {candidates.map((candidate, i) => (
          <PickOption
            keys={keys} index={i} key={candidate.id} className={candidate.checked === undefined ? undefined : 'opt'}
            onClick={() => onPick(candidate, i)}
          >
            {candidate.checked === undefined ? null : <span className="ck">{candidate.checked ? <IconCheck /> : null}</span>}
            {candidate.label}
            {candidate.meta === undefined ? null : <span className="meta">{candidate.meta}</span>}
          </PickOption>
        ))}
        {create === undefined ? null : (
          <PickOption keys={keys} index={candidates.length} className="mk" aria-label={create.label} onClick={create.onCreate}>
            <IconPlus />
            <Tag shape="chip" className="tagchip">{create.text}</Tag>
          </PickOption>
        )}
      </>
    )
    : empty === undefined ? null : <div className="rh optnone">{empty}</div>
  return <PickerPopover open anchorRef={anchorRef} stopClickPropagation anchor={field} content={content} />
}
