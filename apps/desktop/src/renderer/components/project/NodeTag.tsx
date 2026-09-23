import { useMessages } from '../../messages/useMessages.js'
import './NodeTag.css'

/**
 * The one way a row names a research node: a soft pill reading the node label. With `onOpen` it is a
 * button that opens the node; `hint` is its hover text. `fill` stretches it over its grid cell so a
 * column of tags lines up; otherwise it sizes to its text.
 */
export function NodeTag({ label, onOpen, hint, fill = false }: {
  label: string
  onOpen?: () => void
  hint?: string
  fill?: boolean
}) {
  const m = useMessages()
  const text = m.project.idea.nodeTag(label)
  const className = fill ? 'node-tag node-tag--fill' : 'node-tag'
  return onOpen === undefined
    ? <span className={className} title={hint ?? label}><span className="node-tag-text">{text}</span></span>
    : (
      <button
        type="button" className={className} title={hint ?? label}
        onClick={(event) => { event.stopPropagation(); onOpen() }}
      ><span className="node-tag-text">{text}</span></button>
    )
}
