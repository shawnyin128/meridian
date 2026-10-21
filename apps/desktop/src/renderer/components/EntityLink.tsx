import type { ReactElement, ReactNode } from 'react'
import type { GraphNode } from '../../shared/contract.js'
import { useMessages } from '../messages/useMessages.js'
import type { ScreenKey } from '../shell/AppShell.js'
import { FadeText } from './FadeText.js'
import { IconExternal } from './icons.js'
import { StatusDot } from './StatusDot.js'
import { Tooltip } from './Tooltip.js'
import './EntityLink.css'

type NodeMode = NonNullable<GraphNode['mode']>

const MODE_TONE = { unresolved: 'neutral', repairable: 'warn', supported: 'good', dead: 'bad' } as const satisfies Record<NodeMode, string>

const MODE_LEGEND = {
  unresolved: 'candidate', repairable: 'needsRepair', supported: 'verified', dead: 'failed',
} as const satisfies Record<NodeMode, string>

export type EntityLinkProps = {
  label: ReactNode
  /** The tooltip, for a name the label shortens; a node's label that fades shows itself whole. */
  title?: string | undefined
  /** Stretches a node link over its grid cell, so a column of nodes lines up. */
  fill?: boolean
} & { [key: `data-${string}`]: string | undefined } & (
  | { kind: 'node'; mode: NodeMode; onOpen?: () => void }
  | { kind: 'project' | 'page' | 'paper' | 'idea' | 'chat'; onOpen?: () => void; href?: string }
  | { kind: 'external'; href: string }
)

/** The screen that opens each kind of entity a link names: a paper in the reader, a project, a Wiki page, an idea, a chat. */
export const ENTITY_SCREEN = {
  paper: 'reader', project: 'project', page: 'wiki', idea: 'ideas', chat: 'chat',
} as const satisfies Record<'paper' | 'project' | 'page' | 'idea' | 'chat', ScreenKey>

/** The one mark that ends a link leaving the App for the browser. */
export const ExternalMark = () => <span className="entity-link-mark" aria-hidden="true"><IconExternal /></span>

/**
 * The one link to another entity: a research node, a project, a Wiki page, a paper, an idea or a chat,
 * or an address outside the App. Its label keeps the surrounding text's colour and is underlined while
 * it is a link. A node link leads with the node's state dot, named by the graph legend's word for that
 * state, and fades its label when it does not fit, when the tooltip shows it whole. `title` is the
 * tooltip of the whole link. `onOpen` makes it a button that opens the entity; given an in-App `href`
 * as well, it is a link that wraps like the text around it. An `external` link opens `href` in the
 * browser and ends with the external mark. With neither, it names the entity without being a link.
 */
export function EntityLink(props: EntityLinkProps) {
  const m = useMessages()
  const { label, title, fill = false, kind } = props
  const data = Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-')))
  const className = `entity-link entity-link--${kind}${fill ? ' entity-link--fill' : ''}`
  const named = (link: ReactElement) => <Tooltip label={title}>{link}</Tooltip>
  if (kind === 'external') {
    return named(
      <a className={className} href={props.href} target="_blank" rel="noreferrer" {...data}>
        {label}<ExternalMark />
      </a>,
    )
  }
  const body = kind === 'node'
    ? (
      <>
        <StatusDot tone={MODE_TONE[props.mode]} label={m.project.graph.legend[MODE_LEGEND[props.mode]]} labelHidden />
        <Tooltip label={typeof label === 'string' ? label : undefined} whenClipped><FadeText>{label}</FadeText></Tooltip>
      </>
    )
    : label
  const { onOpen } = props
  if (onOpen === undefined) return named(<span className={className} {...data}>{body}</span>)
  if (kind !== 'node' && props.href !== undefined) {
    return named(
      <a
        className={className} href={props.href} {...data}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpen() }}
      >{body}</a>,
    )
  }
  return named(
    <button
      type="button" className={className} {...data}
      onClick={(event) => { event.stopPropagation(); onOpen() }}
    >{body}</button>,
  )
}
