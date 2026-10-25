import { useEffect, useRef, useState } from 'react'
import { SearchField } from '../components/ClearableInput.js'
import { EmptyState } from '../components/EmptyState.js'
import { ModalDialog, ModalTitle } from '../components/ModalDialog.js'
import { PickOption } from '../components/PickerPopover.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { composing } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'

/** A command the palette runs: its label, the shortcut that also runs it, if any, and what it does. */
export type PaletteCommand = { label: string; shortcut?: string; run: () => void }

/**
 * The palette's field and rows; it mounts with every opening, so each opening starts empty. An empty
 * field lists every command; text narrows them to those whose label holds it, compared without
 * case. The chosen command goes to `onCommand`.
 */
function PaletteBody({ commands, onCommand }: {
  commands: readonly PaletteCommand[]
  onCommand: (command: PaletteCommand) => void
}) {
  const m = useMessages()
  const [q, setQ] = useState('')
  const list = useRef<HTMLDivElement | null>(null)
  const listFade = useScrollFade('y', list)

  const needle = q.trim().toLowerCase()
  const shown = commands.filter((command) => command.label.toLowerCase().includes(needle))
  const choose = (at: number) => onCommand(shown[at]!)
  const keys = useCandidateKeys(shown.length, choose)

  // Rows moved to with the arrow keys can be below the fold of the list.
  useEffect(() => {
    list.current?.querySelector('.rrow.on')?.scrollIntoView({ block: 'nearest' })
  }, [keys.active])

  return (
    <>
      <ModalTitle className="cmdk-title">{m.shell.palette.title}</ModalTitle>
      <SearchField
        wrapperClassName="cmdk-field" id="cmdkq" placeholder={m.shell.palette.placeholder} autoComplete="off" value={q}
        onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')}
        onKeyDown={(e) => {
          if (composing(e.nativeEvent)) return
          keys.onKeyDown(e)
          // The Enter that chooses must not also press whatever the chosen row opens, such as a dialog's close button.
          if (e.key === 'Enter') e.preventDefault()
        }}
      />
      <div className="cmdk-list" ref={listFade}>
        {shown.map((command, at) => (
          <PickOption keys={keys} index={at} key={command.label} onClick={() => choose(at)}>
            {command.label}
            {command.shortcut === undefined ? null : <span className="mi-key">{command.shortcut}</span>}
          </PickOption>
        ))}
        {shown.length === 0 ? <EmptyState variant="section">{m.shell.search.noHits}</EmptyState> : null}
      </div>
    </>
  )
}

/**
 * The command palette, a dialog over the current screen, the reader included, that runs `commands`
 * and nothing else: entities are found through the global search. Choosing a row closes the
 * palette, then runs the command, and leaves focus to wherever that lands; Escape or a press
 * outside closes it and gives focus back to where it was. The arrow keys and the pointer move one
 * active row, and Enter chooses it.
 */
export function CommandPalette({ open, onOpenChange, commands }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: readonly PaletteCommand[]
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
      <PaletteBody commands={commands} onCommand={(command) => close(command.run)} />
    </ModalDialog>
  )
}
