import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { useClipped } from '../hooks/useClipped.js'
import { Tooltip, useInTooltip } from './Tooltip.js'
import './FadeText.css'

/**
 * One line of text that fades out at its box's right edge only when it does not fit, and is left
 * whole when it does; with `label`, the shared tooltip shows that whole text while it is cut off,
 * unless the text sits inside another tooltip's element, which names it instead. `className` sizes
 * the box; the box must be allowed to shrink. Other props and the ref go to the box, so a tooltip
 * around it can name it instead.
 */
export const FadeText = forwardRef<HTMLSpanElement, {
  children: ReactNode
  className?: string | undefined
  label?: string | undefined
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>>(function FadeText({ children, className, label, ...props }, ref) {
  const box = useRef<HTMLSpanElement>(null)
  useImperativeHandle(ref, () => box.current!, [])
  const clipped = useClipped(box, children)
  const named = useInTooltip()
  const classes = ['fade-text', className, clipped ? 'clipped' : undefined].filter(Boolean).join(' ')
  return <Tooltip label={named ? undefined : label} whenClipped><span {...props} ref={box} className={classes}>{children}</span></Tooltip>
})
