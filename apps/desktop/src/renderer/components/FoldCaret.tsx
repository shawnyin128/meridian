import { Icon } from './icons.js'
import './FoldCaret.css'

/**
 * The one fold caret: a chevron that points down while its content shows (`open`) and turns to
 * point toward the end of its row while the content is folded away. Screen readers skip it; the
 * toggle around it states whether the content shows.
 */
export function FoldCaret({ open }: { open: boolean }) {
  return (
    <span className={open ? 'fold-caret' : 'fold-caret is-closed'} aria-hidden="true">
      <Icon sw={2.4}><path d="M6 9l6 6 6-6" /></Icon>
    </span>
  )
}
