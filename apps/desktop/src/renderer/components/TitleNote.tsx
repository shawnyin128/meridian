import type { FeedRun } from '../../shared/contract.js'
import { FadeText } from './FadeText.js'
import './TitleNote.css'

/** Stands in for a title while the words around it are split from it; no copy contains it. */
export const SLOT = '\u0000'

/**
 * A notice that names an entity: `message` is the catalog entry that places `title` in
 * its sentence. The title stays on one line and fades out at its end when it is longer than a note
 * allows, and the tooltip then shows it whole; the words around it are always shown whole.
 */
export function TitleNote({ message, title }: { message: (title: string) => string; title: string }) {
  const [before, after] = message(SLOT).split(SLOT)
  return <>{before}<FadeText className="title-note" label={title}>{title}</FadeText>{after}</>
}

/**
 * The feed runs of a sentence that names an entity: `message` is the catalog entry that places `name`
 * in it, and the run of `name` carries `target`, the entity it names.
 */
export function namedRuns(message: (name: string) => string, name: string, target: NonNullable<FeedRun['target']>): FeedRun[] {
  const [before = '', after = ''] = message(SLOT).split(SLOT)
  return [
    ...before === '' ? [] : [{ kind: 'text' as const, text: before }],
    { kind: 'text', text: name, target },
    ...after === '' ? [] : [{ kind: 'text' as const, text: after }],
  ]
}
