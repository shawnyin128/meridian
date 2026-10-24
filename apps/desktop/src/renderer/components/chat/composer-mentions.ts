import { invertedEffects, isolateHistory } from '@codemirror/commands'
import type { Extension } from '@codemirror/state'
import { EditorSelection, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { ChatRun } from '../../../shared/contract.js'
import type { WidgetSlots } from '../widget-slots.js'

/** A mention in the composer's text: the range it covers and its text, `@` and the name. */
type Placed = { from: number; to: number; text: string }

/** The mention being typed: where its `@` is and the text typed after it, up to the caret. */
export type MentionQuery = { from: number; typed: string }

const place = StateEffect.define<Placed>({
  map: ({ from, to, text }, change) => {
    const start = change.mapPos(from, 1)
    const end = change.mapPos(to, -1)
    return start < end ? { from: start, to: end, text } : undefined
  },
})

/** A mention in the editor: an empty element that `slots` fills with the pill for `text`. */
class MentionPill extends WidgetType {
  constructor(readonly text: string, readonly slots: WidgetSlots) { super() }

  override eq(other: MentionPill): boolean { return other.text === this.text }

  toDOM(): HTMLElement {
    const dom = document.createElement('span')
    dom.className = 'composer-mention'
    this.slots.add(dom, this.text)
    return dom
  }

  override destroy(dom: HTMLElement): void { this.slots.remove(dom) }

  override ignoreEvent(): boolean { return false }
}

const textOf = (pill: Decoration): string => (pill.spec.widget as MentionPill).text

/**
 * Mentions as atomic pills in a chat composer, each shown through an element handed to `slots`: the
 * caret steps over a pill and a deletion takes it whole, a mention whose text is edited stops being
 * one, and undo and redo bring a pill back with its text.
 */
export function composerMentions(slots: WidgetSlots) {
  const pill = ({ from, to, text }: Placed) => Decoration.replace({ widget: new MentionPill(text, slots) }).range(from, to)
  const pills = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update: (held, transaction) => {
      const { state } = transaction
      const kept = transaction.docChanged
        ? held.map(transaction.changes).update({ filter: (from, to, value) => state.sliceDoc(from, to) === textOf(value) })
        : held
      const added = transaction.effects.flatMap((effect) => (effect.is(place) && state.sliceDoc(effect.value.from, effect.value.to) === effect.value.text
        ? [pill(effect.value)] : []))
      return added.length === 0 ? kept : kept.update({ add: added, sort: true })
    },
    provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))],
  })
  // Each pill a change removes is put back by undoing it, and by redoing the undo of the change that placed it.
  const restore = invertedEffects.of((transaction) => {
    const lost: StateEffect<Placed>[] = []
    const held = transaction.startState.field(pills)
    transaction.changes.iterChangedRanges((fromA, toA) => {
      held.between(fromA, toA, (from, to, value) => {
        if (from < toA && to > fromA) lost.push(place.of({ from, to, text: textOf(value) }))
      })
    })
    return lost
  })
  const extension: Extension = [pills, restore]

  return {
    extension,

    /** An editor state holding the draft `runs` with the caret at its end, and `extensions`. */
    stateOf(runs: readonly ChatRun[], extensions: Extension): EditorState {
      let doc = ''
      const placed: Placed[] = []
      for (const run of runs) {
        if (run.kind === 'mention') placed.push({ from: doc.length, to: doc.length + run.text.length, text: run.text })
        doc += run.text
      }
      const state = EditorState.create({ doc, selection: EditorSelection.cursor(doc.length), extensions: [extensions, extension] })
      return placed.length === 0 ? state : state.update({
        effects: placed.map((at) => place.of(at)), annotations: Transaction.addToHistory.of(false),
      }).state
    },

    /** The draft in `state` as runs: its text, with each mention as a run of its own. */
    draftOf(state: EditorState): ChatRun[] {
      const runs: ChatRun[] = []
      let at = 0
      state.field(pills).between(0, state.doc.length, (from, to, value) => {
        if (from > at) runs.push({ kind: 'text', text: state.sliceDoc(at, from) })
        runs.push({ kind: 'mention', text: textOf(value) })
        at = to
      })
      if (at < state.doc.length) runs.push({ kind: 'text', text: state.sliceDoc(at) })
      return runs
    },

    /** The mention being typed at the caret: the last `@` before it on its line, unless that `@` is a pill's. */
    queryOf(state: EditorState): MentionQuery | null {
      const caret = state.selection.main
      if (!caret.empty) return null
      const line = state.doc.lineAt(caret.head)
      const at = state.sliceDoc(line.from, caret.head).lastIndexOf('@')
      if (at < 0) return null
      const from = line.from + at
      let inPill = false
      state.field(pills).between(from, from + 1, (start, end) => { if (start <= from && from < end) inPill = true })
      return inPill ? null : { from, typed: state.sliceDoc(from + 1, caret.head) }
    },

    /**
     * Replaces `from`–`to` in `view` with the mention `text` and puts the caret after it, past a
     * space typed after it unless whitespace already follows. Undo takes the mention back on its own.
     */
    mention(view: EditorView, from: number, to: number, text: string): void {
      const spaced = /^\s/.test(view.state.sliceDoc(to, to + 1))
      const insert = spaced ? text : `${text} `
      view.dispatch({
        changes: { from, to, insert },
        effects: place.of({ from, to: from + text.length, text }),
        selection: EditorSelection.cursor(from + insert.length + (spaced ? 1 : 0)),
        userEvent: 'input.complete',
        annotations: isolateHistory.of('full'),
      })
    },
  }
}

export type ComposerMentions = ReturnType<typeof composerMentions>
