import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '../../shared/contract.js'
import { search } from '../ipc.js'
import { ClearableInput } from '../components/ClearableInput.js'
import { EmptyState } from '../components/EmptyState.js'
import { IconSearch } from '../components/icons.js'
import { ModalDialog, ModalTitle } from '../components/ModalDialog.js'
import { PickOption } from '../components/PickerPopover.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { composing } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { HitOption } from './SearchBox.js'

/** A command the palette runs: its label, the shortcut that also runs it, if any, and what it does. */
export type PaletteCommand = { label: string; shortcut?: string; run: () => void }

/**
 * The palette's field and rows; it mounts with every opening, so each opening starts empty. An empty
 * field lists every command; text narrows them to those whose label holds it, compared without
 * case, and lists after them the hits search.query returns for it. The chosen row goes to `onCommand`
 * or `onHit`.
 */
function PaletteBody({ commands, onCommand, onHit }: {
  commands: readonly PaletteCommand[]
  onCommand: (command: PaletteCommand) => void
  onHit: (hit: SearchHit) => void
}) {
  const m = useMessages()
  const [q, setQ] = useState('')
  // The hits of the last query answered; a newer query keeps showing them until its own arrive.
  const [found, setFound] = useState<{ q: string; hits: SearchHit[] } | null>(null)
  const list = useRef<HTMLDivElement | null>(null)
  const listFade = useScrollFade('y', list)

  useEffect(() => {
    if (q.trim() === '') {
      setFound(null)
      return
    }
    let live = true
    void search.query(q).then((hits) => { if (live) setFound({ q, hits }) })
    return () => { live = false }
  }, [q])

  const needle = q.trim().toLowerCase()
  const shown = commands.filter((command) => command.label.toLowerCase().includes(needle))
  const hits = found?.hits ?? []
  const choose = (at: number) => {
    if (at < shown.length) onCommand(shown[at]!)
    else onHit(hits[at - shown.length]!)
  }
  const keys = useCandidateKeys(shown.length + hits.length, choose)

  // Rows moved to with the arrow keys can be below the fold of the list.
  useEffect(() => {
    list.current?.querySelector('.rrow.on')?.scrollIntoView({ block: 'nearest' })
  }, [keys.active])

  return (
    <>
      <ModalTitle className="cmdk-title">{m.shell.palette.title}</ModalTitle>
      <ClearableInput
        wrapperClassName="cmdk-field" id="cmdkq" placeholder={m.shell.palette.placeholder} autoComplete="off" value={q}
        onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')}
        onKeyDown={(e) => {
          if (composing(e.nativeEvent)) return
          keys.onKeyDown(e)
          // The Enter that chooses must not also press whatever the chosen row opens, such as a dialog's close button.
          if (e.key === 'Enter') e.preventDefault()
        }}
        leading={<IconSearch />}
      />
      <div className="cmdk-list" ref={listFade}>
        {shown.map((command, at) => (
          <PickOption keys={keys} index={at} key={command.label} onClick={() => choose(at)}>
            {command.label}
            {command.shortcut === undefined ? null : <span className="mi-key">{command.shortcut}</span>}
          </PickOption>
        ))}
        {/* Tasks of one project share its id as their target: kind plus target would collide. */}
        {hits.map((hit, at) => (
          <HitOption
            hit={hit} keys={keys} index={shown.length + at} key={`${at}${hit.kind}${hit.target}`}
            onChoose={() => choose(shown.length + at)}
          />
        ))}
        {shown.length === 0 && found?.q === q && hits.length === 0
          ? <EmptyState variant="section">{m.shell.search.noHits}</EmptyState>
          : null}
      </div>
    </>
  )
}

/**
 * The command palette, a dialog over the current screen, the reader included: it finds any entity
 * through the global search and runs `commands`. Choosing a row closes the palette, then runs the
 * command or hands the hit to `onHit`, and leaves focus to wherever that lands; Escape or a press
 * outside closes it and gives focus back to where it was. The arrow keys and the pointer move one
 * active row, and Enter chooses it.
 */
export function CommandPalette({ open, onOpenChange, commands, onHit }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: readonly PaletteCommand[]
  onHit: (hit: SearchHit) => void
}) {
  const [chosen, setChosen] = useState(false)
  useEffect(() => { if (open) setChosen(false) }, [open])

  const close = (then: () => void) => {
    setChosen(true)
    onOpenChange(false)
    then()
  }

  return (
    <ModalDialog open={open} onOpenChange={onOpenChange} size="form" className="cmdk" restoreFocus={!chosen}>
      <PaletteBody
        commands={commands} onCommand={(command) => close(command.run)} onHit={(hit) => close(() => onHit(hit))}
      />
    </ModalDialog>
  )
}
