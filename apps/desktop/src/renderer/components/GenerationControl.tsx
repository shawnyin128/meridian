import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useMessages } from '../messages/useMessages.js'
import { RunningRing } from './icons.js'
import { Tooltip } from './Tooltip.js'
import { Button } from './Button.js'
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
    <RunningRing />
    <svg className="generation-stop" viewBox="0 0 24 24">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  </span>
)

/**
 * One shared start, running, and stop control for user-triggered generation. `disabled` disables the
 * start only: a running generation can always be stopped. With `showStatusText` it is a regular
 * Button whose label, while running, says it runs and, under the pointer or focus, that a press stops
 * it; otherwise it is the bare glyph button whose look its `className` gives.
 */
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
  const control = {
    ...props,
    className: `generation-control${running ? ' is-running' : ''}${className ? ` ${className}` : ''}`,
    'aria-label': running ? runningHint : idle,
    disabled: !running && disabled,
    onClick: running ? onStop : onStart,
  }
  const glyph = running ? <RunningGlyph /> : idleContent ?? <Arrow />
  return (
    <Tooltip label={running ? runningHint : idle}>
      {showStatusText
        ? (
          <Button {...control} size="regular" icon={glyph}>
            {running ? (
              <span className="generation-status-copy">
                {/* No trailing ellipsis: this button-label pairs with the spinning RunningGlyph icon, which already reads as in-progress. */}
                <span className="generation-running-copy">{m.common.generation.running}</span>
                <span className="generation-stop-copy">{m.common.generation.stop}</span>
              </span>
            ) : null}
          </Button>
        )
        : <button {...control} type="button">{glyph}</button>}
    </Tooltip>
  )
}
