import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { NO_TRIGGERS } from '../hooks/useOnLeave.js'
import { useDrafts, type Drafts, type KeptText } from '../hooks/useDrafts.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { AddAction } from './AddAction.js'
import { FadeText } from './FadeText.js'
import { FormInput, type FormControlAppearance } from './FormControls.js'
import { IconButton } from './IconButton.js'
import { IconCross, IconPlus } from './icons.js'
import { PickerPopover, PickOption } from './PickerPopover.js'
import { Tag, tagClass } from './Tag.js'

/** What a chip list calls its parts: the `+`, a chip's ×, and the heading over the candidates. */
export type TagChipLabels = { add: string; remove: (value: string) => string; existing: string }

type DraftProps = {
  /** Values the list holds; candidates leave them out. */
  values: string[]
  /** The candidates, asked for each time an input opens. */
  vocabulary: () => Promise<string[]>
  labels: TagChipLabels
  onError: (e: Error) => void
}

/**
 * The input of one chip draft and its candidates while `open`: the vocabulary's values the list does
 * not hold that contain the typed text, then the typed text itself when it is new. Clicking a
 * candidate hands it to `onSubmit`, and Enter, a press outside the input and its candidates, or focus
 * leaving them hands over the highlighted candidate, or the typed text when there is none. `onSubmit`
 * returns whether the write completed; the draft closes through `onClose` only then, and a rejected
 * write keeps the input and the typed text. Esc, leaving with nothing typed or with `initial`
 * unchanged, and Enter on `initial` unchanged close it without a write; while a submission is
 * pending, neither an outside press nor focus leaving closes it, and no second one is sent before the
 * first lands. All closing goes through `useInlineDraft`; Radix only positions the candidates.
 */
function useChipDraft({ open, initial, appearance, values, vocabulary, labels, input, onSubmit, onClose, onError, kept }: DraftProps & {
  open: boolean
  initial: string
  appearance: Extract<FormControlAppearance, 'inline' | 'chip'>
  input: RefObject<HTMLInputElement | null>
  onSubmit: (value: string) => Promise<boolean>
  onClose: () => void
  kept: KeptText
}) {
  const [q, setOwnQ] = useState(kept.drafts.get(kept.target) ?? initial)
  const setQ = (next: string) => {
    setOwnQ(next)
    kept.drafts.set(kept.target, next)
  }
  const [vocab, setVocab] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    void vocabulary().then(setVocab).catch(onError)
  }, [open, vocabulary, onError])

  const typed = q.trim()
  const needle = typed.toLowerCase()
  const hits = open
    ? vocab.filter((v) => !values.includes(v) && (!needle || v.toLowerCase().includes(needle)))
    : []
  const isNew = typed !== '' && !values.includes(typed) && !hits.some((v) => v.toLowerCase() === needle)

  // While closed the input is not rendered and its ref is null, so the outside and focus paths do nothing.
  const draft = useInlineDraft({
    row: input, triggers: NO_TRIGGERS, isEmpty: () => typed === '' || typed === initial, kept,
    onCancel: () => { setOwnQ(initial); onClose() },
    onSubmit: () => (typed === '' ? false : typed === initial ? true : onSubmit(hits[keys.active] ?? typed)),
  })
  // The create row, when there is one, is the last row the keys and the pointer move through.
  const keys = useCandidateKeys(hits.length + (isNew ? 1 : 0), (i) => draft.submit(() => onSubmit(hits[i] ?? typed)))

  const field = (
    <FormInput
      appearance={appearance} className="tagin" ref={input} value={q} {...draft.inputProps}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setQ(e.target.value)}
      onKeyDown={(e) => { keys.onKeyDown(e); draft.inputProps.onKeyDown(e) }}
    />
  )
  const content = hits.length > 0 || isNew
    ? (
      <>
        {hits.length > 0 ? <div className="rh">{labels.existing}</div> : null}
        {hits.map((v, i) => (
          <PickOption keys={keys} index={i} key={v} onClick={() => draft.submit(() => onSubmit(v))}>{v}</PickOption>
        ))}
        {isNew
          ? (
            <PickOption keys={keys} index={hits.length} className="mk" onClick={() => draft.submit(() => onSubmit(typed))}>
              <IconPlus />
              <Tag shape="chip" className="tagchip">{typed}</Tag>
            </PickOption>
          )
          : null}
      </>
    )
    : null
  return { field, content }
}

/**
 * The `+` after the chips: clicking it turns it into the draft input, in its place, whose value goes
 * to `onAdd`. The `+` button opens it with its own `setOpen(true)`; the styling follows the demo's
 * .tagadd/.tagin/tagSug.
 */
function ChipAdd({ onAdd, drafts, ...props }: DraftProps & { onAdd: (value: string) => Promise<boolean>; drafts: Drafts<string> }) {
  const [ownOpen, setOpen] = useState(false)
  const open = ownOpen || drafts.get('add') !== undefined
  const input = useRef<HTMLInputElement>(null)
  const { field, content } = useChipDraft({
    ...props, open, initial: '', appearance: 'inline', input, onSubmit: onAdd, onClose: () => setOpen(false),
    kept: { drafts, target: 'add' },
  })
  return (
    <PickerPopover
      open={open} anchorRef={input} stopClickPropagation content={content}
      anchor={open
        ? field
        : (
          <AddAction
            variant="chip" className={tagClass('ghost', 'chip', 'tagchip tagadd')} label={props.labels.add}
            onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          />
        )}
    />
  )
}

/** Chip `value` being edited: the draft input in the chip's place, holding its value, whose result goes to `onReplace`. */
function ChipEdit({ value, onReplace, onClose, drafts, ...props }: DraftProps & {
  value: string
  onReplace: (value: string) => Promise<boolean>
  onClose: () => void
  drafts: Drafts<string>
}) {
  const input = useRef<HTMLInputElement>(null)
  const { field, content } = useChipDraft({
    ...props, open: true, initial: value, appearance: 'chip', input, onSubmit: onReplace, onClose,
    kept: { drafts, target: `edit:${value}` },
  })
  return <PickerPopover open anchorRef={input} stopClickPropagation content={content} anchor={field} />
}

/**
 * A list of values edited as chips the same way wherever it appears: a chip per value, whose × hands
 * it to `onRemove`, then the `+` that adds one through `onAdd`. With `onReplace`, clicking a chip
 * turns it into an input holding its value, in its place, and the value that input hands over
 * replaces it through `onReplace`. Every input offers the values of `vocabulary` the list does not
 * hold. `onAdd`, `onRemove` and `onReplace` return whether the write completed. What an input holds
 * is kept as a draft of `keep` (see `useDrafts`), the scope of the item the values belong to, and an
 * input with a kept draft opens again with it.
 */
export function TagChips({ values, onAdd, onRemove, onReplace, keep, ...props }: DraftProps & {
  onAdd: (value: string) => Promise<boolean>
  onRemove: (value: string) => Promise<boolean>
  onReplace?: (from: string, to: string) => Promise<boolean>
  keep: readonly string[]
}) {
  const drafts = useDrafts<string>(keep, [
    'add', ...(onReplace === undefined ? [] : values.map((value) => `edit:${value}`)),
  ])
  const [ownEditing, setEditing] = useState<string | null>(null)
  const editing = ownEditing ?? values.find((value) => drafts.get(`edit:${value}`) !== undefined) ?? null
  return (
    <>
      {values.map((value) => (onReplace !== undefined && editing === value
        ? (
          <ChipEdit
            key={value} value={value} values={values} {...props} drafts={drafts}
            onReplace={(to) => onReplace(value, to)} onClose={() => setEditing(null)}
          />
        )
        : (
          <span className={tagClass('neutral', 'chip', 'tagchip')} key={value}>
            {onReplace === undefined
              ? value
              : (
                <button type="button" className="tagchip-open" onClick={(e) => { e.stopPropagation(); setEditing(value) }}>
                  <FadeText className="tagchip-text">{value}</FadeText>
                </button>
              )}
            <IconButton
              label={props.labels.remove(value)} size="inline" className="rx"
              onClick={(event) => { event.stopPropagation(); void onRemove(value) }}
            ><IconCross sw={2.5} /></IconButton>
          </span>
        )))}
      <ChipAdd values={values} onAdd={onAdd} {...props} drafts={drafts} />
    </>
  )
}
