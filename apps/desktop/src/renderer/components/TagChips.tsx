import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { NO_TRIGGERS } from '../hooks/useOnLeave.js'
import { useDrafts, type Drafts, type KeptText } from '../hooks/useDrafts.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { CandidateField } from './CandidateField.js'
import { ChipList } from './ChipList.js'
import { FormInput, type FormControlAppearance } from './FormControls.js'

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
 * The input of one chip draft and its candidates, on CandidateField: the vocabulary's values the list
 * does not hold that contain the typed text, then the typed text itself when it is new. Clicking a
 * candidate hands it to `onSubmit`, and Enter, a press outside the input and its candidates, or focus
 * leaving them hands over the highlighted candidate, or the typed text when there is none. `onSubmit`
 * returns whether the write completed; the draft closes through `onClose` only then, and a rejected
 * write keeps the input and the typed text. Esc, leaving with nothing typed or with `initial`
 * unchanged, and Enter on `initial` unchanged close it without a write; while a submission is
 * pending, neither an outside press nor focus leaving closes it, and no second one is sent before the
 * first lands. All closing goes through `useInlineDraft`; Radix only positions the candidates.
 */
function useChipDraft({ initial, appearance, values, vocabulary, labels, input, onSubmit, onClose, onError, kept }: DraftProps & {
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
    void vocabulary().then(setVocab).catch(onError)
  }, [vocabulary, onError])

  const typed = q.trim()
  const needle = typed.toLowerCase()
  const hits = vocab.filter((v) => !values.includes(v) && (!needle || v.toLowerCase().includes(needle)))
  const isNew = typed !== '' && !values.includes(typed) && !hits.some((v) => v.toLowerCase() === needle)

  const draft = useInlineDraft({
    row: input, triggers: NO_TRIGGERS, isEmpty: () => typed === '' || typed === initial, kept,
    onCancel: () => { setOwnQ(initial); onClose() },
    onSubmit: () => (typed === '' ? false : typed === initial ? true : onSubmit(hits[keys.active] ?? typed)),
  })
  // The create row, when there is one, is the last row the keys and the pointer move through.
  const keys = useCandidateKeys(hits.length + (isNew ? 1 : 0), (i) => draft.submit(() => onSubmit(hits[i] ?? typed)))

  return (
    <CandidateField
      anchorRef={input} keys={keys} heading={labels.existing}
      field={(
        <FormInput
          appearance={appearance} className="tagin" ref={input} value={q} {...draft.inputProps}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { keys.onKeyDown(e); draft.inputProps.onKeyDown(e) }}
        />
      )}
      candidates={hits.map((v) => ({ id: v, label: v }))}
      onPick={(candidate) => draft.submit(() => onSubmit(candidate.id))}
      create={isNew ? { text: typed, onCreate: () => draft.submit(() => onSubmit(typed)) } : undefined}
    />
  )
}

/** The draft input in the `+`'s place, whose value goes to `onAdd`, until `onClose`. */
function ChipAdd({ onAdd, onClose, drafts, ...props }: DraftProps & {
  onAdd: (value: string) => Promise<boolean>
  onClose: () => void
  drafts: Drafts<string>
}) {
  const input = useRef<HTMLInputElement>(null)
  return useChipDraft({
    ...props, initial: '', appearance: 'inline', input, onSubmit: onAdd, onClose, kept: { drafts, target: 'add' },
  })
}

/** Chip `value` being edited: the draft input in the chip's place, holding its value, whose result goes to `onReplace`. */
function ChipEdit({ value, onReplace, onClose, drafts, ...props }: DraftProps & {
  value: string
  onReplace: (value: string) => Promise<boolean>
  onClose: () => void
  drafts: Drafts<string>
}) {
  const input = useRef<HTMLInputElement>(null)
  return useChipDraft({
    ...props, initial: value, appearance: 'chip', input, onSubmit: onReplace, onClose, kept: { drafts, target: `edit:${value}` },
  })
}

/**
 * A list of values edited as chips the same way wherever it appears, on ChipList: a chip per value,
 * whose × hands it to `onRemove`, then the `+` that turns into an input, in its place, whose value goes
 * to `onAdd`. With `onReplace`, clicking a chip turns it into an input holding its value, in its place,
 * and the value that input hands over replaces it through `onReplace`. Every input offers the values of
 * `vocabulary` the list does not hold. `onAdd`, `onRemove` and `onReplace` return whether the write
 * completed. What an input holds is kept as a draft of `keep` (see `useDrafts`), the scope of the item
 * the values belong to, and an input with a kept draft opens again with it. `reveal` places the `+` as
 * ChipList does.
 */
export function TagChips({ values, onAdd, onRemove, onReplace, keep, reveal, ...props }: DraftProps & {
  onAdd: (value: string) => Promise<boolean>
  onRemove: (value: string) => Promise<boolean>
  onReplace?: (from: string, to: string) => Promise<boolean>
  keep: readonly string[]
  reveal?: 'rest' | 'hover' | undefined
}) {
  const drafts = useDrafts<string>(keep, [
    'add', ...(onReplace === undefined ? [] : values.map((value) => `edit:${value}`)),
  ])
  const [ownEditing, setEditing] = useState<string | null>(null)
  const editing = ownEditing ?? values.find((value) => drafts.get(`edit:${value}`) !== undefined) ?? null
  const [ownAdding, setAdding] = useState(false)
  const adding = ownAdding || drafts.get('add') !== undefined
  return (
    <ChipList
      reveal={reveal}
      chips={values.map((value) => ({
        id: value,
        name: value,
        ...(onReplace === undefined ? {} : { onOpen: () => setEditing(value) }),
        remove: { label: props.labels.remove(value), onRemove: () => { void onRemove(value) } },
        ...(onReplace === undefined || editing !== value ? {} : {
          editor: (
            <ChipEdit
              value={value} values={values} {...props} drafts={drafts}
              onReplace={(to) => onReplace(value, to)} onClose={() => setEditing(null)}
            />
          ),
        }),
      }))}
      add={{
        label: props.labels.add,
        onAdd: () => setAdding(true),
        draft: adding ? <ChipAdd values={values} onAdd={onAdd} onClose={() => setAdding(false)} {...props} drafts={drafts} /> : undefined,
      }}
    />
  )
}
