import type { ReactNode } from 'react'
import { FormButton } from '../FormControls.js'
import './ServiceCard.css'

/** Card container for one external service's settings: a status head, field rows, and a foot with actions. */
export function ServiceCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className === undefined ? 'service-card' : `service-card ${className}`}>{children}</div>
}

/** Status head: the service's name and one-line description on the left, a configured/not-configured pill on the right. */
export function ServiceStatus({
  title, description, configured, configuredLabel, notConfiguredLabel,
}: {
  title: ReactNode
  description: ReactNode
  configured: boolean
  configuredLabel: string
  notConfiguredLabel: string
}) {
  return (
    <div className="service-status-head">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <span className={configured ? 'service-status-pill ready' : 'service-status-pill'}>
        {configured ? configuredLabel : notConfiguredLabel}
      </span>
    </div>
  )
}

/** One labeled settings row: a fixed-width label on the left, the field's control on the right. */
export function ServiceField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="service-field">
      <span>{label}</span>
      {children}
    </div>
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

/** One connection-check outcome line, with an optional diagnostic detail shown only on failure. */
export function ServiceConnectionStatus({ state, message, detail, detailLabel }: {
  state: 'connected' | 'failed'
  message: string
  detail?: string | undefined
  detailLabel?: string | undefined
}) {
  return (
    <div className={`service-connection-status ${state}`} role={state === 'failed' ? 'alert' : 'status'}>
      <span>{message}</span>
      {state === 'failed' && detail !== undefined ? (
        <span className="service-connection-detail">{detailLabel}: {detail}</span>
      ) : null}
    </div>
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
    <button
      className={pending ? 'btn service-clear-key on' : 'btn service-clear-key'}
      aria-pressed={pending}
      onClick={onClick}
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

/** Inline error text below a service card's fields. */
export function ServiceError({ children }: { children: ReactNode }) {
  return <p className="service-error" role="alert">{children}</p>
}
