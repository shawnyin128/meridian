import { forwardRef, useCallback, type HTMLAttributes } from 'react'
import { useScrollFade } from '../hooks/useScrollFade.js'
import './ScrollArea.css'

/** An edge of a scroll area. */
export type ScrollEdge = 'top' | 'bottom' | 'left' | 'right'

/**
 * The one scroll container: it scrolls along `axis` (`both` for the two) and fades each edge past which
 * content is hidden. `fill` makes it take the rest of its flex container and scroll inside it instead of
 * growing with its content. `gutter` keeps room for a vertical scrollbar whether or not one shows, so the
 * content never moves when it starts to scroll and lines up with a region pinned beside the area that
 * keeps the same room. `paint` fades by
 * laying the host's ground, `--fade-paint`, over a hidden edge instead of masking it, for an area that
 * draws its own frame or holds sticky children; the host gives its top and bottom padding as
 * `--fade-pad-top` and `--fade-pad-bottom`. `held` names the edges a sticky child holds, which stay
 * solid. A sticky child that content slides under carries `data-stuck-fade` with the edges it is
 * stuck to (`top`, `left`, `right`), and fades the content under it in its own paint while stuck.
 * The element goes to `ref` too, an object or a callback.
 */
export const ScrollArea = forwardRef<HTMLDivElement, {
  axis: 'x' | 'y' | 'both'
  as?: 'div' | 'section' | 'aside'
  fill?: boolean
  gutter?: boolean
  paint?: boolean
  held?: readonly ScrollEdge[]
} & HTMLAttributes<HTMLDivElement>>(function ScrollArea({
  axis, as: Element = 'div', fill = false, gutter = false, paint = false, held, className, ...props
}, ref) {
  const fade = useScrollFade<HTMLDivElement>(axis)
  const attach = useCallback((node: HTMLDivElement | null) => {
    fade(node)
    if (typeof ref === 'function') ref(node)
    else if (ref !== null) ref.current = node
  }, [fade, ref])
  const classes = ['scroll-area', `scroll-area--${axis}`, fill ? 'scroll-area--fill' : '', gutter ? 'scroll-area--gutter' : '', className]
    .filter(Boolean).join(' ')
  return (
    <Element
      ref={attach} className={classes} {...(paint ? { 'data-fade-paint': '' } : {})}
      {...(held === undefined || held.length === 0 ? {} : { 'data-fade-held': held.join(' ') })} {...props}
    />
  )
})
