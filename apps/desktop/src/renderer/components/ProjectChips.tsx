import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaperRow, ProjectSummary } from '../../shared/contract.js'
import { project } from '../ipc.js'
import { CandidateField } from './CandidateField.js'
import { ChipList } from './ChipList.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { NO_TRIGGERS } from '../hooks/useOnLeave.js'
import { useDrafts } from '../hooks/useDrafts.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useMessages } from '../messages/useMessages.js'
import { useJump } from '../shell/AppShell.js'
import { FormInput } from './FormControls.js'

/**
 * The projects of a paper, on ChipList: one chip per project, whose name opens the project and whose ×
 * removes the paper from that project; the "+" at the end picks a project this paper is not linked to
 * yet. A write bumps the vault revision by itself, and the current screen refetches on its own.
 */
export function ProjectChips({ paper, onError }: {
  paper: PaperRow
  onError: (error: Error) => void
}) {
  const m = useMessages()
  const { open: jumpTo } = useJump()
  // The project name being typed is kept as a draft of the paper, and opens the input again.
  const kept = useDrafts<string>(['paper', paper.id])
  const query = kept.get('add-project') ?? ''
  const open = kept.get('add-project') !== undefined
  const setOpen = (next: boolean) => { if (next) kept.set('add-project', query) }
  const setQuery = (next: string) => kept.set('add-project', next)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const input = useRef<HTMLInputElement>(null)
  const write = useVaultWrite()
  const undo = useUndo()
  const close = useCallback(() => kept.drop('add-project'), [kept])

  useEffect(() => {
    if (!open) return
    void project.list().then(setProjects).catch(onError)
  }, [open, onError])

  const needle = query.trim().toLowerCase()
  const hits = open
    ? projects.filter((held) => !paper.projects.some((linked) => linked.id === held.id)
      && (!needle || held.name.toLowerCase().includes(needle)))
    : []
  const add = (target: ProjectSummary) => write(project.addPaper(target.id, paper.id))
  const draft = useInlineDraft({
    row: input, triggers: NO_TRIGGERS, onCancel: close, isEmpty: () => needle === '',
    onSubmit: () => (hits[0] === undefined ? false : add(hits[0])),
  })
  const keys = useCandidateKeys(hits.length, (i) => draft.submit(() => add(hits[i]!)))

  return (
    <ChipList
      chips={paper.projects.map((linked) => ({
        id: linked.id,
        name: linked.name,
        onOpen: () => jumpTo('project', linked.id),
        data: { 'data-project': linked.id },
        remove: {
          label: m.common.removeLink,
          onRemove: () => {
            void write(project.removePaper(linked.id, paper.id), { note: m.research.chips.unlinked, action: undo.change })
          },
        },
      }))}
      add={{
        label: m.research.chips.addProject,
        onAdd: () => setOpen(true),
        draft: open
          ? (
            <CandidateField
              anchorRef={input} keys={keys} heading={m.research.chips.pickerHeading}
              field={(
                <FormInput
                  appearance="inline" className="tagin" ref={input} value={query}
                  placeholder={m.project.identity.nameFieldLabel}
                  {...draft.inputProps} onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { keys.onKeyDown(event); draft.inputProps.onKeyDown(event) }}
                />
              )}
              candidates={hits.map((held) => ({ id: held.id, label: held.name }))}
              onPick={(_, i) => draft.submit(() => add(hits[i]!))}
            />
          )
          : undefined,
      }}
    />
  )
}
