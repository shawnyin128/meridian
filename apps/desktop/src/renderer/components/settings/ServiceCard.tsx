import type { ReactNode } from 'react'
import { Card } from '../Card.js'
import { FormButton } from '../FormControls.js'
import { InlineMessage } from '../InlineMessage.js'
import { SectionHeading } from '../PageShell.js'
import { Tag } from '../Tag.js'
import { Button } from '../Button.js'
import './ServiceCard.css'

/** Card container for one external service's settings: a status head, field rows, and a foot with actions. */
export function ServiceCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={className === undefined ? 'service-card' : `service-card ${className}`}>{children}</Card>
}

/** Status head: the service's name and an optional line after it, and a configured/not-configured pill at its end. */
export function ServiceStatus({
  title, description, configured, configuredLabel, notConfiguredLabel,
}: {
  title: ReactNode
  description?: ReactNode
  configured: boolean
  configuredLabel: string
  notConfiguredLabel: string
}) {
  return (
    <SectionHeading
      level="group" meta={description}
      actions={(
        <Tag state={configured ? 'done' : undefined} className="service-status-pill">
          {configured ? configuredLabel : notConfiguredLabel}
        </Tag>
      )}
    >{title}
    </SectionHeading>
  )
}

/** A saved secret shown masked with its last four characters; clicking it starts editing. */
export function ServiceSavedKey({ ariaLabel, lastFour, onClick }: {
  ariaLabel: string
  lastFour: string | undefined
  onClick: () => void
}) {
  return (
    <FormButton appearance="field" className="service-saved-key" aria-label={ariaLabel} onClick={onClick}>
      <span className="service-key-mask" aria-hidden="true">••••••••</span>
      <span className="service-key-tail">{lastFour}</span>
    </FormButton>
  )
}

/** Card foot: connection status on the left when present, actions on the right. */
export function ServiceFoot({ children }: { children: ReactNode }) {
  return <div className="service-foot">{children}</div>
}

/** Right-aligned action button group inside a card foot. */
export function ServiceActions({ children }: { children: ReactNode }) {
  return <div className="service-actions">{children}</div>
}

/**
 * One connection-check outcome line: a success when it connected, an error with an optional diagnostic
 * detail under it when it failed.
 */
export function ServiceConnectionStatus({ state, message, detail, detailLabel }: {
  state: 'connected' | 'failed'
  message: string
  detail?: string | undefined
  detailLabel?: string | undefined
}) {
  return (
    <InlineMessage tone={state === 'failed' ? 'error' : 'done'} variant="line" className="service-connection-status">
      <div>{message}</div>
      {state === 'failed' && detail !== undefined ? (
        <div className="service-connection-detail">{detailLabel}: {detail}</div>
      ) : null}
    </InlineMessage>
  )
}

/** Toggle button for clearing a saved key on the next save, showing a pending state once armed. */
export function ServiceClearKeyButton({ pending, label, pendingLabel, onClick }: {
  pending: boolean
  label: string
  pendingLabel: string
  onClick: () => void
}) {
  return (
    <Button size="regular" tone={pending ? 'danger' : 'neutral'} className="service-clear-key" pressed={pending} onClick={onClick}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

/** The error line below a service card's fields. */
export function ServiceError({ children }: { children: ReactNode }) {
  return <InlineMessage tone="error" variant="line" className="service-error">{children}</InlineMessage>
}
