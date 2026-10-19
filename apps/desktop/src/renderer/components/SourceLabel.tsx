import type { ReactNode } from 'react'
import { useMessages } from '../messages/useMessages.js'
import { Tag } from './Tag.js'

/**
 * Who wrote an item or where it came from, drawn the one way every screen draws it: a neutral label tag
 * that ends the item's title line. `lead` is an icon before the words; `className` places the label.
 */
export function SourceLabel({ children, lead, className }: {
  children: ReactNode
  lead?: ReactNode
  className?: string | undefined
}) {
  return <Tag lead={lead} className={`source-label${className ? ` ${className}` : ''}`}>{children}</Tag>
}

/**
 * The label of an agent's work, whichever agent did it; `source` names where the work came from. An item
 * the user wrote carries no label.
 */
export function AgentLabel({ source, className }: { source?: string; className?: string }) {
  const a = useMessages().common.attribution
  return <SourceLabel className={className}>{source === undefined ? a.agent : a.withSource(a.agent, source)}</SourceLabel>
}
