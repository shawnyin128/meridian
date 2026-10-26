import type { ReactNode } from 'react'
import { FadeText } from './FadeText.js'
import { InlineField } from './InlineField.js'

/** Where a TitleField keeps the title being typed (see `useDrafts`). */
export type TitleKeep = { scope: readonly string[]; target: string }

/**
 * A page's or a panel's title that renames in place when it is clicked: at rest `children`, or
 * `value`, on one line that fades where it does not fit, and while it is edited the shared inline
 * field (InlineField) at the title's own size. Enter or a press outside saves through `onSave`,
 * Escape discards, an empty name is refused and leaves the field open, and what is typed is kept
 * under `keep` as a draft, so it comes back after a restart. `label` names the field.
 */
export function TitleField({ label, value, children, onSave, keep }: {
  label: string
  value: string
  children?: ReactNode
  onSave: (title: string) => boolean | Promise<boolean>
  keep: TitleKeep
}) {
  return (
    <InlineField
      label={label} value={value} display={<FadeText label={value}>{children ?? value}</FadeText>}
      variant="title" keep={keep} normalize={(next) => next.trim()} validate={(next) => next !== ''}
      onSave={onSave}
    />
  )
}
