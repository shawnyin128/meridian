import type { HTMLAttributes, ReactNode } from 'react'
import { FadeText } from './FadeText.js'
import { ProgressFill } from './ProgressFill.js'
import './InlineMessage.css'

/** What a message in place says: something failed, something needs attention, a neutral note, or something done. */
export type InlineMessageTone = 'error' | 'warning' | 'info' | 'done'

/**
 * The one error, warning, note or success shown in place, next to what it is about. Only its text takes
 * the tone's colour. `box` sets it on the neutral surface, for a message that stands for a section, a card
 * or a dialog's state; `line` writes it as text, under the field or control it is about; `field` writes it on
 * one line in place of a field, as tall as one, fading text that does not fit and, when it is a string,
 * showing it whole in the tooltip. An error is an alert, every other tone a status.
 * @param lead A mark before the text, such as an icon or the running ring.
 * @param action The one control that acts on the message, after the text.
 * @param actionAt Where `action` sits: at the message's `end`, the default, or right after the `text`.
 * @param progress Fills the message's own surface from the left up to `percent`, under everything else.
 * @param className Placement only; the message's colours, type, padding and surface are its own.
 */
export function InlineMessage({ tone, variant, lead, action, actionAt = 'end', progress, className, children, ...rest }: {
  tone: InlineMessageTone
  variant: 'box' | 'line' | 'field'
  lead?: ReactNode
  action?: ReactNode
  actionAt?: 'end' | 'text'
  progress?: { percent: number; label: string } | undefined
  className?: string | undefined
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'className' | 'children'>) {
  const classes = ['inline-message', `inline-message--${variant}`, `inline-message--${tone}`,
    actionAt === 'text' ? 'inline-message--action-at-text' : '',
    progress === undefined ? '' : 'progress-host', className ?? ''].filter(Boolean).join(' ')
  return (
    <div className={classes} role={tone === 'error' ? 'alert' : 'status'} {...rest}>
      {progress === undefined ? null : <ProgressFill percent={progress.percent} label={progress.label} />}
      {lead === undefined || lead === null ? null : <span className="inline-message-lead">{lead}</span>}
      <div className="inline-message-text">
        {variant === 'field' ? <FadeText label={typeof children === 'string' ? children : undefined}>{children}</FadeText> : children}
      </div>
      {action === undefined ? null : <div className="inline-message-action">{action}</div>}
    </div>
  )
}
