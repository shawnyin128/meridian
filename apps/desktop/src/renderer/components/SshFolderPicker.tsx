import { useCallback, useEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import type { SshFolders } from '../../shared/contract.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { ssh } from '../ipc.js'
import { errorLabel } from '../lib/failure-label.js'
import { commitKeys } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { CommitActions } from './CommitActions.js'
import { EmptyState } from './EmptyState.js'
import { FadeText } from './FadeText.js'
import { FormInput } from './FormControls.js'
import { IconButton } from './IconButton.js'
import { IconEnclosingFolder, IconFolder, IconNext } from './icons.js'
import { InlineMessage } from './InlineMessage.js'
import { LoadingPlaceholder } from './LoadingPlaceholder.js'
import { ModalDialog, ModalTitle } from './ModalDialog.js'
import { PickerPopover, PickOption } from './PickerPopover.js'
import { Item } from './Item.js'
import { List } from './List.js'
import './SshFolderPicker.css'

/** One folder of an SSH host, as Core listed it. */
export type SshFolder = Extract<SshFolders, { state: 'ready' }>

/** Where a folder is listed from: a host name or `Host` alias, and the port when it is not the default. */
export type SshTarget = { host: string; port?: number }

/** Choosing a folder of an SSH host: the connection, the folder it shows, and how its listing went. */
export type SshFolderChoice = {
  /** The folder shown, null until a connection has listed the remote home. */
  folder: SshFolder | null
  /** Whether a folder is being listed. */
  opening: boolean
  /** Why the latest listing failed, until another starts. */
  issue: string | null
  /** The path field's text: the folder shown's path, or a path typed and not yet gone to. */
  path: string
  /** Whether `path` is a path typed and not yet gone to, so choosing now would not choose it. */
  edited: boolean
  /** Changes the path field's text. */
  type: (path: string) => void
  /** Connects to `target` and lists its remote home. */
  connect: (target: SshTarget) => void
  /** Lists the folder at `path` of the host connected to: absolute, `~` or a path under `~/`. */
  open: (path: string) => void
  /** Drops the connection, the folder shown and any listing still on its way. */
  reset: () => void
}

/**
 * Lists folders of one SSH host through Core, one folder at a time. A listing's answer is dropped
 * once a later one started or `reset` ran. A failed connection leaves `folder` null; a folder that
 * fails to open leaves the one shown, and the path field's text as it was. Either failure stands as
 * `issue`. Each folder listed puts its path in the path field.
 */
export function useSshFolders(): SshFolderChoice {
  const m = useMessages()
  const [folder, setFolder] = useState<SshFolder | null>(null)
  const [opening, setOpening] = useState(false)
  const [issue, setIssue] = useState<string | null>(null)
  const [path, type] = useState('')
  const connected = useRef<SshTarget | null>(null)
  const latest = useRef(0)

  const list = useCallback((target: SshTarget, at?: string) => {
    const mine = ++latest.current
    setOpening(true)
    setIssue(null)
    void ssh.folders({ ...target, ...(at === undefined ? {} : { path: at }) }).then((listed) => {
      if (mine !== latest.current) return
      setOpening(false)
      if (listed.state === 'ready') {
        connected.current = target
        setFolder(listed)
        type(listed.path)
      } else setIssue(listed.issue)
    }, (error: unknown) => {
      if (mine !== latest.current) return
      setOpening(false)
      setIssue(errorLabel(m, error))
    })
  }, [m])

  const open = useCallback((at: string) => {
    if (connected.current !== null) list(connected.current, at)
  }, [list])

  const reset = useCallback(() => {
    latest.current += 1
    connected.current = null
    setFolder(null)
    setOpening(false)
    setIssue(null)
    type('')
  }, [])

  const edited = folder !== null && path !== folder.path
  return { folder, opening, issue, path, edited, type, connect: list, open, reset }
}

/**
 * The host field of an SSH connection. It offers the user's `Host` aliases that contain the typed
 * text, read once when it mounts, and keeps whatever host is typed. Typing, a click or ↓ shows the
 * aliases; the arrow keys or the pointer move through them, and Enter or a click puts one in the
 * field, after which Enter submits the form it sits in. Esc or leaving the field hides them. A failed
 * read of the aliases goes to `onError`; other props go to the input.
 */
export function SshHostField({ value, onValue, onError, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValue: (host: string) => void
  onError: (error: unknown) => void
}) {
  const [hosts, setHosts] = useState<readonly string[]>([])
  const [shown, setShown] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    void ssh.hosts().then(setHosts, onError)
  }, [onError])

  const typed = value.trim()
  const hits = shown ? hosts.filter((host) => host !== typed && host.toLowerCase().includes(typed.toLowerCase())) : []
  const choose = (host: string) => {
    onValue(host)
    setShown(false)
  }
  const keys = useCandidateKeys(hits.length, (index) => choose(hits[index]!))
  return (
    <PickerPopover
      open={hits.length > 0} anchorRef={input} onOpenChange={setShown}
      content={hits.length === 0 ? null : hits.map((host, index) => (
        <PickOption key={host} keys={keys} index={index} onClick={() => choose(host)}>{host}</PickOption>
      ))}
      anchor={(
        <FormInput
          {...props} ref={input} value={value} autoComplete="off" spellCheck={false}
          onChange={(event) => {
            onValue(event.target.value)
            setShown(true)
          }}
          onClick={() => setShown(true)}
          onBlur={() => setShown(false)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') setShown(true)
            // Enter on an alias puts it in the field instead of submitting the form.
            if (event.key === 'Enter' && hits.length > 0) event.preventDefault()
            keys.onKeyDown(event)
          }}
        />
      )}
    />
  )
}

/**
 * The folder `choice` shows, browsed like a local one: the control that opens the folder holding it,
 * its path as a field, then its subfolders, each of which opens on a click. Enter in the field goes
 * to the path typed there and keeps focus in the field; while the field holds a path not gone to, Esc
 * puts back the folder shown instead of closing the dialog. The list keeps the height of five rows
 * and scrolls inside. While a folder loads, the list shows the loading state; the choice's issue
 * shows under it. A folder opened from a subfolder or the enclosing-folder control while focus is in
 * the browser leaves focus on the first subfolder once its listing settles, or on the
 * enclosing-folder control when there is none. Until the choice shows a folder, the enclosing-folder
 * control is held and the list holds no rows.
 */
export function SshFolderBrowser({ choice }: { choice: SshFolderChoice }) {
  const m = useMessages()
  const browser = useRef<HTMLDivElement>(null)
  const up = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const { folder, opening, issue, edited } = choice
  const openFrom = (path: string) => {
    refocus.current = browser.current?.contains(document.activeElement) === true
    choice.open(path)
  }
  useEffect(() => {
    if (opening || !refocus.current) return
    refocus.current = false
    const first = browser.current?.querySelector<HTMLElement>('.ssh-folder-row')
    if (first !== null && first !== undefined) first.focus()
    else up.current?.focus()
  }, [opening])

  return (
    <div ref={browser} className="ssh-folders" aria-busy={opening || undefined}>
      <div className="ssh-folders-head">
        <IconButton
          ref={up} size="nested" label={m.common.sshFolders.up} disabled={folder === null || folder.parent === null}
          onClick={() => { if (folder !== null && folder.parent !== null) openFrom(folder.parent) }}
        ><IconEnclosingFolder /></IconButton>
        <FormInput
          className="ssh-folders-path" value={choice.path} aria-label={m.common.sshFolders.path}
          spellCheck={false} autoComplete="off" data-inline-draft={edited ? '' : undefined}
          onChange={(event) => choice.type(event.target.value)}
          onKeyDown={commitKeys({
            onSave: () => {
              refocus.current = false
              if (choice.path.trim() !== '') choice.open(choice.path.trim())
            },
            ...(edited && folder !== null ? { onCancel: () => choice.type(folder.path) } : {}),
          })}
        />
      </div>
      <div className="ssh-folders-list">
        {opening
          ? <LoadingPlaceholder shape="rows" />
          : folder === null
            ? null
            : folder.folders.length === 0
              ? <EmptyState variant="section" />
              : (
                <List variant="embedded" rows="fill" aria-label={folder.path}>
                  {folder.folders.map((child) => (
                    <Item
                      key={child.path} className="ssh-folder-row" onActivate={() => openFrom(child.path)}
                      leading={<IconFolder />} title={<FadeText className="ssh-folder-name" label={child.name}>{child.name}</FadeText>}
                      trailing={<IconNext />}
                    />
                  ))}
                </List>
              )}
      </div>
      {issue === null ? null : <InlineMessage tone="error" variant="line">{issue}</InlineMessage>}
    </div>
  )
}

/**
 * The folder picker of an SSH host, a dialog stacked on whatever opened it. While `target` is not
 * null it is open, connects to `target` and browses from its remote home in a `SshFolderBrowser`.
 * Choose hands the folder shown to `onChoose`; it is held until a folder is shown, while the next one
 * lists and while the path field holds a path not gone to. Cancel, Esc and the scrim call `onClose`.
 * Closing drops the connection and any listing still on its way.
 */
export function SshFolderPicker({ target, onChoose, onClose }: {
  target: SshTarget | null
  onChoose: (path: string) => void
  onClose: () => void
}) {
  const m = useMessages()
  const choice = useSshFolders()
  const { connect, reset } = choice
  const host = target?.host
  const port = target?.port
  useEffect(() => {
    if (host === undefined) return
    connect({ host, ...(port === undefined ? {} : { port }) })
    return reset
  }, [host, port, connect, reset])

  const { folder } = choice
  return (
    <ModalDialog
      open={target !== null} onOpenChange={(open) => { if (!open) onClose() }} size="form" className="ssh-folder-picker"
      actions={(
        <CommitActions
          place="foot" onCancel={onClose} saveLabel={m.common.sshFolders.choose}
          canSave={folder !== null && !choice.opening && !choice.edited}
          onSave={() => { if (folder !== null) onChoose(folder.path) }}
        />
      )}
    >
      <ModalTitle hidden>{host}</ModalTitle>
      <SshFolderBrowser choice={choice} />
    </ModalDialog>
  )
}
