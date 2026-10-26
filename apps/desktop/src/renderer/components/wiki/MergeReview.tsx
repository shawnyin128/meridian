import { Fragment } from 'react'
import type { WikiMergePreview } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { CommitActions } from '../CommitActions.js'
import { DiffLines } from '../DiffLines.js'
import { ModalDialog } from '../ModalDialog.js'
import { SectionHeading } from '../PageShell.js'

/**
 * The confirmation of merging page `from` into page `into`: every line the merge changes, page by
 * page under each page's name, as `preview` gives them. Merge hands back to `onMerge`, which writes
 * what was shown; Cancel and closing the dialog go to `onCancel`. While `merging`, both are held.
 */
export function MergeReview({ from, into, preview, merging, onMerge, onCancel }: {
  from: string
  into: string
  preview: WikiMergePreview
  merging: boolean
  onMerge: () => void
  onCancel: () => void
}) {
  const m = useMessages()
  return (
    <ModalDialog
      open onOpenChange={(open) => { if (!open) onCancel() }} size="wide"
      title={m.wiki.merge.title(from, into)}
      actions={(
        <CommitActions
          place="foot" onCancel={onCancel} onSave={onMerge} saving={merging}
          saveLabel={m.wiki.merge.confirm} busyLabel={m.wiki.merge.merging}
        />
      )}
    >
      {preview.pages.map((page) => (
        <Fragment key={page.id}>
          <SectionHeading level="group">{page.title}</SectionHeading>
          <DiffLines lines={page.lines} />
        </Fragment>
      ))}
    </ModalDialog>
  )
}
