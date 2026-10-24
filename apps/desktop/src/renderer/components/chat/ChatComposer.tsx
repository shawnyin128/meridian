import { Fragment, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { createPortal } from 'react-dom'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Compartment, EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderText } from '@codemirror/view'
import type { ChatRun } from '../../../shared/contract.js'
import { useCandidateKeys } from '../../hooks/useCandidateKeys.js'
import { sendsMessage } from '../../lib/chat.js'
import { composing } from '../../lib/keyboard.js'
import { useMessages } from '../../messages/useMessages.js'
import { GenerationControl } from '../GenerationControl.js'
import { NoModelTag } from '../NoModelTag.js'
import { PickerPopover, PickOption } from '../PickerPopover.js'
import { Tag } from '../Tag.js'
import { useWidgetSlots } from '../widget-slots.js'
import { composerMentions, type Mention, type MentionQuery } from './composer-mentions.js'

/** The mentionUI of the demo: Each group can list up to this many items. */
const MENTION_PER_GROUP = 4

/**
 * One candidate in the `@` picker: the kind and `id` of the entity it names, its name, the gray line
 * under it and how its name shows.
 */
export type MentionCandidate = { kind: 'project' | 'paper' | 'page'; id: string; title: string; meta: string; label: ReactNode }

/** The mention a pick of `candidate` puts in. */
const mentionOf = ({ kind, id, title }: MentionCandidate): Mention => ({ text: `@${title}`, target: { kind, id } })

/** What a screen can do to its composer from outside it. */
export type ChatComposerHandle = {
  focus: () => void
  /** Puts the mention of `candidate` at the caret, keeping the rest of the draft, and focuses the composer. */
  mention: (candidate: MentionCandidate) => void
}

/** The text a draft sends: its runs, mentions as their text, in order. */
export const draftText = (draft: readonly ChatRun[]): string => draft.map((run) => run.text).join('')

/**
 * The `@` picker's candidates for `typed`, the text after `@`, as in the demo's mentionUI: an item
 * matches when that text appears in its name or its gray meta line, and each group keeps at most
 * MENTION_PER_GROUP matches.
 */
function hitsOf(typed: string, all: readonly MentionCandidate[]): MentionCandidate[] {
  const needle = typed.toLowerCase()
  const perGroup: Record<string, number> = {}
  return all
    .filter((m) => !needle || m.title.toLowerCase().includes(needle) || m.meta.toLowerCase().includes(needle))
    .filter((m) => {
      perGroup[m.kind] = (perGroup[m.kind] ?? 0) + 1
      return perGroup[m.kind]! <= MENTION_PER_GROUP
    })
}

const sameDraft = (a: readonly ChatRun[], b: readonly ChatRun[]) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The one chat composer, in the Chat screen and the reader's paper chat: a CodeMirror editor over
 * `draft` with its own undo history, the no-model state and the send control. Enter sends, Shift+Enter
 * breaks the line, and an Enter that confirms an input method's composition belongs to the input
 * method. With `mentions`, typing `@` anywhere opens the picker of the candidates matching what
 * follows it up to the caret; picking one puts it in as a pill, which the caret steps over and a
 * deletion takes whole. `draft` replaces what the editor holds whenever it differs from what the
 * editor last reported through `onDraft`; nothing can be typed while `unavailable` or `running`.
 * `label` names the editor for assistive technology, as the placeholder does without it.
 */
export function ChatComposer({
  ref, id, label, placeholder, draft, onDraft, unavailable, running, noModel, sendId, onSend, onStop, mentions = [],
}: {
  ref?: Ref<ChatComposerHandle>
  id?: string
  label?: string
  placeholder: string
  draft: ChatRun[]
  onDraft: (draft: ChatRun[]) => void
  unavailable: boolean
  running: boolean
  noModel: boolean
  sendId?: string
  onSend: () => void
  onStop: () => void
  mentions?: readonly MentionCandidate[]
}) {
  const m = useMessages()
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const { slots, shown } = useWidgetSlots(view)
  const tools = useMemo(() => composerMentions(slots), [slots])
  const settings = useMemo(() => new Compartment(), [])
  const reported = useRef(draft)
  const reportDraft = useRef(onDraft)
  reportDraft.current = onDraft
  const [query, setQuery] = useState<MentionQuery | null>(null)
  // An Escape or a press outside closes the picker until the draft next changes.
  const [dismissed, setDismissed] = useState(false)
  const locked = unavailable || running

  const configured = (): Extension => [
    EditorView.editable.of(!locked), EditorState.readOnly.of(locked), placeholderText(placeholder),
    EditorView.contentAttributes.of({ ...(id === undefined ? {} : { id }), 'aria-label': label ?? placeholder }),
  ]
  const stateOf = (runs: readonly ChatRun[]) => tools.stateOf(runs, [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    settings.of(configured()),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const next = tools.draftOf(update.state)
        reported.current = next
        setDismissed(false)
        reportDraft.current(next)
      }
      if (update.docChanged || update.selectionSet) setQuery(tools.queryOf(update.state))
    }),
  ])

  useEffect(() => {
    const editor = new EditorView({ parent: host.current!, state: stateOf(draft) })
    view.current = editor
    setQuery(tools.queryOf(editor.state))
    return () => editor.destroy()
  }, [])
  useEffect(() => { view.current?.dispatch({ effects: settings.reconfigure(configured()) }) }, [locked, placeholder, id, label])
  useEffect(() => {
    if (view.current === null || sameDraft(draft, reported.current)) return
    reported.current = draft
    view.current.setState(stateOf(draft))
    setQuery(tools.queryOf(view.current.state))
  }, [draft])

  const hits = query === null || dismissed ? [] : hitsOf(query.typed, mentions)
  const pick = (candidate: MentionCandidate) => {
    const editor = view.current!
    if (query !== null) tools.mention(editor, query.from, editor.state.selection.main.head, mentionOf(candidate))
    editor.focus()
  }
  const keys = useCandidateKeys(hits.length, (at) => pick(hits[at]!))
  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    mention: (candidate) => {
      const editor = view.current!
      const { from, to } = editor.state.selection.main
      tools.mention(editor, from, to, mentionOf(candidate))
      editor.focus()
    },
  }), [tools])

  return (
    <>
      <PickerPopover
        open={hits.length > 0} onOpenChange={(open) => { if (!open) setDismissed(true) }}
        contentClassName="pickhits cres" contentId="cRes" side="top" align="center" sideOffset={6}
        anchor={(
          <div className="cbox">
            <div
              className="chat-composer" ref={host}
              // Capturing the keys the composer acts on keeps the editor from acting on them too.
              onKeyDownCapture={(event) => {
                if (composing(event.nativeEvent)) return
                if (hits.length > 0) {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return
                  keys.onKeyDown(event)
                  event.preventDefault()
                } else if (sendsMessage(event.nativeEvent)) {
                  event.preventDefault()
                  onSend()
                }
              }}
            />
            {noModel ? <NoModelTag label={m.chat.noModel} /> : null}
            <GenerationControl
              className="send" id={sendId} running={running} disabled={unavailable || draftText(draft).trim() === ''}
              onStart={onSend} onStop={onStop}
            />
          </div>
        )}
        content={hits.length === 0 ? null : (
          <>
            <div className="rh">{m.chat.mentionPickerHeading}</div>
            {hits.map((hit, at) => (
              <Fragment key={`${hit.kind}${hit.title}`}>
                {hits[at - 1]?.kind === hit.kind ? null : <div className="rg">{m.chat.mentionGroup[hit.kind]}</div>}
                <PickOption keys={keys} index={at} className="two-line" onClick={() => pick(hit)}>
                  <div className="rt">@{hit.label}</div>
                  <div className="rm">{hit.meta}</div>
                </PickOption>
              </Fragment>
            ))}
          </>
        )}
      />
      {shown.map((slot) => createPortal(<Tag shape="chip">{slot.source}</Tag>, slot.dom, String(slot.key)))}
    </>
  )
}
