import { useMessages } from '../../messages/useMessages.js'
import './NodeTag.css'

/**
 * The one way a row names a research node: a soft pill reading the node label. With `onOpen` it is a
 * button that opens the node; `hint` is its hover text.
 */
export function NodeTag({ label, onOpen, hint }: { label: string; onOpen?: () => void; hint?: string }) {
  const m = useMessages()
  const text = m.project.idea.nodeTag(label)
  return onOpen === undefined
    ? <span className="node-tag" title={hint ?? label}><span className="node-tag-text">{text}</span></span>
    : (
      <button
        type="button" className="node-tag" title={hint ?? label}
        onClick={(event) => { event.stopPropagation(); onOpen() }}
      ><span className="node-tag-text">{text}</span></button>
    )
}
