import type { ReactElement, ReactNode } from 'react'
import { useMessages } from '../messages/useMessages.js'
import './EmptyState.css'

/**
 * The app-wide "nothing here" surface, in its minimal form; it never holds a sentence. `section` is
 * one list-row-high line holding the shared empty value (—) in tertiary ink, under the heading that
 * names what is empty; `results` is the same line for a search or picker that found nothing, holding
 * the shared no-result word, and `option` is that line in a list of options, its word where an
 * option's text starts; `inline` is the empty value standing in a value's place. `page` fills an
 * empty screen with the screen's glyph `icon` and, when there is one, `action`, the one control that
 * ends the emptiness.
 */
export function EmptyState(props:
  | { variant: 'section' | 'results' | 'option' | 'inline' }
  | { variant: 'page'; icon: ReactNode; action?: ReactNode }): ReactElement {
  const m = useMessages()
  if (props.variant === 'page') return <div className="empty-state empty-state--page">{props.icon}{props.action}</div>
  if (props.variant === 'inline') return <span className="empty-state empty-state--inline">{m.common.empty}</span>
  if (props.variant === 'option') return <div className="empty-state empty-state--option">{m.common.noResults}</div>
  return (
    <div className="empty-state empty-state--section">{props.variant === 'results' ? m.common.noResults : m.common.empty}</div>
  )
}
