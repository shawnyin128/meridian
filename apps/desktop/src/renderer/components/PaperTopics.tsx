import { useCallback, useEffect, useRef, useState } from 'react'
import { papers } from '../ipc.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { NO_TRIGGERS } from '../hooks/useOnLeave.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { useMessages } from '../messages/useMessages.js'
import { AddAction } from './AddAction.js'
import { FormInput } from './FormControls.js'
import { IconButton } from './IconButton.js'
import { IconCross, IconPlus } from './icons.js'
import { PickerPopover, PickOption } from './PickerPopover.js'
import { Tag, tagClass } from './Tag.js'

/**
 * A paper's topics, edited the same way in the paper table and the detail panel: a chip per topic,
 * whose × hands it to `onRemove`, then the `+` that adds one. `onAdd` and `onRemove` return whether
 * the write completed.
 */
export function PaperTopics({ topics, onAdd, onRemove, onError }: {
  topics: string[]
  onAdd: (value: string) => Promise<boolean>
  onRemove: (value: string) => Promise<boolean>
  onError: (e: Error) => void
}) {
  const m = useMessages()
  return (
    <>
      {topics.map((topic) => (
        <span className={tagClass('neutral', 'chip', 'tagchip')} key={topic}>{topic}
          <IconButton
            label={m.papers.tags.remove(topic)} size="inline" className="rx"
            onClick={(event) => { event.stopPropagation(); void onRemove(topic) }}
          ><IconCross sw={2.5} /></IconButton>
        </span>
      ))}
      <TopicAdd values={topics} onAdd={onAdd} onError={onError} />
    </>
  )
}

/**
 * The `+` after a paper's topic chips: clicking it turns it into an input. Its candidate list shows
 * the vault's values this paper does not have yet; clicking a candidate hands it to `onAdd`, and
 * Enter, a press outside the input and its candidates, or focus leaving them hands over the
 * highlighted candidate, or the typed text when there is none. `onAdd` returns whether the write
 * completed. The input closes only then; a rejected write keeps the input and the typed text. Esc,
 * or leaving with nothing typed, closes it and drops the typed text; while a submission is pending,
 * neither an outside press nor focus leaving closes it, and no second add is sent before the first
 * one lands. The `+` button opens it with its own `setOpen(true)` and all closing goes through
 * `useInlineDraft`; Radix only positions and renders the popover and has no say in opening or
 * closing. The styling follows the demo's .tagadd/.tagin/tagSug. The candidates are fetched with
 * papers.facets each time it opens, so they are always the vault's current values.
 */
function TopicAdd({ values, onAdd, onError }: {
  /** Values this paper already has. */
  values: string[]
  onAdd: (value: string) => Promise<boolean>
  onError: (e: Error) => void
}) {
  const m = useMessages()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [vocab, setVocab] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setQ('')
  }, [])

  useEffect(() => {
    if (!open) return
    void papers.facets('topics').then((fs) => setVocab(fs.map((f) => f.value))).catch(onError)
  }, [open, onError])

  const typed = q.trim()
  const needle = typed.toLowerCase()
  const hits = open
    ? vocab.filter((v) => !values.includes(v) && (!needle || v.toLowerCase().includes(needle)))
    : []
  const isNew = typed !== '' && !values.includes(typed) && !hits.some((v) => v.toLowerCase() === needle)

  // While closed the input is not rendered and its ref is null, so the outside and focus paths do nothing.
  const draft = useInlineDraft({
    row: input, triggers: NO_TRIGGERS, onCancel: close, isEmpty: () => typed === '',
    onSubmit: () => (typed === '' ? false : onAdd(hits[keys.active] ?? typed)),
  })
  // The create row, when there is one, is the last row the keys and the pointer move through.
  const keys = useCandidateKeys(hits.length + (isNew ? 1 : 0), (i) => draft.submit(() => onAdd(hits[i] ?? typed)))

  return (
    <PickerPopover
      open={open} anchorRef={input} stopClickPropagation
      anchor={open
        ? (
          <FormInput
            appearance="inline" className="tagin" ref={input} value={q} {...draft.inputProps}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { keys.onKeyDown(e); draft.inputProps.onKeyDown(e) }}
          />
        )
        : (
          <AddAction
            variant="chip" className={tagClass('ghost', 'chip', 'tagchip tagadd')} title={m.papers.tags.add}
            onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          />
        )}
      content={hits.length > 0 || isNew
        ? (
          <>
              {hits.length > 0 ? <div className="rh">{m.papers.tags.existingTopics}</div> : null}
              {hits.map((v, i) => (
                <PickOption keys={keys} index={i} key={v} onClick={() => draft.submit(() => onAdd(v))}>{v}</PickOption>
              ))}
              {isNew
                ? (
                  <PickOption
                    keys={keys} index={hits.length} className="mk" onClick={() => draft.submit(() => onAdd(typed))}
                  >
                    <IconPlus />
                    <Tag shape="chip" className="tagchip">{typed}</Tag>
                  </PickOption>
                )
                : null}
          </>
        )
        : null}
    />
  )
}
