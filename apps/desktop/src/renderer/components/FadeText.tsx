import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { useClipped } from '../hooks/useClipped.js'
import { Tooltip, TOOLTIP_DELAY, useInTooltip } from './Tooltip.js'
import './FadeText.css'

/**
 * One line of text that fades out at its box's right edge only when it does not fit, and is left
 * whole when it does; with `label`, the shared tooltip shows that whole text while it is cut off,
 * unless the text sits inside another tooltip's element, which names it instead. With `expand`, the
 * text wraps instead and shows its first line, fading where that line ends when more is hidden; once
 * the pointer has rested on it for the tooltip's delay it opens downward to its whole height, and it
 * closes when the pointer leaves. `className` sizes the box; the box must be allowed to shrink. Other
 * props and the ref go to the box, so a tooltip around it can name it instead.
 */
export const FadeText = forwardRef<HTMLSpanElement, {
  children: ReactNode
  className?: string | undefined
} & ({ label?: string | undefined; expand?: false } | { label?: never; expand: true })
  & Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>>(function FadeText({ children, className, label, expand = false, ...props }, ref) {
  const box = useRef<HTMLSpanElement>(null)
  useImperativeHandle(ref, () => box.current!, [])
  const clipped = useClipped(box, children, expand)
  const named = useInTooltip()
  const [open, setOpen] = useState(false)
  const opening = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(opening.current), [])
  const classes = ['fade-text', expand ? 'fade-lines fade-expand' : undefined, className,
    clipped ? 'clipped' : undefined, open ? 'is-open' : undefined].filter(Boolean).join(' ')
  if (expand) {
    return (
      <span
        {...props} ref={box} className={classes}
        onMouseEnter={(event) => {
          opening.current = setTimeout(() => setOpen(true), TOOLTIP_DELAY)
          props.onMouseEnter?.(event)
        }}
        onMouseLeave={(event) => {
          clearTimeout(opening.current)
          setOpen(false)
          props.onMouseLeave?.(event)
        }}
      >{children}</span>
    )
  }
  return <Tooltip label={named ? undefined : label} whenClipped><span {...props} ref={box} className={classes}>{children}</span></Tooltip>
})
