import { appUpdates, extensions } from '../ipc.js'
import { useAppUpdate } from '../hooks/useAppUpdate.js'
import { useMessages } from '../messages/useMessages.js'
import { EntityLink } from './EntityLink.js'
import { IconCheck, RunningRing } from './icons.js'
import { InlineMessage } from './InlineMessage.js'
import { ModalDialog, ModalTitle } from './ModalDialog.js'
import { UpdateAction, updateLine } from './settings/AppUpdateSettings.js'
import type { AppUpdateStatus } from '../../shared/app-update.js'
import brandmark from '../../../resources/mark-64.png'
import './AboutDialog.css'

const RELEASES = 'https://github.com/shawnyin128/meridian/releases'

/** The small mark before the status line: a spinner while checking, a check once current or ready, else none. */
function statusMark(status: AppUpdateStatus) {
  if (status.phase === 'checking') return <RunningRing />
  if (status.phase === 'latest' || status.phase === 'ready') return <IconCheck />
  return null
}

function AboutBody({ status }: { status: AppUpdateStatus }) {
  const m = useMessages()
  return (
    <>
      <div className="about-head">
        <img className="about-mark" src={brandmark} alt="" />
        <div>
          <ModalTitle>Meridian</ModalTitle>
          <p className="about-version">{m.shell.about.version(status.current)}</p>
        </div>
      </div>
      <InlineMessage
        tone={status.phase === 'error' ? 'error' : status.phase === 'latest' ? 'done' : 'info'} variant="box" className="about-status"
        data-about-update={status.phase} lead={statusMark(status)}
        progress={status.phase === 'downloading' ? { percent: status.percent, label: updateLine(status, m) } : undefined}
      >
        {updateLine(status, m)}
      </InlineMessage>
      <div className="about-actions">
        <span className="about-link"><EntityLink kind="external" label={m.shell.about.releases} href={RELEASES} /></span>
        <UpdateAction
          status={status}
          onCheck={() => {
            void appUpdates.check()
            void extensions.checkLatest()
          }}
          onInstall={appUpdates.install}
          onDownload={(url) => { window.open(url) }}
        />
      </div>
    </>
  )
}

/** The app's name, version and self-update state, reached from the app menu. */
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const status = useAppUpdate()
  return (
    <ModalDialog
      open={open && status !== null} onOpenChange={onOpenChange} size="confirm" closable className="about-pop"
      contentProps={{
        // Focus the dialog itself so no button opens highlighted as if it were the default action.
        onOpenAutoFocus: (event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        },
      }}
    >
      {status === null ? null : <AboutBody status={status} />}
    </ModalDialog>
  )
}
