import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentPropsWithoutRef, ReactNode, RefObject } from 'react'
import { FadeText } from './FadeText.js'
import { isClipped } from '../hooks/useClipped.js'
import './Tag.css'

/**
 * The state a tag names, which alone colours its text on the neutral chip: an `error`, a `warning`,
 * something `done`, something `running`, in the theme colour, and the priorities `p0`, in the error's colour,
 * and `p1`, in the warning's. A tag
 * without a state, a kind, a source, a name or any other word, is neutral.
 */
export type TagState = 'error' | 'warning' | 'done' | 'p0' | 'p1' | 'running'

/**
 * A tag's box. `label` is a short status, kind, priority or source word in caption type; `chip` is a
 * name, topic, date or other value in small body type.
 */
export type TagShape = 'label' | 'chip'

/**
 * The class list of a tag of `state` (none for a neutral one) and `shape`, followed by `extra`
 * classes, for an element another component renders, such as a menu trigger.
 */
export function tagClass(state?: TagState, shape: TagShape = 'label', extra = ''): string {
  return `tag tag--${shape} tag--${state ?? 'neutral'}${extra ? ` ${extra}` : ''}`
}

/**
 * Whether the tag in `box` yields as a whole, the last resort when its row has no room left for it: a
 * layout squeezed it below its text, or it reaches past the end of its parent's content box (a parent
 * that draws no box of its own is not measured). A `capped` tag never yields. Measured whenever the tag
 * or its parent changes size.
 */
function useYielded(box: RefObject<HTMLElement | null>, capped: boolean): boolean {
  const [yielded, setYielded] = useState(false)
  useLayoutEffect(() => {
    const tag = box.current
    const parent = tag?.parentElement
    if (capped || !tag || !parent) {
      setYielded(false)
      return
    }
    const measure = () => {
      const text = tag.querySelector(':scope > .tag-text')
      const style = getComputedStyle(parent)
      const end = parent.getBoundingClientRect().right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
      const past = parent.getClientRects().length > 0 && tag.getBoundingClientRect().right > end + 1
      setYielded((text !== null && isClipped(text, 'x')) || past)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(tag)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [box, capped])
  return yielded
}

/** A tag's `extra` classes for `tagClass`: its state classes, then the host's `className`. */
const placement = (capped: boolean, yielded: boolean, className: string) =>
  [capped ? 'tag--capped' : '', yielded ? 'tag--yielded' : '', className].filter(Boolean).join(' ')

type TagOwnProps = {
  state?: TagState | undefined
  shape?: TagShape | undefined
  /** A mark before the text, such as a StatusDot or an icon; it never truncates. */
  lead?: ReactNode
  /**
   * The placement caps the tag's width for a long value, with a `max-width` of its own or a table cell's
   * width, and the text fades out at that cap. Without it, a tag that a layout squeezes below its text
   * or pushes past its parent's end hides as a whole instead.
   */
  capped?: boolean | undefined
  /** Placement and identity only; the tag's radius, padding, border and fill are its own. */
  className?: string | undefined
  children: ReactNode
}

/**
 * The one tag: fully rounded on the neutral chip, its box from `shape` and its text's colour from its
 * `state`. It keeps the width of
 * its text: a `capped` tag fades its long text out at its cap, and text that is cut off shows whole in
 * the shared tooltip.
 */
export const Tag = forwardRef<HTMLSpanElement, TagOwnProps & Omit<ComponentPropsWithoutRef<'span'>, keyof TagOwnProps>>(
  function Tag({ state, shape, lead, capped = false, className = '', children, ...rest }, ref) {
    const box = useRef<HTMLSpanElement>(null)
    useImperativeHandle(ref, () => box.current!, [])
    const yielded = useYielded(box, capped)
    return (
      <span ref={box} className={tagClass(state, shape, placement(capped, yielded, className))} {...rest}>
        {lead}<FadeText className="tag-text" label={typeof children === 'string' ? children : undefined}>{children}</FadeText>
      </span>
    )
  },
)

/** A tag that is a button, such as a link to a page; it darkens on hover and press. */
export const TagButton = forwardRef<HTMLButtonElement, TagOwnProps & Omit<ComponentPropsWithoutRef<'button'>, keyof TagOwnProps | 'type'>>(
  function TagButton({ state, shape, lead, capped = false, className = '', children, ...rest }, ref) {
    const box = useRef<HTMLButtonElement>(null)
    useImperativeHandle(ref, () => box.current!, [])
    const yielded = useYielded(box, capped)
    return (
      <button ref={box} type="button" className={tagClass(state, shape, placement(capped, yielded, className))} {...rest}>
        {lead}<FadeText className="tag-text" label={typeof children === 'string' ? children : undefined}>{children}</FadeText>
      </button>
    )
  },
)
