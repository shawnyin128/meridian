import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import type { Milestone } from '../../../shared/contract.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { DateButton } from '../FieldPickers.js'
import { FloatingTextEditor } from '../FloatingTextEditor.js'
import type { TimelinePoint, TimelineProject } from './TimelineBoard.js'

/**
 * Where the editor is open: naming a new milestone, or an existing one saved on `savedDate`, at a
 * canvas point; `date` is the day its date field shows.
 */
type MilestoneEdit =
  | ({ kind: 'new'; projectId: string; date: string } & TimelinePoint)
  | ({ kind: 'edit'; projectId: string; milestoneId: string; date: string; savedDate: string; title: string } & TimelinePoint)

/**
 * The one milestone editor of a timeline, shared by the overview and the project page. A click on a
 * project's milestone lane opens it at the click to name a new milestone on that day, and Enter or
 * Space on the lane opens it on today's date; a click on a diamond opens it at the diamond to rename,
 * re-date or delete that milestone. Its date field picks the day either way. Enter saves and then
 * closes it; leaving saves a changed name or date.
 * A rejected write keeps the editor and the typed text; if the editor moves to another milestone
 * while a write is in flight, that write finishing does not close the one it moved to. Esc closes it
 * from whichever element inside has focus, and so does a change of the board's period.
 * `projects` are the ones the board draws; `onCreate` and `onUpdate` return whether that write
 * succeeded. Returns the TimelineBoard props that open and show the editor, and `close`.
 */
export function useMilestoneEditor({ projects, onCreate, onUpdate, onDelete }: {
  projects: TimelineProject[]
  onCreate: (projectId: string, date: string, title: string) => Promise<boolean>
  onUpdate: (projectId: string, milestoneId: string, patch: Pick<Milestone, 'title' | 'date'>) => Promise<boolean>
  onDelete: (projectId: string, milestoneId: string) => void
}): {
  close: () => void
  board: {
    onMilestoneClick: (projectId: string, milestoneId: string, point: TimelinePoint) => void
    onMilestoneLaneClick: (projectId: string, date: string, point: TimelinePoint) => void
    onPeriodChange: () => void
    canvasOverlay: ReactNode
  }
} {
  const fmt = useFormat()
  const m = useMessages()
  const [edit, setEdit] = useState<MilestoneEdit | null>(null)
  const close = useCallback(() => setEdit(null), [])

  const overlay = (
    <FloatingTextEditor
      open={edit !== null}
      anchor={<span className="ganchor" style={{ left: edit?.left ?? 0, top: edit?.top ?? 0 }} />}
      // The date field changes `date` while the editor stays, so the key leaves the date out.
      editorKey={edit === null
        ? 'closed'
        : `${edit.kind}/${edit.projectId}/${edit.kind === 'edit' ? edit.milestoneId : ''}/${edit.left}`}
      title={edit === null
        ? m.project.plan.milestoneMode
        : m.research.overview.milestonePopTitle(edit.kind !== 'edit', fmt.date(edit.date))}
      initialValue={edit?.kind === 'edit' ? edit.title : ''} placeholder={m.project.plan.milestoneNamePlaceholder}
      field={edit === null
        ? undefined
        : <DateButton appearance="field" iso={edit.date} onPick={(date) => setEdit((held) => held && { ...held, date })} />}
      fieldChanged={edit?.kind === 'edit' && edit.date !== edit.savedDate}
      onSubmit={(title) => edit === null
        ? false
        : edit.kind === 'edit'
          ? onUpdate(edit.projectId, edit.milestoneId, { title, date: edit.date })
          : onCreate(edit.projectId, edit.date, title)}
      onClose={close}
      {...(edit?.kind === 'edit'
        ? { onDelete: () => onDelete(edit.projectId, edit.milestoneId) }
        : {})}
    />
  )

  return {
    close,
    board: {
      onMilestoneClick: (projectId, milestoneId, point) => {
        const milestone = projects.find((project) => project.id === projectId)
          ?.milestones.find((item) => item.id === milestoneId)
        if (!milestone) return
        setEdit({
          kind: 'edit', projectId, milestoneId, date: milestone.date, savedDate: milestone.date, title: milestone.title, ...point,
        })
      },
      onMilestoneLaneClick: (projectId, date, point) => setEdit({ kind: 'new', projectId, date, ...point }),
      onPeriodChange: close,
      canvasOverlay: overlay,
    },
  }
}
