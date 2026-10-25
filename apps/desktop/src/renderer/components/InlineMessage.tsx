import type { HTMLAttributes, ReactNode } from 'react'
import { ProgressFill } from './ProgressFill.js'
import './InlineMessage.css'

/** What a message in place says: something failed, something needs attention, or a neutral note. */
export type InlineMessageTone = 'error' | 'warning' | 'info'

/**
 * The one error, warning or note shown in place, next to what it is about. `box` sets it on a tinted
 * surface of its tone, for a message that stands for a section, a card or a dialog's state; `line` writes
 * it as text in its tone, under the field or control it is about. An error is an alert, a warning or a
 * note a status.
 * @param lead A mark before the text, such as an icon or the running ring.
 * @param action The one control that acts on the message, after the text.
 * @param progress Fills the message's own surface from the left up to `percent`, under everything else.
 * @param className Placement only; the message's colours, type, padding and surface are its own.
 */
export function InlineMessage({ tone, variant, lead, action, progress, className, children, ...rest }: {
  tone: InlineMessageTone
  variant: 'box' | 'line'
  lead?: ReactNode
  action?: ReactNode
  progress?: { percent: number; label: string } | undefined
  className?: string | undefined
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'className' | 'children'>) {
  const classes = ['inline-message', `inline-message--${variant}`, `inline-message--${tone}`,
    progress === undefined ? '' : 'progress-host', className ?? ''].filter(Boolean).join(' ')
  return (
    <div className={classes} role={tone === 'error' ? 'alert' : 'status'} {...rest}>
      {progress === undefined ? null : <ProgressFill percent={progress.percent} label={progress.label} />}
      {lead === undefined || lead === null ? null : <span className="inline-message-lead">{lead}</span>}
      <div className="inline-message-text">{children}</div>
      {action === undefined ? null : <div className="inline-message-action">{action}</div>}
    </div>
  )
}
