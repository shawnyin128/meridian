import type { GraphNode } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { FadeText } from '../FadeText.js'
import { StatusDot } from '../StatusDot.js'
import './NodeTag.css'

type Mode = NonNullable<GraphNode['mode']>

const MODE_TONE = { unresolved: 'neutral', repairable: 'warn', supported: 'good', dead: 'bad' } as const satisfies Record<Mode, string>

const MODE_LEGEND = {
  unresolved: 'candidate', repairable: 'needsRepair', supported: 'verified', dead: 'failed',
} as const satisfies Record<Mode, string>

/**
 * The one way a row names a research node: the node's state dot, coloured as in the research graph and
 * named by the graph legend's word for that state, and its label in quiet text that fades only when it
 * does not fit. With `onOpen` it is a button that
 * opens the node; `hint` is its hover text. `fill` stretches it over its grid cell so a column of
 * nodes lines up; otherwise it sizes to its text.
 */
export function NodeTag({ label, mode, onOpen, hint, fill = false }: {
  label: string
  mode: Mode
  onOpen?: () => void
  hint?: string
  fill?: boolean
}) {
  const m = useMessages()
  const className = `node-tag${fill ? ' node-tag--fill' : ''}`
  const body = (
    <>
      <StatusDot tone={MODE_TONE[mode]} label={m.project.graph.legend[MODE_LEGEND[mode]]} labelHidden />
      <FadeText>{label}</FadeText>
    </>
  )
  return onOpen === undefined
    ? <span className={className} title={hint ?? label}>{body}</span>
    : (
      <button
        type="button" className={className} title={hint ?? label}
        onClick={(event) => { event.stopPropagation(); onOpen() }}
      >{body}</button>
    )
}
