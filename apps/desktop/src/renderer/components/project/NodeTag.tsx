import type { GraphNode } from '../../../shared/contract.js'
import { FadeText } from '../FadeText.js'
import './NodeTag.css'

/**
 * The one way a row names a research node: the node's state dot, coloured as in the research graph,
 * and its label in quiet text that fades only when it does not fit. With `onOpen` it is a button that
 * opens the node; `hint` is its hover text. `fill` stretches it over its grid cell so a column of
 * nodes lines up; otherwise it sizes to its text.
 */
export function NodeTag({ label, mode, onOpen, hint, fill = false }: {
  label: string
  mode: NonNullable<GraphNode['mode']>
  onOpen?: () => void
  hint?: string
  fill?: boolean
}) {
  const className = `node-tag node-tag--${mode}${fill ? ' node-tag--fill' : ''}`
  const body = <><span className="node-tag-dot" aria-hidden="true" /><FadeText>{label}</FadeText></>
  return onOpen === undefined
    ? <span className={className} title={hint ?? label}>{body}</span>
    : (
      <button
        type="button" className={className} title={hint ?? label}
        onClick={(event) => { event.stopPropagation(); onOpen() }}
      >{body}</button>
    )
}
