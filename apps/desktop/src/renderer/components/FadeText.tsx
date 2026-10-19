import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import './FadeText.css'

/**
 * One line of text that fades out at its box's right edge only when it does not fit, and is left
 * whole when it does. `className` sizes the box; the box must be allowed to shrink. Other props and
 * the ref go to the box, so a tooltip can name it.
 */
export const FadeText = forwardRef<HTMLSpanElement, { children: ReactNode; className?: string | undefined }
  & Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>>(function FadeText({ children, className, ...props }, ref) {
  const box = useRef<HTMLSpanElement>(null)
  useImperativeHandle(ref, () => box.current!, [])
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const element = box.current
    if (element === null) return
    const measure = () => setClipped(element.scrollWidth > element.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [children])
  const classes = ['fade-text', className, clipped ? 'clipped' : undefined].filter(Boolean).join(' ')
  return <span {...props} ref={box} className={classes}>{children}</span>
})
