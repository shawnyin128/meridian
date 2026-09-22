import type { AppUpdateStatus } from '../../../shared/app-update.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'

export interface AppUpdateEntryProps {
  status: AppUpdateStatus
  onCheck: () => void
  onInstall: () => void
  onDownload: (url: string) => void
}

/** Local calendar day of an ISO time, as YYYY-MM-DD. */
function localDay(iso: string): string {
  const at = new Date(iso)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

/** The app's row in the extension list: its version, self-update state, and the one action that state allows. */
export function AppUpdateEntry({ status, onCheck, onInstall, onDownload }: AppUpdateEntryProps) {
  const m = useMessages()
  const fmt = useFormat()
  const copy = m.settings.extensions.app
  const line = (() => {
    switch (status.phase) {
      case 'unsupported': return copy.phase.unsupported
      case 'idle': return copy.phase.idle
      case 'checking': return copy.phase.checking
      case 'latest': return copy.phase.latest
      case 'downloading': return copy.phase.downloading(status.version, status.percent)
      case 'ready': return copy.phase.ready(status.version)
      case 'available': return copy.phase.available(status.version)
      case 'error': return copy.phase.error(status.message)
    }
  })()
  const action = status.phase === 'ready'
    ? <button className="btn pri" onClick={onInstall}>{copy.restart}</button>
    : status.phase === 'available'
      ? <button className="btn pri" onClick={() => onDownload(status.url)}>{copy.download}</button>
      : (
        <button
          className="btn" onClick={onCheck}
          disabled={status.phase === 'unsupported' || status.phase === 'checking' || status.phase === 'downloading'}
        >{copy.check}</button>
      )

  return (
    <section className="extension-entry" data-app-update={status.phase}>
      <div className="extension-head">
        <div>
          <h3>{copy.name}</h3>
          <p>
            {line}
            {status.checkedAt === undefined ? '' : ` · ${copy.checkedAt(fmt.date(localDay(status.checkedAt)))}`}
          </p>
        </div>
        <div className="extension-head-side">
          <span className="extension-state">{copy.version(status.current)}</span>
          {action}
        </div>
      </div>
    </section>
  )
}
