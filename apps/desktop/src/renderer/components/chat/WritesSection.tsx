import { useId, type ReactNode } from 'react'
import { useMessages } from '../../messages/useMessages.js'
import { Card } from '../Card.js'
import { CommitActions } from '../CommitActions.js'
import { SectionHeading } from '../PageShell.js'
import './WritesSection.css'

/**
 * The section under an answer of what a confirmation writes: a group heading that folds `children`,
 * everything it writes, on the shared card, closed until `open`, marked as saved once `saved`. While
 * nothing is saved the card ends with Cancel, which folds it, and Confirm, `onConfirm`, busy while
 * `saving`. `onOpenChange` hears the heading fold and unfold it.
 */
export function WritesSection({ open, onOpenChange, saved, saving, onConfirm, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saved: boolean
  saving: boolean
  onConfirm: () => void
  children: ReactNode
}) {
  const m = useMessages()
  const d = m.chat.design
  const id = useId()
  return (
    <>
      <SectionHeading
        level="group" meta={saved ? d.savedAs : undefined}
        fold={{ open, onToggle: () => onOpenChange(!open), controls: id }}
      >{d.writes}</SectionHeading>
      {!open ? null : (
        <Card id={id}>
          <div className="writes">
            {children}
            {saved ? null : (
              <div className="writes-commit">
                <CommitActions place="item" onCancel={() => onOpenChange(false)} onSave={onConfirm} saving={saving} saveLabel={d.confirm} />
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  )
}
