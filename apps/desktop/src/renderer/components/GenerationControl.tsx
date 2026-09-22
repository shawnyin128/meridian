import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useMessages } from '../messages/useMessages.js'
import './GenerationControl.css'

const Arrow = () => (
  <svg
    className="generation-idle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
  >
    <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
  </svg>
)

const RunningGlyph = () => (
  <span className="generation-running-glyph" aria-hidden="true">
    <svg className="generation-spinner" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
    </svg>
    <svg className="generation-stop" viewBox="0 0 24 24">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  </span>
)

/** One shared start, running, and stop control for user-triggered generation. */
export function GenerationControl({
  running, onStart, onStop, idleContent, showStatusText = false,
  idleLabel, runningLabel, className = '', disabled, ...props
}: {
  running: boolean
  onStart?: () => void
  onStop: () => void
  idleContent?: ReactNode
  showStatusText?: boolean
  idleLabel?: string
  runningLabel?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick' | 'aria-label'>) {
  const m = useMessages()
  const idle = idleLabel ?? m.common.generation.start
  const runningHint = runningLabel ?? m.common.generation.runningHint
  return (
    <button
      {...props}
      type="button"
      className={`generation-control${running ? ' is-running' : ''}${className ? ` ${className}` : ''}`}
      aria-label={running ? runningHint : idle}
      title={running ? runningHint : idle}
      disabled={disabled}
      onClick={running ? onStop : onStart}
    >
      {running ? <RunningGlyph /> : idleContent ?? <Arrow />}
      {running && showStatusText ? (
        <span className="generation-status-copy">
          {/* No trailing ellipsis: this button-label pairs with the spinning RunningGlyph icon, which already reads as in-progress. */}
          <span className="generation-running-copy">{m.common.generation.running}</span>
          <span className="generation-stop-copy">{m.common.generation.stop}</span>
        </span>
      ) : null}
    </button>
  )
}
