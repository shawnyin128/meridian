import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import './Tag.css'

/**
 * A tag's text colour on the neutral chip: `good`, `warn` and `bad` write in their state's colour, and
 * every other tone in the neutral one. `ghost` is the dashed empty slot at the end of a row of tags
 * that adds one.
 */
export type TagTone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info' | 'paper' | 'wiki' | 'ghost'

/**
 * A tag's box. `label` is a short status, kind, priority or source word in caption type; `chip` is a
 * name, topic, date or other value in small body type.
 */
export type TagShape = 'label' | 'chip'

/**
 * The class list of a tag of `tone` and `shape`, followed by `extra` classes, for an element another
 * component renders, such as a menu trigger.
 */
export function tagClass(tone: TagTone = 'neutral', shape: TagShape = 'label', extra = ''): string {
  return `tag tag--${shape} tag--${tone}${extra ? ` ${extra}` : ''}`
}

type TagOwnProps = {
  tone?: TagTone | undefined
  shape?: TagShape | undefined
  /** A mark before the text, such as a StatusDot or an icon; it never truncates. */
  lead?: ReactNode
  /** Placement and identity only; the tag's radius, padding, border and fill are its own. */
  className?: string | undefined
  children: ReactNode
}

/** The one tag: fully rounded, its box from `shape` and its colours from `tone`; long text ends in an ellipsis. */
export const Tag = forwardRef<HTMLSpanElement, TagOwnProps & Omit<ComponentPropsWithoutRef<'span'>, keyof TagOwnProps>>(
  function Tag({ tone, shape, lead, className = '', children, ...rest }, ref) {
    return (
      <span ref={ref} className={tagClass(tone, shape, className)} {...rest}>
        {lead}<span className="tag-text">{children}</span>
      </span>
    )
  },
)

/** A tag that is a button, such as a link to a page; it darkens on hover and press. */
export const TagButton = forwardRef<HTMLButtonElement, TagOwnProps & Omit<ComponentPropsWithoutRef<'button'>, keyof TagOwnProps | 'type'>>(
  function TagButton({ tone, shape, lead, className = '', children, ...rest }, ref) {
    return (
      <button ref={ref} type="button" className={tagClass(tone, shape, className)} {...rest}>
        {lead}<span className="tag-text">{children}</span>
      </button>
    )
  },
)

/** A number beside a label: quiet, or `strong`, in the accent, when it counts items waiting for the user. Zero is shown as 0. */
export function CountBadge({ count, strong = false, className = '' }: {
  count: number
  strong?: boolean
  className?: string
}) {
  return (
    <span className={`count-badge${strong ? ' count-badge--strong' : ''}${className ? ` ${className}` : ''}`}>
      {count}
    </span>
  )
}
