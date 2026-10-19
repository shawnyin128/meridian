import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './IconButton.css'

/** `default` for a page or panel head, `nested` for a row, toolbar or table header, `inline` for a chip or a narrow cell. */
export type IconButtonSize = 'default' | 'nested' | 'inline'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'aria-pressed' | 'children'> & {
  /** The accessible name, and the native tooltip unless `title` gives another one. */
  label: string
  size?: IconButtonSize
  /** `danger` turns the glyph red on hover and the focus ring red. */
  tone?: 'neutral' | 'danger'
  /** Makes the button a toggle and shows whether it is on. */
  pressed?: boolean
  /** The glyph; the size sets its width and height. */
  children: ReactNode
}

const SIZE_CLASS: Record<IconButtonSize, string> = { default: '', nested: 'sm', inline: 'xs' }

/**
 * The one icon-only button: a ghost square that sizes its glyph and keeps a hit area of at least
 * 24px. Further classes in `className` only place it or reveal it.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  label, size = 'default', tone = 'neutral', pressed, className, title, type = 'button', children, ...props
}, ref) {
  const classes = ['icbtn', SIZE_CLASS[size], tone === 'danger' ? 'danger' : '', className].filter(Boolean).join(' ')
  return (
    <button
      {...props} ref={ref} type={type} className={classes} aria-label={label} title={title ?? label}
      aria-pressed={pressed}
    >{children}</button>
  )
})
