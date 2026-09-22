import { appUpdates } from '../ipc.js'
import { useAppUpdate } from '../hooks/useAppUpdate.js'
import { useMessages } from '../messages/useMessages.js'
import { DownloadRing, IconCheck } from './icons.js'
import { ModalDialog, ModalTitle } from './ModalDialog.js'
import { PanelClose } from './PanelClose.js'
import { UpdateAction, updateLine } from './settings/AppUpdateSettings.js'
import type { AppUpdateStatus } from '../../shared/app-update.js'
import brandmark from '../../../resources/mark-64.png'
import './AboutDialog.css'

const RELEASES = 'https://github.com/shawnyin128/meridian/releases'

/** The small mark before the status line: a spinner while working, a check once current or ready. */
function StatusMark({ status }: { status: AppUpdateStatus }) {
  if (status.phase === 'checking') return <DownloadRing progress={null} />
  if (status.phase === 'downloading') {
    return <DownloadRing progress={{ received: status.percent, total: 100 }} />
  }
  if (status.phase === 'latest' || status.phase === 'ready') return <IconCheck />
  return null
}

function AboutBody({ status, onClose }: { status: AppUpdateStatus; onClose: () => void }) {
  const m = useMessages()
  return (
    <div className="about-dlg">
      <PanelClose onClose={onClose} className="about-close" />
      <div className="about-head">
        <img className="about-mark" src={brandmark} alt="" />
        <div>
          <ModalTitle className="about-name">Meridian</ModalTitle>
          <p className="about-version">{m.shell.about.version(status.current)}</p>
        </div>
      </div>
      <p className={`about-status is-${status.phase}`} data-about-update={status.phase}>
        <StatusMark status={status} />
        <span>{updateLine(status, m)}</span>
      </p>
      <div className="about-actions">
        <button type="button" className="about-link" onClick={() => { window.open(RELEASES) }}>
          {m.shell.about.releases}
        </button>
        <UpdateAction
          status={status}
          onCheck={() => { void appUpdates.check() }}
          onInstall={appUpdates.install}
          onDownload={(url) => { window.open(url) }}
        />
      </div>
    </div>
  )
}

/** The app's name, version and self-update state, reached from the app menu. */
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const status = useAppUpdate()
  return (
    <ModalDialog
      open={open && status !== null} onOpenChange={onOpenChange} contentClassName="ctxmenu cfpop about-pop"
      contentProps={{
        // Focus the dialog itself so no button opens highlighted as if it were the default action.
        onOpenAutoFocus: (event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        },
      }}
    >
      {status === null ? null : <AboutBody status={status} onClose={() => onOpenChange(false)} />}
    </ModalDialog>
  )
}
