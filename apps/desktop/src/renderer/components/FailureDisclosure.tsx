import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { FoldToggle } from './FoldToggle.js'
import { Icon } from './icons.js'
import { InlineMessage } from './InlineMessage.js'
import './FailureDisclosure.css'

/** One row of a failure's details: what it names, such as the step that failed, and the raw detail, if any, as code. */
export type FailureDetailRow = { label: string; code?: string | undefined }

/**
 * The one failure in place that unfolds into its details: an error mark, `summary` with the fold caret,
 * and right after it `action`, such as Retry; unfolded, each of `rows` on a line of its own under
 * the summary, its label followed by its code in a code chip.
 */
export function FailureDisclosure({ summary, rows, action }: {
  summary: ReactNode
  rows: readonly FailureDetailRow[]
  action?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="failure-disclosure">
      <InlineMessage
        tone="error" variant="line" action={action} actionAt="text"
        lead={<Icon><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></Icon>}
      >
        <FoldToggle open={open} onToggle={() => setOpen((was) => !was)} controls={id}>{summary}</FoldToggle>
      </InlineMessage>
      {open
        ? (
          <ul className="failure-details" id={id}>
            {rows.map((row, at) => (
              <li className="failure-detail" key={at}>
                <span className="failure-detail-label">{row.label}</span>
                {row.code === undefined ? null : <code className="failure-detail-code">{row.code}</code>}
              </li>
            ))}
          </ul>
        )
        : null}
    </div>
  )
}
