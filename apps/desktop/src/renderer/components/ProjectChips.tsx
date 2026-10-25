import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaperRow, ProjectSummary } from '../../shared/contract.js'
import { project } from '../ipc.js'
import { AddAction } from './AddAction.js'
import { EntityLink } from './EntityLink.js'
import { IconButton } from './IconButton.js'
import { IconCross } from './icons.js'
import { PickerPopover, PickOption } from './PickerPopover.js'
import { tagClass } from './Tag.js'
import './TagChips.css'
import { TitleNote } from './TitleNote.js'
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
 * The projects of a paper: one chip per project, whose name opens the project and whose × removes the
 * paper from that project; the "+" at the end picks a project this paper is not linked to yet. A write
 * bumps the vault revision by itself, and the current screen refetches on its own.
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
  const add = (target: ProjectSummary) => write(
    project.addPaper(target.id, paper.id),
    { note: <TitleNote message={m.research.chips.linked} title={target.name} /> },
  )
  const draft = useInlineDraft({
    row: input, triggers: NO_TRIGGERS, onCancel: close, isEmpty: () => needle === '',
    onSubmit: () => (hits[0] === undefined ? false : add(hits[0])),
  })
  const keys = useCandidateKeys(hits.length, (i) => draft.submit(() => add(hits[i]!)))

  return (
    <>
      {paper.projects.map((linked) => (
        <span className={tagClass(undefined, 'chip', 'tagchip')} key={linked.id} data-project={linked.id}>
          <EntityLink kind="project" label={linked.name} onOpen={() => jumpTo('project', linked.id)} />
          <IconButton
            label={m.common.removeLink} size="inline" className="rx"
            onClick={(event) => {
              event.stopPropagation()
              void write(project.removePaper(linked.id, paper.id), {
                note: m.research.chips.unlinked, action: undo.change,
              })
            }}
          ><IconCross /></IconButton>
        </span>
      ))}
      <PickerPopover
        open={open} anchorRef={input} stopClickPropagation
        anchor={open
          ? (
            <FormInput
              appearance="inline" className="tagin" ref={input} value={query}
              placeholder={m.project.identity.nameFieldLabel}
              {...draft.inputProps} onClick={(event) => event.stopPropagation()}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { keys.onKeyDown(event); draft.inputProps.onKeyDown(event) }}
            />
          )
          : (
            <AddAction
              size="chip" className="tagchip tagadd" label={m.research.chips.addProject}
              onClick={(event) => { event.stopPropagation(); setOpen(true) }}
            />
          )}
        content={hits.length > 0
          ? (
            <>
              <div className="rh">{m.research.chips.pickerHeading}</div>
              {hits.map((held, i) => (
                <PickOption keys={keys} index={i} key={held.id} onClick={() => draft.submit(() => add(held))}>
                  {held.name}
                </PickOption>
              ))}
            </>
          )
          : null}
      />
    </>
  )
}
