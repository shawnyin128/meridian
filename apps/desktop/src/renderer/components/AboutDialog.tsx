import { appUpdates } from '../ipc.js'
import { useAppUpdate } from '../hooks/useAppUpdate.js'
import { useMessages } from '../messages/useMessages.js'
import { ModalDialog, ModalTitle } from './ModalDialog.js'
import { UpdateAction, useUpdateSummary } from './settings/AppUpdateSettings.js'
import type { AppUpdateStatus } from '../../shared/app-update.js'

const RELEASES = 'https://github.com/shawnyin128/meridian/releases'

function AboutBody({ status }: { status: AppUpdateStatus }) {
  const m = useMessages()
  const summary = useUpdateSummary(status)
  return (
    <div className="dlg about-dlg">
      <ModalTitle className="dlg-t">{m.shell.about.title}</ModalTitle>
      <p className="dlg-d">{m.settings.extensions.app.version(status.current)}</p>
      <p className="dlg-d" data-about-update={status.phase}>{summary}</p>
      <div className="dlg-a">
        <button className="btn" onClick={() => { window.open(RELEASES) }}>{m.shell.about.releases}</button>
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

/** The app's version and self-update state, reached from the app menu. */
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const status = useAppUpdate()
  return (
    <ModalDialog open={open && status !== null} onOpenChange={onOpenChange} contentClassName="ctxmenu cfpop">
      {status === null ? null : <AboutBody status={status} />}
    </ModalDialog>
  )
}
