import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaperRow, ProjectSummary } from '../../shared/contract.js'
import { project } from '../ipc.js'
import { AddAction } from './AddAction.js'
import { IconCross } from './icons.js'
import { PickerPopover } from './PickerPopover.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { NO_TRIGGERS } from '../hooks/useCancelOnOutside.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useMessages } from '../messages/useMessages.js'
import { FormInput } from './FormControls.js'

/**
 * A project with a paper: one chip per project, the × on the chip removes the paper from the project;
 * Use the "+" at the end to select a project that has not yet been linked to this article. After writing, the whole library version will be automatically incremented, and the current screen will be retrieved by itself.
 */
export function ProjectChips({ paper, onError }: {
  paper: PaperRow
  onError: (error: Error) => void
}) {
  const m = useMessages()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const input = useRef<HTMLInputElement>(null)
  const write = useVaultWrite()
  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

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
    project.addPaper(target.id, paper.id), { note: m.research.chips.linked(target.name) },
  )
  const draft = useInlineDraft({
    row: input, triggers: NO_TRIGGERS, onCancel: close,
    onSubmit: () => (hits[0] === undefined ? false : add(hits[0])),
  })
  const keys = useCandidateKeys(hits.length, (i) => draft.submit(() => add(hits[i]!)))

  return (
    <>
      {paper.projects.map((linked) => (
        <span className="tagchip" key={linked.id} data-project={linked.id}>{linked.name}
          <button
            className="rx" title={m.common.removeLink}
            onClick={(event) => {
              event.stopPropagation()
              void write(project.removePaper(linked.id, paper.id), {
                note: m.research.chips.unlinked,
              })
            }}
          ><IconCross sw={2.5} /></button>
        </span>
      ))}
      <PickerPopover
        open={open} anchorRef={input} stopClickPropagation
        anchor={open
          ? (
            <FormInput
              className="tagin" ref={input} value={query} placeholder={m.project.identity.nameFieldLabel}
              {...draft.inputProps} onClick={(event) => event.stopPropagation()}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { keys.onKeyDown(event); draft.inputProps.onKeyDown(event) }}
            />
          )
          : (
            <AddAction
              variant="icon" className="tagchip tagadd" title={m.research.chips.addProject}
              onClick={(event) => { event.stopPropagation(); setOpen(true) }}
            />
          )}
        content={hits.length > 0
          ? (
            <>
              <div className="rh">{m.research.chips.pickerHeading}</div>
              {hits.map((held, i) => (
                <div
                  className={i === keys.active ? 'rrow on' : 'rrow'} key={held.id}
                  onClick={() => draft.submit(() => add(held))}
                >{held.name}</div>
              ))}
            </>
          )
          : null}
      />
    </>
  )
}
