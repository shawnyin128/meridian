import { FadeText } from './FadeText.js'
import './TitleNote.css'

/** Stands in for the title while the note's own words are split around it; no copy contains it. */
const SLOT = '\u0000'

/**
 * A notice that names an entity: `message` is the catalog entry that places `title` in
 * its sentence. The title stays on one line and fades out at its end when it is longer than a note
 * allows; the words around it are always shown whole.
 */
export function TitleNote({ message, title }: { message: (title: string) => string; title: string }) {
  const [before, after] = message(SLOT).split(SLOT)
  return <>{before}<FadeText className="title-note">{title}</FadeText>{after}</>
}
